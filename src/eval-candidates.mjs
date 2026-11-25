/**
 * Eval candidates collected from the owner's own corrections
 * (skills/super-outer/references/learning-loop.md, "Collect eval cases from
 * corrections"). A candidate is the raw material for one behaviour eval case:
 * what was asked, what the agent did, and what the owner said should have
 * happened.
 *
 * Candidates are kept in one file in Super-outer's private data folder,
 * outside every project, so a commit never carries them. Nothing here calls
 * the network, and no model runs when a candidate is saved. The paid run
 * happens later, once, when READY_AT candidates are waiting and the owner has
 * seen the list. Every function is local and never throws.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { typedRefusal } from "./jev/judge.mjs";
import { looksSecret } from "./jev/prompt-filter.mjs";
import { resolveDataDir } from "./jev/settings.mjs";

export const READY_AT = 10;
export const FIELD_CHARACTERS = 600;
export const MAX_CANDIDATES = 500;
const MAX_BYTES = 2 * 1024 * 1024;
// The store is trimmed well before the size at which it stops being read.
const KEEP_BYTES = 1024 * 1024;
const STATUSES = new Set(["waiting", "drafted", "dismissed"]);
const KINDS = new Set(["behaviour", "routing"]);
const OFF = /^(?:off|0|false)$/i;

export const candidatesFile = (env = process.env) => path.join(resolveDataDir(env), "eval-candidates.jsonl");
export const collectionIsOn = (env = process.env) => !OFF.test(String(env?.SUPER_OUTER_EVAL_CANDIDATES ?? "").trim());

const squeeze = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

// An email address, a long run of digits (a phone, card or identity number)
// or an Indian PAN. A candidate is meant to be general words about what went
// wrong, so text that names a person this way is not kept.
// An address needs a domain that ends in letters, so "eslint@9.14.0" is a
// package and not a person. A date, a port and a list of step numbers pass.
const PERSONAL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b|\b\d{10,}\b|\b\d{5}[\s-]\d{5}\b|\b\d{4}[\s-]\d{4}[\s-]\d{4}\b|\b[A-Z]{5}\d{4}[A-Z]\b/i;
// Text the host or a tool wrote, in a tag the typed-text rule does not list.
const TOOL_BLOCK = /<\/?(?:[a-z]+-)*(?:stdout|stderr|output|reminder|notification|event|message|result|context)\b[^>]*>/i;
const HOST_PREFIX = /^(?:stop hook feedback|\[system notification)/i;
// A slash command, a host block or machine text, in any field.
const notTyped = (text) => HOST_PREFIX.test(text) || TOOL_BLOCK.test(text) || ["host_command", "host_markup", "machine_text"].includes(typedRefusal(text.padEnd(8)));

// One field of a candidate: short, one line, never a secret and never a
// person's contact or identity number. The whole field is scanned before it
// is cut, and a field that fails is dropped whole, because half a secret is
// still a secret.
const field = (value) => {
  if (typeof value !== "string") return null;
  const text = squeeze(value);
  if (text === "" || looksSecret(text) || PERSONAL.test(text) || notTyped(text)) return null;
  return text.slice(0, FIELD_CHARACTERS);
};

// Where a candidate came from. A path keeps nothing after a "?". The whole
// value is scanned before it is cut, and one that looks like a secret is
// dropped. A session id and the id and time in a transcript's file name are
// set aside for the scan, because they read as secrets and are not.
const SESSION_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FILE_TIME = /\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2}/g;
const label = (value, limit) => {
  if (typeof value !== "string") return null;
  const text = value.trim().split("?")[0];
  const scanned = text.replace(SESSION_ID, "id").replace(FILE_TIME, "time");
  if (text === "" || looksSecret(scanned) || PERSONAL.test(scanned)) return null;
  return text.slice(0, limit);
};

/**
 * Why the words a person typed may not be kept as a correction, or null when
 * they may. It is the rule the Jev readings use, so a slash command, machine
 * text, host-written text, a paste or a secret is refused here as well.
 */
export function correctionRefusal(typed) {
  const text = typeof typed === "string" ? typed.trim() : "";
  if (text.length > FIELD_CHARACTERS) return "too_long";
  if (HOST_PREFIX.test(text) || TOOL_BLOCK.test(text)) return "host_markup";
  return typedRefusal(text) ?? (PERSONAL.test(text) ? "personal_data" : null);
}

// "missing" when there is no store yet, "unreadable" when something that is
// not a regular file sits at its path or it is too large to trust.
function storeState(env) {
  try {
    const stat = fs.lstatSync(candidatesFile(env));
    return stat.isFile() && stat.size <= MAX_BYTES ? "ready" : "unreadable";
  } catch (error) {
    return error?.code === "ENOENT" ? "missing" : "unreadable";
  }
}

function readAll(env) {
  try {
    const file = candidatesFile(env);
    if (storeState(env) !== "ready") return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
      try {
        const row = JSON.parse(line);
        return row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string" ? [row] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

// Rows that were drafted or dismissed go first, oldest first, and then the
// oldest waiting rows, until the store fits its row and byte limits.
function trim(rows) {
  const kept = [...rows];
  const size = () => kept.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row)) + 1, 0);
  while (kept.length > MAX_CANDIDATES || (kept.length > 1 && size() > KEEP_BYTES)) {
    const done = kept.findIndex((row) => row.status !== "waiting");
    kept.splice(done === -1 ? 0 : done, 1);
  }
  return kept;
}

function writeAll(rows, env) {
  const file = candidatesFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const kept = trim(rows);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, kept.map((row) => JSON.stringify(row)).join("\n") + (kept.length ? "\n" : ""), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

/**
 * Saves one candidate. `source` is "hook" for a correction the prompt hook
 * saw, or "agent" for one the session wrote with what it did and what should
 * have happened. Returns { saved, id } or { saved: false, reason }.
 */
export function addCandidate(candidate = {}, { env = process.env, now = new Date() } = {}) {
  try {
    if (!collectionIsOn(env)) return { saved: false, reason: "off" };
    // A store that cannot be read is never written over.
    if (storeState(env) === "unreadable") return { saved: false, reason: "store_unreadable" };
    const source = candidate.source === "hook" ? "hook" : "agent";
    if (source === "hook" && correctionRefusal(candidate.correction)) return { saved: false, reason: correctionRefusal(candidate.correction) };
    const row = {
      correction: field(candidate.correction),
      asked: field(candidate.asked),
      did: field(candidate.did),
      should: field(candidate.should),
    };
    if (source === "hook" ? !row.correction : !(row.asked && row.should)) return { saved: false, reason: "incomplete" };
    const rows = readAll(env);
    const id = sha256(JSON.stringify([source, candidate.session ?? "", row])).slice(0, 12);
    if (rows.some((existing) => existing.id === id)) return { saved: false, reason: "already_saved", id };
    const saved = {
      id,
      ts: now.toISOString(),
      source,
      kind: KINDS.has(candidate.kind) ? candidate.kind : "behaviour",
      status: "waiting",
      host: label(candidate.host, 40),
      repo: label(candidate.repo, 120),
      session: label(candidate.session, 200),
      transcript: label(candidate.transcript, 500),
      ...Object.fromEntries(Object.entries(row).filter(([, value]) => value)),
    };
    const line = `${JSON.stringify(saved)}\n`;
    let size = 0;
    try { size = fs.statSync(candidatesFile(env)).size; } catch { size = 0; }
    if (rows.length >= MAX_CANDIDATES || size + Buffer.byteLength(line) > KEEP_BYTES) {
      writeAll([...rows, saved], env);
    } else {
      // One short line appended in a single write, so two hooks saving at the
      // same moment both keep their row.
      const file = candidatesFile(env);
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.appendFileSync(file, line, { mode: 0o600 });
    }
    return { saved: true, id };
  } catch {
    return { saved: false, reason: "failed" };
  }
}

// One correction can leave two rows: the hook's, and the session's fuller one.
// The larger of the two counts is the number of corrections.
const behaviourWaiting = (waiting) => {
  const behaviour = waiting.filter((row) => row.kind !== "routing");
  return Math.max(behaviour.filter((row) => row.source === "hook").length, behaviour.filter((row) => row.source !== "hook").length);
};

/**
 * How many candidates are waiting and whether a batch is due. The candidates'
 * own words are returned only when `text` is asked for, because this is run
 * for a count in every project and the words came from other projects.
 */
export function listCandidates({ env = process.env, text = false } = {}) {
  const rows = readAll(env);
  const waiting = rows.filter((row) => row.status === "waiting");
  const behaviour = behaviourWaiting(waiting);
  const routing = waiting.filter((row) => row.kind === "routing").length;
  const ready = behaviour >= READY_AT;
  return {
    file: candidatesFile(env),
    collecting: collectionIsOn(env),
    store: storeState(env),
    total: rows.length,
    waiting: waiting.length,
    waiting_behaviour: behaviour,
    waiting_routing: routing,
    ready_at: READY_AT,
    ready,
    ...(text ? { candidates: waiting } : {}),
    summary: storeState(env) === "unreadable"
      ? "the store cannot be read (it is too large or not a regular file); move it aside to start a new one"
      : `${behaviour} about behaviour and ${routing} about routing are waiting; ${ready ? "enough for a batch: in Super-outer's repository, read them with --text, draft the cases and show the owner the list before any run" : `a batch is due at ${READY_AT} about behaviour`}`,
  };
}

/** Marks one candidate drafted (with the case it became) or dismissed. */
export function markCandidate(id, status, caseName, { env = process.env } = {}) {
  try {
    if (!STATUSES.has(status) || status === "waiting") return { marked: false, reason: "unknown_status" };
    const rows = readAll(env);
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) return { marked: false, reason: "not_found" };
    if (caseName !== undefined && caseName !== null && !(typeof caseName === "string" && /^[a-z0-9-]{1,80}$/.test(caseName))) return { marked: false, reason: "bad_case_name" };
    row.status = status;
    if (status === "drafted" && caseName) row.case = caseName;
    writeAll(rows, env);
    return { marked: true, id, status };
  } catch {
    return { marked: false, reason: "failed" };
  }
}

/** How many behaviour candidates are waiting, for the session-start line. Never throws. */
export function waitingForBatch(env = process.env) {
  try {
    return behaviourWaiting(readAll(env).filter((row) => row.status === "waiting"));
  } catch {
    return 0;
  }
}
