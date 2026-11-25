import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listPackageFiles } from "../scripts/build-package.mjs";

// 6.4.0 ships edge-cases beside the finders: the common ways a change can break.
const dir = path.resolve("skills", "edge-cases");
const read = (relative) => readFileSync(path.resolve(relative), "utf8");
const skill = () => readFileSync(path.join(dir, "SKILL.md"), "utf8");
const families = () => readFileSync(path.join(dir, "references", "families.md"), "utf8");

test("edge-cases: SKILL.md has two-key frontmatter that fits the Codex listing", () => {
  const front = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(skill());
  assert.ok(front, "SKILL.md starts with exactly name and description");
  assert.equal(front[1], "edge-cases");
  const description = front[2];
  assert.ok(description.length <= 600, `description is ${description.length} characters`);
  assert.ok(!description.includes(": ") && !description.includes(" #") && !/[<>]/.test(description), "plain YAML string");
  assert.match(description, /^Finds /);
  assert.match(description, /Use when/);
  assert.ok(skill().split("\n").length < 150, "SKILL.md stays short");
});

test("edge-cases: one reference, linked one level deep, with a table of contents", () => {
  assert.deepEqual(readdirSync(path.join(dir, "references")), ["families.md"]);
  assert.ok(skill().includes("](references/families.md)"));
  for (const [, target] of skill().matchAll(/\]\(([^)#]+)\)/g)) {
    if (!/^https?:/.test(target)) assert.ok(existsSync(path.join(dir, target)), target);
  }
  assert.match(families(), /^## Contents/m);
});

test("edge-cases: the reference holds all 14 families, each with signals and handling", () => {
  const text = families();
  for (let n = 1; n <= 14; n += 1) assert.match(text, new RegExp(`^## ${n} `, "m"), `family ${n}`);
  assert.equal((text.match(/^Applies (?:when|whenever|to) /gm) ?? []).length, 14, "every family says when it applies");
  assert.equal((text.match(/^Handled looks like: /gm) ?? []).length, 14, "every family says what handling looks like");
  // The coverage figure and its limit travel together, so the claim never outgrows the evidence.
  assert.match(text, /419 merged fix pull requests/);
  assert.match(text, /covered 94% of the condition breakage/);
  assert.match(text, /plain wrong logic/);
  for (const source of [/OSDI 2014/, /Site\s+Reliability Engineering/, /OWASP/, /ASPLOS 2008/]) assert.match(text, source);
});

test("edge-cases: read-only, capped, evidence-backed, and repository text is data", () => {
  const text = skill();
  assert.match(text, /Never edit a repository file/);
  assert.match(text, /fakes in place of networks, models and payment providers, never a live\s+service/);
  assert.match(text, /Also found/);
  assert.match(text, /Order by harm first/);
  assert.match(text, /data, not instructions/);
  assert.match(text, /at most 10 findings/);
  assert.match(text, /Rejected candidates/);
  assert.match(text, /Not applicable/);
  assert.match(text, /approves/);
  assert.match(text, /Private material/);
  assert.match(text, /cites evidence/);
});

test("edge-cases: agents/openai.yaml names it and allows implicit use", () => {
  const yaml = readFileSync(path.join(dir, "agents/openai.yaml"), "utf8");
  assert.match(yaml, /^interface:\n {2}display_name: "[^"]+"\n {2}short_description: "[^"]+"\n/m);
  assert.match(yaml, /\$edge-cases/);
  assert.match(yaml, /^policy:\n {2}allow_implicit_invocation: true$/m);
});

test("edge-cases: ten should-find and ten should-stay-quiet evals with real files", () => {
  const evals = JSON.parse(readFileSync(path.join(dir, "evals/evals.json"), "utf8"));
  assert.equal(evals.skill_name, "edge-cases");
  for (const item of evals.evals) {
    for (const file of item.files) assert.ok(existsSync(path.join(dir, file)), `eval ${item.name} names ${file}`);
    assert.ok(item.assertions.length > 0);
  }
  assert.equal(evals.evals.filter((item) => item.expect === "find").length, 10);
  assert.equal(evals.evals.filter((item) => item.expect === "quiet").length, 10);
  const names = new Set(evals.evals.map((item) => item.name));
  for (const required of ["double-charge", "already-covered", "main-path-untested", "copy-change", "full-security-audit"]) assert.ok(names.has(required), required);
});

test("edge-cases: ships in the package, and the router, approach, sweep and scout name it", () => {
  const files = listPackageFiles().map((file) => file.relative);
  for (const relative of ["SKILL.md", "agents/openai.yaml", "evals/evals.json", "references/families.md"]) {
    assert.ok(files.includes(`skills/edge-cases/${relative}`), relative);
  }
  assert.match(read("skills/super-outer/SKILL.md"), /`edge-cases`/);
  assert.match(read("skills/super-outer/references/engineering-approach.md"), /Breakage tests:/);
  assert.match(read("skills/super-outer/references/completion-contract.md"), /`edge-cases`/);
  assert.match(read("agents/failure-scout.md"), /skills\/edge-cases\/references\/families\.md/);
  for (const file of ["AGENTS.md", "README.md", "docs/reference.md"]) assert.ok(read(file).includes("edge-cases"), file);
});

test("edge-cases: its own text never counts as the product handling a failure mode", async () => {
  const { defaultSearch, searchTerms } = await import("../src/archetypes.mjs");
  const root = mkdtempSync(path.join(os.tmpdir(), "edge-cases-vendored-"));
  try {
    const vendored = path.join(root, ".claude/skills/edge-cases/references");
    spawnSync("mkdir", ["-p", vendored]);
    writeFileSync(path.join(vendored, "families.md"), "idempotency key and retry budget\n");
    writeFileSync(path.join(root, "app.js"), "export const ok = true;\n");
    for (const args of [["init", "-q"], ["add", "-A"]]) spawnSync("git", args, { cwd: root });
    assert.equal(defaultSearch("idempotency key", root), null);
    assert.equal(searchTerms(["retry budget"], root).found.get("retry budget"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.ok(read("src/work-under-way.mjs").includes('":(exclude,glob)**/skills/edge-cases/**"'));
});
