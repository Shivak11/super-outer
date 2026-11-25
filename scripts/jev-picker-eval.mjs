#!/usr/bin/env node
/**
 * Measures the skill picker against what Claude actually loaded.
 *
 *   node scripts/jev-picker-eval.mjs extract [--days 60]
 *   node scripts/jev-picker-eval.mjs run [--limit 120] [--set heldout|unseen]
 *
 * `extract` reads Claude Code transcripts and writes one example per typed
 * request: the request and the skills Claude loaded before the next request.
 * It freezes about 30% of them as the held-out set the first time it runs,
 * and never rewrites that file, so later tuning cannot be fitted to it.
 *
 * `run` asks Jev about held-out requests and reports how often Jev's picks
 * contain a skill Claude loaded, how often Jev picks nothing when Claude loaded
 * nothing, how long Jev took and what it cost in input tokens.
 *
 * Request text is private conversation, so every file stays under
 * ~/.super-outer/jev-picker/eval and nothing is written into the repository.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { askJev } from "../src/jev/client.mjs";
import { loadSettings } from "../src/jev/settings.mjs";
import { baseName, isAlwaysAllowed, pickSkills } from "../src/jev/skill-picker.mjs";
import { claudeCodeRoster } from "../src/jev/skill-roster.mjs";

const HOME = os.homedir();
const OUT = path.join(HOME, ".super-outer", "jev-picker", "eval");
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(process.argv[at + 1]);
};

// Text the host wrote into a user turn, never typed by a person.
const HOST_TEXT = /^(<|Caveat:|This session is being continued|Base directory for this skill|\[Request interrupted|Stop hook feedback|# )/;

const typedText = (record) => {
  if (record.type !== "user" || record.isMeta || record.isSidechain || record.toolUseResult) return null;
  const content = record.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter((block) => block?.type === "text").map((block) => block.text).join("\n")
        : "";
  const trimmed = text.trim();
  if (trimmed.length < 8 || trimmed.length > 4000 || HOST_TEXT.test(trimmed)) return null;
  return trimmed;
};

function extract() {
  const days = arg("days", 60);
  const since = Date.now() - days * 86_400_000;
  const projects = path.join(HOME, ".claude", "projects");
  const examples = [];
  for (const folder of fs.readdirSync(projects)) {
    const dir = path.join(projects, folder);
    let files;
    try {
      files = fs.readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const name of files) {
      const file = path.join(dir, name);
      if (fs.statSync(file).mtimeMs < since) continue;
      let current = null;
      const flush = () => {
        if (current) examples.push(current);
        current = null;
      };
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        }
        const typed = typedText(record);
        if (typed !== null) {
          flush();
          current = { prompt: typed, loaded: [] };
          continue;
        }
        if (current && record.type === "assistant" && !record.isSidechain && Array.isArray(record.message?.content)) {
          for (const block of record.message.content) {
            if (block?.type === "tool_use" && block.name === "Skill" && typeof block.input?.skill === "string") {
              if (!current.loaded.includes(block.input.skill)) current.loaded.push(block.input.skill);
            }
          }
        }
      }
      flush();
    }
  }
  // The same request appears in forked and resumed sessions; keep one copy.
  const unique = new Map();
  for (const example of examples) {
    const key = example.prompt;
    const known = unique.get(key);
    unique.set(key, known ? { ...known, loaded: [...new Set([...known.loaded, ...example.loaded])] } : example);
  }
  const all = [...unique.values()];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "labelled.jsonl"), all.map((one) => JSON.stringify(one)).join("\n") + "\n", { mode: 0o600 });
  const heldOutFile = path.join(OUT, "heldout.jsonl");
  if (!fs.existsSync(heldOutFile)) {
    const heldOut = all.filter((one) => crypto.createHash("sha256").update(one.prompt).digest()[0] < 77);
    fs.writeFileSync(heldOutFile, heldOut.map((one) => JSON.stringify(one)).join("\n") + "\n", { mode: 0o600 });
    console.log(`froze ${heldOut.length} held-out requests`);
  } else {
    console.log("held-out set already frozen; left unchanged");
  }
  const withSkill = all.filter((one) => one.loaded.length > 0).length;
  console.log(`${all.length} typed requests, ${withSkill} with a skill load, from the last ${days} days`);
}

async function run() {
  const settings = loadSettings();
  if (!settings.key) throw new Error("No Super-outer Jev key is set, so nothing was sent.");
  const limit = arg("limit", 120);
  const readSet = (name) =>
    fs
      .readFileSync(path.join(OUT, name), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  // `--set unseen` uses the requests outside the held-out set. The held-out rows were read while the
  // picker was fixed on 13 October 2026, so the unseen rows are the clean measure of that version.
  const set = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] : "heldout";
  const frozen = readSet("heldout.jsonl");
  const frozenPrompts = new Set(frozen.map((one) => one.prompt));
  const heldOut = set === "unseen" ? readSet("labelled.jsonl").filter((one) => !frozenPrompts.has(one.prompt)) : frozen;
  // A prompt that repeats many times was written by a tool, not typed by a person.
  const prefixCounts = new Map();
  for (const line of fs.readFileSync(path.join(OUT, "labelled.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const prefix = JSON.parse(line).prompt.slice(0, 60);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
  const typed = (one) => (prefixCounts.get(one.prompt.slice(0, 60)) ?? 0) < 5;
  const roster = claudeCodeRoster();
  // Equal numbers with and without a skill load, each in file order, so the run is repeatable.
  const loads = heldOut.filter(typed).filter((one) => one.loaded.some((name) => !isAlwaysAllowed(name))).slice(0, Math.ceil(limit / 2));
  const none = heldOut.filter(typed).filter((one) => one.loaded.length === 0).slice(0, Math.floor(limit / 2));
  let tokens = 0;
  let calls = 0;
  const ask = async (state, questions) => {
    const answer = await askJev({ key: settings.key, state, questions, ...(settings.model ? { model: settings.model } : {}), timeoutMs: 2500 });
    calls += 1;
    if (!answer.ok) return null;
    tokens += answer.inputTokens ?? 0;
    return answer.answers;
  };
  const rows = [];
  for (const example of [...loads, ...none]) {
    const result = await pickSkills(example.prompt, roster, ask);
    rows.push({ ...example, picks: result.picks, ok: result.ok, ms: result.ms, gate: result.gate, named: result.named });
  }
  const answered = rows.filter((row) => row.ok);
  const wanted = (row) => row.loaded.filter((name) => !isAlwaysAllowed(name)).map(baseName);
  const hit = (row) => row.picks.map(baseName).some((name) => wanted(row).includes(name));
  const withLoad = answered.filter((row) => wanted(row).length > 0);
  const unnamed = withLoad.filter((row) => row.named.length === 0);
  const withoutLoad = answered.filter((row) => row.loaded.length === 0);
  const times = answered.map((row) => row.ms).sort((a, b) => a - b);
  const percent = (part, whole) => (whole === 0 ? "n/a" : `${Math.round((100 * part) / whole)}%`);
  const report = {
    date: new Date().toISOString().slice(0, 10),
    set,
    roster: roster.length,
    asked: rows.length,
    jevFailed: rows.length - answered.length,
    claudeLoadedJevAgreed: `${withLoad.filter(hit).length} of ${withLoad.length} (${percent(withLoad.filter(hit).length, withLoad.length)})`,
    sameWhenSkillNotNamed: `${unnamed.filter(hit).length} of ${unnamed.length} (${percent(unnamed.filter(hit).length, unnamed.length)})`,
    noneWhenClaudeLoadedNone: `${withoutLoad.filter((row) => row.picks.length === 0).length} of ${withoutLoad.length} (${percent(withoutLoad.filter((row) => row.picks.length === 0).length, withoutLoad.length)})`,
    medianMs: times[Math.floor(times.length / 2)] ?? null,
    slowest5PercentMs: times[Math.floor(times.length * 0.95)] ?? null,
    jevCalls: calls,
    inputTokensPerRequest: answered.length === 0 ? null : Math.round(tokens / answered.length),
  };
  fs.writeFileSync(path.join(OUT, `run-${report.date}-${set}.jsonl`), rows.map((row) => JSON.stringify(row)).join("\n") + "\n", { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}

const command = process.argv[2];
if (command === "extract") extract();
else if (command === "run") await run();
else console.log("usage: node scripts/jev-picker-eval.mjs extract|run");
