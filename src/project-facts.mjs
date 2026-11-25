/**
 * Cheap local facts about a project that the route and the session-start check
 * use: whether it deploys, to which platform, whether the platform's
 * observability is switched on, the product brief's now and next anchors, and
 * which deferred decisions have measured triggers that fired.
 *
 * Local reads of small files only. No network, no shell, never throws: a file
 * that is missing, too large or unparsable reads as "not known".
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { LEDGER_PATH, checkLedger, parseMetrics } from "./sequencing.mjs";

export const METRICS_PATH = ".engineering/super-outer/metrics.json";
export const BRIEF_PATH = ".engineering/super-outer/product-brief.md";
const MAX_BYTES = 256 * 1024;

const readSmall = (filename) => {
  try {
    const stat = statSync(filename);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    return readFileSync(filename, "utf8");
  } catch {
    return null;
  }
};

/** JSON with comments and trailing commas, as wrangler.jsonc allows. */
export function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") { out += text[i + 1] ?? ""; i += 1; } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i += 1; out += "\n"; continue; }
    if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1; i += 1; continue; }
    out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const wranglerFiles = (root) => {
  try {
    return readdirSync(root).filter((name) => /^wrangler(\.[\w-]+)?\.(toml|json|jsonc)$/.test(name)).sort();
  } catch {
    return [];
  }
};

/** "on", "off" or "unknown" for one wrangler file. */
function wranglerObservability(name, text) {
  if (name.endsWith(".toml")) {
    const section = text.match(/^\s*\[observability\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m);
    if (section) {
      const enabled = section[1].match(/^\s*enabled\s*=\s*(true|false)/m);
      return enabled?.[1] === "true" ? "on" : "off";
    }
    const inline = text.match(/^\s*observability\s*=\s*\{[^}]*enabled\s*=\s*(true|false)/m);
    if (inline) return inline[1] === "true" ? "on" : "off";
    return "off";
  }
  try {
    const parsed = parseJsonc(text);
    return parsed?.observability?.enabled === true ? "on" : "off";
  } catch {
    return "unknown";
  }
}

function readAnchors(root) {
  const text = readSmall(join(root, BRIEF_PATH));
  if (!text) return null;
  const pick = (key) => {
    const match = text.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${key}(?:[ _]anchor)?(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`, "im"));
    if (match) return match[1].replace(/^["']|["']$/g, "");
    // The brief also writes both anchors on one line: "now: 1 owner; next: 100 users".
    const inline = text.match(new RegExp(`\\b${key}\\s*:\\s*([^;\\n"]+)`, "i"));
    return inline ? inline[1].trim() : null;
  };
  const now = pick("now");
  const next = pick("next");
  return now || next ? { now, next } : null;
}

/** Read the metrics snapshot, or null when it is missing or unusable. */
export function readMetricsSnapshot(root) {
  const text = readSmall(join(root, METRICS_PATH));
  if (!text) return null;
  try {
    return parseMetrics(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Read the ledger, or null when it is missing or unusable. */
export function readLedgerQuietly(root) {
  const text = readSmall(join(root, LEDGER_PATH));
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.entries) ? parsed : null;
  } catch {
    return null;
  }
}

/** Deferred decisions whose measured trigger fired against the snapshot. */
export function firedTriggers(root, { ledger = readLedgerQuietly(root), metrics = readMetricsSnapshot(root) } = {}) {
  if (!ledger || !metrics) return [];
  try {
    const measuredOnly = { entries: ledger.entries.filter((entry) => Array.isArray(entry?.measuredWhen)) };
    return checkLedger(root, measuredOnly, { search: () => null, metrics }).due
      .map(({ id, prompt, trigger, evidence, ladder }) => ({ id, prompt: prompt ?? null, trigger, evidence, ...(ladder ? { ladder } : {}) }));
  } catch {
    return [];
  }
}

export function readProjectFacts(root) {
  const facts = { deploys: false, platform: null, observability: "unknown", anchors: null, firedTriggers: [] };
  if (typeof root !== "string" || !root || !existsSync(root)) return facts;
  try {
    const wrangler = wranglerFiles(root);
    if (wrangler.length > 0) {
      facts.platform = "cloudflare";
      const states = wrangler.map((name) => wranglerObservability(name, readSmall(join(root, name)) ?? ""));
      facts.observability = states.includes("on") ? "on" : states.includes("off") ? "off" : "unknown";
    } else if (existsSync(join(root, "vercel.json"))) facts.platform = "vercel";
    else if (existsSync(join(root, "supabase", "config.toml"))) facts.platform = "supabase";
    else if (existsSync(join(root, "fly.toml"))) facts.platform = "fly";
    facts.deploys = facts.platform !== null;
    facts.anchors = readAnchors(root);
    facts.firedTriggers = firedTriggers(root);
  } catch {
    // Facts are advisory; anything unexpected leaves the defaults.
  }
  return facts;
}
