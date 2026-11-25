/**
 * The session-start check. It returns at most one line, or null. In order:
 * a measured ledger trigger that fired; triggers whose metrics snapshot is
 * older than STALE_DAYS; then, from 6.3, the tool check
 * (skills/super-outer/references/tool-check.md): a project with dependencies
 * that was never checked, dependencies that changed since the check, items the
 * owner was shown and has not answered, or a check older than
 * TOOL_CHECK_STALE_DAYS. From 6.5 a released change that is due a look at the
 * live product (skills/super-outer/references/completion-contract.md, "After
 * release") comes after a fired trigger and before the stale-snapshot notice
 * and the tool check. In Super-outer's own repository the count of eval
 * candidates waiting for a batch comes before the tool check. Local reads
 * only; never throws.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { READY_AT, waitingForBatch } from "./eval-candidates.mjs";
import { firedTriggers, readLedgerQuietly, readMetricsSnapshot } from "./project-facts.mjs";
import { TOOL_CHECK_PATH, hasManifest, manifestHash, readToolCheck } from "./stack-facts.mjs";

export const STALE_DAYS = 14;
export const TOOL_CHECK_STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// Named by absolute path, as the route names references, so the agent can open it on any host.
export const TOOL_CHECK_REFERENCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "super-outer", "references", "tool-check.md");

// `part` is "fired" for a measured trigger that fired, or "stale" for an old
// metrics snapshot. A look due after a release sits between the two.
function ledgerLine(root, now, part) {
  const ledger = readLedgerQuietly(root);
  const measured = (ledger?.entries ?? []).filter((entry) => entry?.status === "DEFERRED" && Array.isArray(entry.measuredWhen) && entry.measuredWhen.length > 0);
  if (measured.length === 0) return null;
  const metrics = readMetricsSnapshot(root);
  if (!metrics) return null;
  const fired = firedTriggers(root, { ledger: { entries: measured }, metrics });
  if (part === "fired" && fired.length === 0) return null;
  if (part === "stale" && fired.length > 0) return null;
  if (fired.length > 0) {
    const named = fired.slice(0, 3).map((item) => `"${item.prompt || item.id}" (${item.evidence})`).join("; ");
    const more = fired.length > 3 ? `, and ${fired.length - 3} more` : "";
    return `Super-outer: a deferred decision is now due because its measured trigger fired: ${named}${more}. Raise it with the owner before other work.`;
  }
  const measuredAt = metrics.measured_at ? Date.parse(metrics.measured_at) : NaN;
  if (!Number.isFinite(measuredAt)) return null;
  const days = Math.floor((now.getTime() - measuredAt) / DAY_MS);
  if (days > STALE_DAYS) {
    return `Super-outer: the metrics snapshot in .engineering/super-outer/metrics.json is ${days} days old, so ${measured.length === 1 ? "one deferred decision's trigger" : `${measured.length} deferred decisions' triggers`} may have fired unseen. Refresh the numbers when convenient.`;
  }
  return null;
}

export const AFTER_RELEASE_PATH = path.join(".engineering", "super-outer", "after-release.json");
export const COMPLETION_REFERENCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "super-outer", "references", "completion-contract.md");
const AFTER_RELEASE_BYTES = 256 * 1024;
export const LOOK_EXPIRY_DAYS = 30;

/** Entries whose due dates have passed more often than a look was recorded. Never quotes the record. */
export function dueLooks(root, now = new Date()) {
  let entries;
  try {
    const file = path.join(root, AFTER_RELEASE_PATH);
    // lstat, so a link to a pipe or a device is never opened.
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > AFTER_RELEASE_BYTES) return 0;
    entries = JSON.parse(fs.readFileSync(file, "utf8"))?.entries;
  } catch {
    return 0;
  }
  if (!Array.isArray(entries)) return 0;
  return entries.slice(0, 200).filter((entry) => {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.due)) return false;
    const times = entry.due.filter((date) => typeof date === "string").map((date) => Date.parse(date)).filter(Number.isFinite);
    const passed = times.filter((time) => time <= now.getTime());
    const looks = Array.isArray(entry.looks) ? entry.looks.length : 0;
    // A look nobody made within LOOK_EXPIRY_DAYS stops being named, so one
    // forgotten entry cannot hide the tool check for ever.
    const latest = Math.max(...passed);
    return passed.length > looks && now.getTime() - latest <= LOOK_EXPIRY_DAYS * DAY_MS;
  }).length;
}

function afterReleaseLine(root, now) {
  const due = dueLooks(root, now);
  if (due === 0) return null;
  return `Super-outer: ${due === 1 ? "one released change is" : `${due} released changes are`} due a look at the live product, listed in ${AFTER_RELEASE_PATH}. Before other work, do each look as the "After release" section of ${COMPLETION_REFERENCE} describes, record what you found, and tell the owner in one line.`;
}

// The tool check's line never quotes text from the record: the record lives in
// the repository, so its titles are untrusted. It gives counts and the command.
// A "later" answer counts as unanswered again after LATER_DAYS.
export const LATER_DAYS = 14;

function toolCheckLine(root, now) {
  if (!hasManifest(root)) return null;
  const record = readToolCheck(root);
  const checkedAt = Date.parse(record?.checked_at);
  const when = "If the next task plans or builds something (not a quick fix)";
  const run = "run `super-outer tool-check run --write` (`~/.super-outer/bin/super-outer` when `super-outer` is not found)";
  if (!record || !Number.isFinite(checkedAt) || checkedAt > now.getTime() + DAY_MS) {
    return `Super-outer: this project has no tool check yet, so nobody has checked it for out-of-date packages or the vendors' own skills. ${when}, ${run} and follow ${TOOL_CHECK_REFERENCE}. Keep working on what the owner asked meanwhile.`;
  }
  if (record.manifest_hash && record.manifest_hash !== manifestHash(root)) {
    return `Super-outer: the project's dependencies changed since the last tool check. ${when}, ${run} again and follow ${TOOL_CHECK_REFERENCE}.`;
  }
  const items = [...(record.findings ?? []), ...(record.skills ?? []), ...(record.mcp ?? []).flatMap((group) => group?.items ?? [])];
  const unanswered = (item) => {
    if (!item?.answer) return true;
    if (item.answer !== "later") return false;
    const at = Date.parse(item.answeredAt);
    // A "later" dated in the future would otherwise never come back.
    return !Number.isFinite(at) || at > now.getTime() + DAY_MS || now.getTime() - at >= LATER_DAYS * DAY_MS;
  };
  const open = items.filter((item) => item && typeof item === "object" && item.shown === true && unanswered(item)).length;
  if (open > 0) {
    return `Super-outer: the last tool check showed the owner ${open === 1 ? "one item" : `${open} items`} still unanswered in ${TOOL_CHECK_PATH}. ${when}, ${run} again, raise ${open === 1 ? "it" : "them"} in that plan as ${TOOL_CHECK_REFERENCE} describes, and record each answer.`;
  }
  const days = Math.floor((now.getTime() - checkedAt) / DAY_MS);
  if (days > TOOL_CHECK_STALE_DAYS) {
    return `Super-outer: the tool check in ${TOOL_CHECK_PATH} is ${days} days old, so newer releases and new vendor skills may have appeared. ${when}, ${run} again and follow ${TOOL_CHECK_REFERENCE}.`;
  }
  return null;
}

export const LEARNING_REFERENCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "super-outer", "references", "learning-loop.md");

// Eval candidates are about Super-outer's own behaviour, and their cases live
// in Super-outer's repository, so the line is said only there. It comes before
// the tool check, whose line can stay for weeks, and it gives a count and
// never a candidate's words.
function evalCandidatesLine(root, env) {
  let name = null;
  try {
    const file = path.join(root, "package.json");
    // lstat, so a pipe or a device at that path is never opened.
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > AFTER_RELEASE_BYTES) return null;
    name = JSON.parse(fs.readFileSync(file, "utf8"))?.name;
  } catch {
    return null;
  }
  if (name !== "super-outer") return null;
  const waiting = waitingForBatch(env);
  if (waiting < READY_AT) return null;
  return `Super-outer: ${waiting} eval candidates collected from the owner's corrections are waiting, enough for a batch. When convenient, run \`super-outer evals candidates --text\`, draft the cases as ${LEARNING_REFERENCE} describes, and show the owner the list and the expected cost before any run.`;
}

export function sessionStartLine(root, { now = new Date(), env = process.env } = {}) {
  try {
    return ledgerLine(root, now, "fired") ?? afterReleaseLine(root, now) ?? ledgerLine(root, now, "stale") ?? evalCandidatesLine(root, env) ?? toolCheckLine(root, now);
  } catch {
    return null;
  }
}
