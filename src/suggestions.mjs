/**
 * Manual-work detector. The hook calls recordCandidate after tool calls; it
 * keeps a short window of one-line tool summaries and records a candidate
 * when the window shows work a service already does. Nothing is shown during
 * the work: candidates surface only at a milestone, through listForMilestone.
 *
 * recordCandidate is local only, never throws and never calls the network.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { looksSecret } from "./jev/prompt-filter.mjs";
import { resolveDataDir } from "./jev/settings.mjs";

export const WINDOW = 20;
const SUMMARY_CHARACTERS = 200;
const ANSWERS = new Set(["used", "dismissed"]);

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

export const suggestionsFile = (root) => path.join(root, ".engineering", "super-outer", "suggestions.json");
// The recent commands and paths stay outside the project, so a commit never carries them.
export const recentFile = (root, env = process.env) => path.join(resolveDataDir(env), "recent-activity", `${createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16)}.json`);
const isProject = (root) => fs.existsSync(path.join(root, ".git"));

function readRecent(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(recentFile(root), "utf8"));
    return Array.isArray(parsed.recent) ? parsed.recent.filter((r) => r && typeof r.summary === "string") : [];
  } catch {
    return [];
  }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

const empty = () => ({ schema_version: 1, recent: [], suggestions: [] });

export function readSuggestions(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(suggestionsFile(root), "utf8"));
    if (!parsed || typeof parsed !== "object") return empty();
    return {
      schema_version: 1,
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter((r) => r && typeof r.summary === "string") : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s) => s && typeof s.trigger === "string") : [],
    };
  } catch {
    return empty();
  }
}

function writeSuggestions(root, state) {
  writeAtomic(suggestionsFile(root), { schema_version: 1, suggestions: state.suggestions });
}

const LIVE_URL = /https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([a-z0-9.-]+\.[a-z]{2,})/i;
const TIMING = /\b(curl|time_total|latency|timing|response time|ttfb|wrk|hey|ab -n|httpstat)\b/i;

/** Each detector returns null or { trigger, key, text }. key feeds triggerHash. */
const DETECTORS = [
  (recent) => {
    const hits = recent.filter((r) => TIMING.test(r.summary) && LIVE_URL.test(r.summary));
    if (hits.length < 4) return null;
    const hosts = [...new Set(hits.map((r) => r.summary.match(LIVE_URL)[1].toLowerCase()))].sort();
    return { trigger: "repeated-live-timing", key: hosts.join(","), text: `Repeated timing queries against ${hosts.join(", ")}. A monitoring service can record latency continuously.` };
  },
  (recent, latest) => {
    const s = latest.summary;
    if (!/\bsleep\s*\(?\s*\d/i.test(s) || !/\b(while|for|until|retry|retries|loop|poll)/i.test(s)) return null;
    return { trigger: "polling-loop", key: s.replace(/\d+/g, "#").slice(0, 120), text: "A hand-written polling or retry loop with sleep. A queue, webhook or retry library may already do this." };
  },
  (recent, latest) => {
    const s = latest.summary;
    const match = s.match(/setInterval\s*\([^)]*\)/i) ?? s.match(/['"`]((?:[\d*/,-]+\s+){4}[\d*/,-]+)['"`]/) ?? (/\bcron\b/i.test(s) && /\b(add|added|write|wrote|edit)/i.test(s) ? [s.slice(0, 80)] : null);
    if (!match) return null;
    return { trigger: "home-made-scheduler", key: match[0], text: "A home-made scheduler in the code. A platform cron or scheduled-job service may already do this." };
  },
  (recent, latest) => {
    const s = latest.summary;
    if (!/(console\.log|\bprint\(|println|\bDEBUG\b|printf)/i.test(s) || !/\b(prod|production|live|tail)\b/i.test(s)) return null;
    return { trigger: "print-debugging-live", key: "print-debugging-live", text: "Print-debugging a live system. Structured logs or tracing can answer this without a redeploy." };
  },
];

export function recordCandidate({ root, toolName, summary } = {}) {
  try {
    if (typeof root !== "string" || root === "") return;
    if (typeof summary !== "string" || summary.trim() === "") return;
    const line = summary.replace(/\s+/g, " ").trim().slice(0, SUMMARY_CHARACTERS);
    if (looksSecret(line)) return;
    if (!isProject(root)) return;
    const state = readSuggestions(root);
    state.recent = readRecent(root);
    const before = JSON.stringify(state.suggestions);
    const latest = { tool: typeof toolName === "string" ? toolName.slice(0, 40) : "", summary: line, at: new Date().toISOString() };
    state.recent = [...state.recent, latest].slice(-WINDOW);
    for (const detect of DETECTORS) {
      const found = detect(state.recent, latest);
      if (!found) continue;
      const triggerHash = sha256(`${found.trigger}\n${found.key}`);
      const existing = state.suggestions.find((s) => s.trigger === found.trigger);
      if (!existing) {
        state.suggestions.push({ id: sha256(`${found.trigger}\n${Date.now()}\n${Math.random()}`).slice(0, 12), trigger: found.trigger, triggerHash, text: found.text, firstSeen: latest.at, status: "pending" });
      } else if (existing.triggerHash !== triggerHash) {
        existing.triggerHash = triggerHash;
        existing.text = found.text;
        if (existing.status === "dismissed") existing.status = "pending";
      }
    }
    writeAtomic(recentFile(root), { schema_version: 1, recent: state.recent });
    if (JSON.stringify(state.suggestions) !== before) writeSuggestions(root, state);
  } catch {
    // The detector is an aid; a failure never reaches the hook.
  }
}

/** Pending suggestions for the milestone; each is marked shown so it appears once. */
export function listForMilestone(root) {
  try {
    const state = readSuggestions(root);
    const pending = state.suggestions.filter((s) => s.status === "pending");
    if (pending.length === 0) return [];
    for (const s of pending) s.status = "shown";
    writeSuggestions(root, state);
    return pending.map(({ id, trigger, text }) => ({ id, trigger, text }));
  } catch {
    return [];
  }
}

export function answer(root, id, choice) {
  try {
    if (!ANSWERS.has(choice)) return false;
    const state = readSuggestions(root);
    const target = state.suggestions.find((s) => s.id === id);
    if (!target) return false;
    target.status = choice;
    writeSuggestions(root, state);
    return true;
  } catch {
    return false;
  }
}
