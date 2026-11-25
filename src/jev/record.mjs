// Adapted from Super-outer Experimental's jev-route-check (scripts/ledger.mjs and the key check in run-route-check.mjs).
/**
 * The private record of what Jev read.
 *
 * One JSON line for each prompt that was sent to Jev, in a file for each UTC
 * day, under Super-outer's data folder. It is kept only when the person
 * switches it on with SUPER_OUTER_JEV_RECORD=on. The folder and the files are
 * readable by their owner only, because a row holds the first 120 typed
 * characters of a prompt, the name of the repository folder and a SHA-256 of
 * the whole prompt. No row is older than 30 days: old files are deleted on
 * every prompt the hook judges, also after the record is switched off. A
 * count of the candidate domains comes from these rows.
 */

import fs from "node:fs";
import path from "node:path";

import { DOMAINS } from "./questions.mjs";

export const RETENTION_DAYS = 30;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function recordDir(dataDir) {
  return path.join(dataDir, "jev-record");
}

// Nothing in a row should be able to hold the key, because every copied field
// is a number, a depth or a checked string. If one ever does, the row is
// replaced by one that holds only its time, an error status and the reason
// key_in_row.
const holdsKey = (line, key) =>
  typeof key === "string" && key !== "" && (line.includes(key) || line.includes(JSON.stringify(key).slice(1, -1)));

/** Deletes the day files dated RETENTION_DAYS or more whole days before now, so no row is older than 30 days. */
function prune(folder, now) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const name of fs.readdirSync(folder)) {
    const found = DAY_FILE.exec(name);
    if (!found) continue;
    const day = Date.parse(`${found[1]}T00:00:00.000Z`);
    if (Number.isFinite(day) && (today - day) / DAY_MS >= RETENTION_DAYS) fs.rmSync(path.join(folder, name), { force: true });
  }
}

/**
 * Deletes old day files when the record folder exists, whether or not the
 * record is switched on, and never creates the folder. It never throws.
 */
export function pruneRecord({ dataDir, now = new Date() } = {}) {
  try {
    const folder = recordDir(dataDir);
    if (fs.existsSync(folder)) prune(folder, now);
  } catch {
    // A file that cannot be deleted now is deleted on a later prompt.
  }
}

/** Appends one row and returns true, or returns false. It never throws. */
export function appendRecord({ dataDir, row, key, now = new Date() } = {}) {
  try {
    const ts = now.toISOString();
    const folder = recordDir(dataDir);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    fs.chmodSync(folder, 0o700);
    try {
      prune(folder, now);
    } catch {
      // A file that cannot be deleted now is deleted at a later write.
    }
    let line = JSON.stringify(row);
    if (typeof line !== "string") return false;
    if (holdsKey(line, key)) line = JSON.stringify({ ts, status: "error", reason: "key_in_row" });
    const file = path.join(folder, `${ts.slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, `${line}\n`, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
    return true;
  } catch {
    return false;
  }
}

/** Every row from every day file, oldest file first. A damaged line is skipped. */
export function readRecord({ dataDir } = {}) {
  let names;
  try {
    names = fs.readdirSync(recordDir(dataDir)).filter((name) => DAY_FILE.test(name)).sort();
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    let text;
    try {
      text = fs.readFileSync(path.join(recordDir(dataDir), name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        // The other rows are still evidence.
      }
    }
  }
  return rows;
}

/** How many rows Jev read as being about each candidate domain, at the threshold or above. */
export function domainCounts(rows, { threshold = 0.5 } = {}) {
  const counts = Object.fromEntries(DOMAINS.map(([id]) => [id, 0]));
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const [id] of DOMAINS) {
      const reading = row?.jev?.domains?.[id];
      if (typeof reading === "number" && reading >= threshold) counts[id] += 1;
    }
  }
  return counts;
}
