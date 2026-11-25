import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Sequencing, the deferral ledger, and proof obligations.
 *
 * The ordering rule: do first whatever is most expensive to change later. It is
 * not "auth first" — a login screen defers freely; the ownership column does
 * not. Three classes, because two lose the case that hurts most:
 *
 * - `now`    — impossible or ruinous to retrofit;
 * - `decide` — cheap later only if a decision now keeps it open. Nobody builds
 *              offline in week one, but a hundred small choices quietly
 *              foreclose it;
 * - `defer`  — genuinely additive later. Never costs interview budget; goes
 *              straight to the ledger.
 */

export const SEQUENCE_CLASSES = Object.freeze(["now", "decide", "defer"]);
const SEQUENCE_RANK = Object.freeze({ now: 0, decide: 1, defer: 2 });

/**
 * Past this many open entries the ledger has become a wishlist and stops being
 * read. It holds deferred risk decisions, not features.
 */
export const LEDGER_ATTENTION_LIMIT = 10;

export const LEDGER_PATH = ".engineering/super-outer/ledger.json";

const sequenceOf = (mode) =>
  SEQUENCE_CLASSES.includes(mode?.sequence) ? mode.sequence : "decide";

/**
 * Order question candidates by the cost of being wrong, not by topic. When a
 * budget truncates, the survivors are the ones whose wrong answer is most
 * expensive to discover late.
 */
export function orderBySequence(decisions) {
  return [...decisions].sort(
    (left, right) =>
      (SEQUENCE_RANK[sequenceOf(left)] ?? 1) - (SEQUENCE_RANK[sequenceOf(right)] ?? 1) ||
      (right.priority ?? 0) - (left.priority ?? 0) ||
      String(left.id).localeCompare(String(right.id)),
  );
}

/**
 * Split archetype decisions for the interview. `defer` items never spend
 * interview budget — recording them is the whole point of deferral, and asking
 * about them anyway would re-create the friction the classes exist to remove.
 */
export function partitionBySequence(decisions) {
  const ask = [];
  const deferred = [];
  for (const decision of decisions) {
    (sequenceOf(decision) === "defer" ? deferred : ask).push(decision);
  }
  return { ask: orderBySequence(ask), deferred };
}

const emptyLedger = () => ({ schema_version: "1.0.0", entries: [] });

export function readLedger(root) {
  const filename = join(root, LEDGER_PATH);
  if (!existsSync(filename)) return emptyLedger();
  try {
    const parsed = JSON.parse(readFileSync(filename, "utf8"));
    return Array.isArray(parsed?.entries) ? parsed : emptyLedger();
  } catch {
    return emptyLedger();
  }
}

export function writeLedger(root, ledger) {
  const filename = join(root, LEDGER_PATH);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(ledger, null, 2)}\n`);
  return filename;
}

/**
 * Record deferred failure modes as ledger entries. `revisitWhen` is the v5.0
 * suppression engine pointed the other way:
 *
 *   lookFor      — is this already handled?    → suppress asking
 *   revisitWhen  — has this deferral expired?  → resume asking
 *
 * Triggers are conditions, never dates. "Revisit rate limiting when a public
 * endpoint exists" stays checkable on every route; "revisit in March" rots.
 *
 * `measuredWhen` is the second kind: a number someone measures outside the
 * code, such as how busy the database is at peak. The search can never see
 * such a number, so it arrives in a metrics file that `checkLedger` reads.
 * A measured condition may carry `ladder`, the scale step it belongs to
 * ("100", "10000", "1000000" users); it is kept as written and reported when
 * the condition fires. Ledgers written before 6.0 have no ladder and stay valid.
 */
export function recordDeferrals(root, deferred, { now = null } = {}) {
  if (deferred.length === 0) return readLedger(root);
  for (const decision of deferred) {
    const problems = validateMeasuredWhen(decision.measuredWhen);
    if (problems.length > 0) {
      throw new Error(`The measured trigger for ${decision.id} cannot be recorded: ${problems.join("; ")}`);
    }
  }
  const ledger = readLedger(root);
  const existing = new Set(ledger.entries.map((entry) => entry.id));
  for (const decision of deferred) {
    if (existing.has(decision.id)) continue;
    ledger.entries.push({
      id: decision.id,
      prompt: decision.prompt,
      why: decision.why,
      archetype: decision.archetype ?? null,
      status: "DEFERRED",
      revisitWhen: decision.revisitWhen ?? decision.lookFor ?? [],
      ...(decision.measuredWhen ? { measuredWhen: decision.measuredWhen } : {}),
      recorded_at: now,
    });
  }
  writeLedger(root, ledger);
  return ledger;
}

/** How each comparison reads in a sentence. */
export const MEASURED_COMPARISONS = Object.freeze({
  ">": "above",
  ">=": "at or above",
  "<": "below",
  "<=": "at or below",
});

const COMPARE = Object.freeze({
  ">": (value, threshold) => value > threshold,
  ">=": (value, threshold) => value >= threshold,
  "<": (value, threshold) => value < threshold,
  "<=": (value, threshold) => value <= threshold,
});

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A measured trigger names a metric, a comparison and a numeric threshold, and
 * may carry `says`: the signal in the owner's words. Absent is valid; anything
 * present must be checkable, because a trigger that cannot be checked would
 * otherwise read as "not due yet".
 */
export function validateMeasuredWhen(conditions) {
  if (conditions === undefined || conditions === null) return [];
  if (!Array.isArray(conditions)) return ["measuredWhen must be a list of conditions"];
  const problems = [];
  conditions.forEach((condition, index) => {
    const at = `condition ${index + 1}`;
    if (!isPlainObject(condition)) { problems.push(`${at} must be an object`); return; }
    if (typeof condition.metric !== "string" || !condition.metric.trim()) problems.push(`${at} needs a metric name`);
    if (!Object.hasOwn(COMPARE, condition.comparison)) {
      problems.push(`${at} has comparison ${JSON.stringify(condition.comparison)}; use one of ${Object.keys(COMPARE).join(" ")}`);
    }
    if (typeof condition.threshold !== "number" || !Number.isFinite(condition.threshold)) problems.push(`${at} needs a numeric threshold`);
    if (condition.says !== undefined && typeof condition.says !== "string") problems.push(`${at} has a says that is not text`);
    if (condition.ladder !== undefined && (typeof condition.ladder !== "string" || !/^[1-9][0-9]*$/.test(condition.ladder))) {
      problems.push(`${at} has a ladder stage that is not a user count written as digits, such as "100"`);
    }
  });
  return problems;
}

/**
 * Read the numbers the owner or a CI job supplies:
 * `{ "measured_at": "2026-10-12", "metrics": { "db_peak_busy_percent": 72 } }`.
 * A value that is not a number is set aside with a reason, so "60%" shows up
 * as a problem instead of as a measurement that happened to be fine.
 */
export function parseMetrics(document) {
  if (!isPlainObject(document) || !isPlainObject(document.metrics)) {
    throw new Error('A metrics file must hold { "metrics": { "<name>": <number> } }');
  }
  const values = {};
  const problems = [];
  for (const [name, value] of Object.entries(document.metrics)) {
    if (typeof value === "number" && Number.isFinite(value)) values[name] = value;
    else problems.push(`${name} is ${JSON.stringify(value) ?? String(value)}, which is not a number`);
  }
  return { measured_at: typeof document.measured_at === "string" ? document.measured_at : null, values, problems };
}

const describeCondition = (condition) =>
  condition.says || `${condition.metric} is ${MEASURED_COMPARISONS[condition.comparison]} ${condition.threshold}`;

function measuredState(entry, metrics) {
  const conditions = entry.measuredWhen;
  if (conditions === undefined) return { kind: "none" };
  const problems = validateMeasuredWhen(conditions);
  if (problems.length > 0) return { kind: "invalid", problems };
  if (conditions.length === 0) return { kind: "none" };
  const missing = [];
  for (const condition of conditions) {
    const value = metrics?.values?.[condition.metric];
    if (value === undefined) { missing.push(condition.metric); continue; }
    if (COMPARE[condition.comparison](value, condition.threshold)) return { kind: "met", condition, value };
  }
  return missing.length > 0 ? { kind: "missing", missing } : { kind: "not_met" };
}

function repositoryHit(entry, root, search) {
  const needles = Array.isArray(entry.revisitWhen) ? entry.revisitWhen : [];
  for (const needle of needles) {
    const evidence = search(needle, root);
    if (evidence) return { needle, evidence };
  }
  return null;
}

const quote = (entry) => entry.prompt || entry.id;

/**
 * Sort every open deferral into one of four groups: due, still waiting, not
 * measured (a metric it needs was not supplied), or cannot be checked (its
 * measured trigger is malformed). Either kind of trigger is enough to make an
 * entry due. An entry is never reported as waiting while a number it depends
 * on is unknown, because that would read as an all-clear nobody measured.
 *
 * Read-only: nothing is written back, so the same check can run again with
 * tomorrow's numbers.
 */
export function checkLedger(root, ledger, { search, metrics = null }) {
  const due = [];
  const waiting = [];
  const notMeasured = [];
  const cannotCheck = [];
  for (const entry of ledger.entries) {
    if (entry.status !== "DEFERRED") continue;
    const measured = measuredState(entry, metrics);
    if (measured.kind === "met") {
      const { condition, value } = measured;
      due.push({
        ...entry,
        source: "measured",
        trigger: describeCondition(condition),
        ...(condition.ladder ? { ladder: condition.ladder } : {}),
        value,
        evidence: `${condition.metric} is ${value}, ${MEASURED_COMPARISONS[condition.comparison]} the trigger of ${condition.threshold}`,
      });
      continue;
    }
    const hit = repositoryHit(entry, root, search);
    if (hit) {
      due.push({ ...entry, source: "repository", trigger: hit.needle, evidence: hit.evidence });
      continue;
    }
    if (measured.kind === "invalid") cannotCheck.push({ ...entry, problems: measured.problems });
    else if (measured.kind === "missing") notMeasured.push({ ...entry, missing: measured.missing });
    else waiting.push(entry);
  }

  const lines = [];
  for (const item of due) {
    lines.push(item.source === "measured"
      ? `Due now: ${quote(item)}. The trigger was "${item.trigger}", and ${item.evidence}.`
      : `Due now: ${quote(item)}. The code now contains "${item.trigger}", first found in ${item.evidence}.`);
  }
  for (const item of notMeasured) {
    lines.push(metrics
      ? `Not checked: ${quote(item)}. The metrics file has no number for ${item.missing.join(", ")}.`
      : `Not checked: ${quote(item)}. It waits on ${item.missing.join(", ")}, and no metrics file was given.`);
  }
  for (const item of cannotCheck) {
    lines.push(`${quote(item)} has a measured trigger that cannot be checked: ${item.problems.join("; ")}.`);
  }
  for (const problem of metrics?.problems ?? []) lines.push(`The metrics file was partly unusable: ${problem}.`);
  if (due.length === 0) lines.unshift("Nothing deferred is due yet.");
  if (waiting.length > 0) {
    lines.push(waiting.length === 1 ? "One deferred part is still waiting for its trigger." : `${waiting.length} deferred parts are still waiting for their triggers.`);
  }

  return { due, waiting, not_measured: notMeasured, cannot_check: cannotCheck, summary: lines.join("\n") };
}

/**
 * A deferral expires when the repository starts containing the thing it was
 * waiting for, or when a supplied number crosses its measured trigger. The
 * repository half reuses the search the archetype layer uses.
 */
export function dueDeferrals(root, ledger, { search, metrics = null }) {
  return checkLedger(root, ledger, { search, metrics }).due;
}

/**
 * The command path reads the ledger strictly. `readLedger` treats a broken
 * file as empty, which is right for appending but would turn a corrupt ledger
 * into "nothing is due".
 */
export function loadLedgerForCheck(root) {
  const filename = join(root, LEDGER_PATH);
  if (!existsSync(filename)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`The deferral ledger at ${LEDGER_PATH} cannot be read: ${error.message}`);
  }
  if (!Array.isArray(parsed?.entries)) {
    throw new Error(`The deferral ledger at ${LEDGER_PATH} cannot be read: it has no entries list`);
  }
  return parsed;
}

/**
 * What routing knows about the ledger: no ledger, an unreadable one, or the
 * result of a check by repository search alone. Routing has no metrics file,
 * so an entry that waits on a number lands in `not_measured`.
 *
 * Routing runs inside a prompt hook the host stops after five seconds, after
 * Jev may already have used two and a half, so it cannot run one `git grep`
 * per `revisitWhen` term the way the command does. `searchAll` takes every
 * open term at once and returns `{ found, complete }`, with each lower-cased
 * term mapped to its first file or null (`searchTerms` in archetypes.mjs).
 * `complete` is false when that search ran out of time, so the caller can
 * check again later instead of remembering a partial answer.
 */
export function routeLedgerCheck(root, { searchAll }) {
  let ledger;
  try {
    ledger = loadLedgerForCheck(root);
  } catch (error) {
    return { status: "unreadable", error: error.message, due: [], not_measured: [], complete: true };
  }
  if (!ledger) return { status: "none", due: [], not_measured: [], complete: true };
  const terms = ledger.entries
    .filter((entry) => entry.status === "DEFERRED" && Array.isArray(entry.revisitWhen))
    .flatMap((entry) => entry.revisitWhen);
  const { found, complete } = searchAll(terms, root);
  const search = (needle) => found.get(String(needle).toLowerCase()) ?? null;
  const result = checkLedger(root, ledger, { search, metrics: null });
  return { status: "checked", due: result.due, not_measured: result.not_measured, complete };
}

// Text from the ledger and the repository goes into the route line, which
// must stay one plain line, so each piece is flattened to one line and capped.
const LINE_PIECE_LIMIT = 160;
const clip = (value) => {
  const flat = String(value ?? "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
  return flat.length > LINE_PIECE_LIMIT ? `${flat.slice(0, LINE_PIECE_LIMIT - 1).trimEnd()}…` : flat;
};

const MONTHS = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);

const recordedOn = (recordedAt) => {
  const date = String(recordedAt ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!date || !MONTHS[Number(date[2]) - 1]) return "";
  return ` on ${Number(date[3])} ${MONTHS[Number(date[2]) - 1]} ${date[1]}`;
};

/**
 * The lines routing hands the assistant, each with a key the hook uses to say
 * it once per session. Nothing is said about entries still waiting, so the
 * route never reads as an all-clear, and entries that wait on a number become
 * one count line instead of a line each on every prompt.
 */
export function ledgerRouteLines({ status, due = [], not_measured: notMeasured = [] }) {
  if (status === "unreadable") {
    return [{
      key: "unreadable",
      text: `The deferral ledger at ${LEDGER_PATH} cannot be read, so routing did not check whether any deferred part is due. \`super-outer ledger check\` shows the error.`,
    }];
  }
  const lines = [];
  if (due.length === 1) {
    const [item] = due;
    lines.push({
      key: `due:${item.id}`,
      text: `A part the owner deferred is now due: "${clip(quote(item))}". It was recorded${recordedOn(item.recorded_at)} to wait until the code contained "${clip(item.trigger)}", and ${clip(item.evidence)} now does. Super-outer tells the owner in one plain line and asks whether to build it now.`,
    });
  } else if (due.length > 1) {
    const listed = due.map((item) => `"${clip(quote(item))}" (the code now contains "${clip(item.trigger)}", in ${clip(item.evidence)})`);
    lines.push({
      key: `due:${due.map((item) => item.id).sort().join(",")}`,
      text: `${due.length} parts the owner deferred are now due: ${listed.join("; ")}. Super-outer tells the owner in one plain line and asks which to build now.`,
    });
  }
  if (notMeasured.length > 0) {
    const count = notMeasured.length;
    lines.push({
      key: `not-measured:${count}`,
      text: `${count} deferred ${count === 1 ? "part waits" : "parts wait"} on numbers nobody has supplied, so routing cannot tell whether ${count === 1 ? "it is" : "they are"} due. \`super-outer ledger check --metrics <file>\` checks ${count === 1 ? "it" : "them"} against supplied numbers.`,
    });
  }
  return lines;
}

export function ledgerHealth(ledger) {
  const open = ledger.entries.filter((entry) => entry.status === "DEFERRED").length;
  return {
    open,
    overloaded: open > LEDGER_ATTENTION_LIMIT,
    note:
      open > LEDGER_ATTENTION_LIMIT
        ? `The ledger holds ${open} open deferrals; past ${LEDGER_ATTENTION_LIMIT} it reads as a wishlist. Close or promote some before adding more.`
        : null,
  };
}

/**
 * Proof obligations — v5.2.
 *
 * Considered is not proven. The owner can decide "a recording must never be lost";
 * they cannot read the upload layer to confirm the code achieves it, and the
 * agent that wrote the code is not a witness. Each answered question whose
 * failure mode names a `provenBy` check becomes an obligation that starts
 * UNPROVEN and stays visible until evidence exists.
 *
 * Deliberately not auto-generated test code: recording an obligation as proved
 * without evidence would overstate proof, and overstating proof is the one
 * failure this tool must never have.
 */
export const OBLIGATIONS_PATH = ".engineering/super-outer/proof-obligations.json";

const emptyObligations = () => ({ schema_version: "1.0.0", obligations: [] });

export function readObligations(root) {
  const filename = join(root, OBLIGATIONS_PATH);
  if (!existsSync(filename)) return emptyObligations();
  try {
    const parsed = JSON.parse(readFileSync(filename, "utf8"));
    return Array.isArray(parsed?.obligations) ? parsed : emptyObligations();
  } catch {
    return emptyObligations();
  }
}

export function writeObligations(root, obligations) {
  const filename = join(root, OBLIGATIONS_PATH);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(obligations, null, 2)}\n`);
  return filename;
}

/**
 * Record an obligation for a decision that was actually taken. The decision
 * text and the chosen answer travel with the check so the obligation reads on
 * its own months later.
 */
export function recordObligation(root, { id, decision, answer, provenBy, now = null }) {
  if (!id || !provenBy) {
    throw new Error("A proof obligation needs an id and the check that would prove it");
  }
  const store = readObligations(root);
  const existing = store.obligations.find((entry) => entry.id === id);
  if (existing) {
    if (existing.decision === String(decision ?? "") && existing.answer === String(answer ?? "") && existing.provenBy === String(provenBy)) return store;
    Object.assign(existing, { decision: String(decision ?? ""), answer: String(answer ?? ""), provenBy: String(provenBy), status: "UNPROVEN", recorded_at: now, evidence: null, attested: false });
    delete existing.evidence_sha256;
    writeObligations(root, store);
    return store;
  }
  store.obligations.push({
    id,
    decision: String(decision ?? ""),
    answer: String(answer ?? ""),
    provenBy: String(provenBy),
    status: "UNPROVEN",
    recorded_at: now,
    evidence: null,
  });
  writeObligations(root, store);
  return store;
}

/**
 * Marking proved requires naming the evidence — a test file, a CI run, a
 * recorded journey. "It works" is not evidence.
 */
export function markObligationProved(root, id, evidence) {
  if (!evidence) throw new Error("Marking an obligation proved requires named evidence");
  const store = readObligations(root);
  const entry = store.obligations.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown proof obligation: ${id}`);
  entry.status = "PROVED";
  entry.evidence = String(evidence);
  entry.attested = false;
  entry.level = "source";
  delete entry.evidence_sha256;
  writeObligations(root, store);
  return entry;
}

/**
 * The delivery gate. Open obligations never silently pass a delivery claim;
 * they are reported the way independent-review gaps already are — visible and
 * advisory for ordinary work, so they cannot be forgotten but also cannot
 * block momentum the way approval ceremony did.
 */
export function openObligations(root) {
  return readObligations(root).obligations.filter((entry) => entry.status !== "PROVED");
}

export function describeObligationGap(root) {
  const open = openObligations(root);
  if (open.length === 0) return null;
  const names = open.slice(0, 3).map((entry) => entry.decision || entry.id);
  const rest = open.length - names.length;
  const tail = rest > 0 ? ` and ${rest} more` : "";
  return `${open.length === 1 ? "One decision is" : `${open.length} decisions are`} not yet proved: ${names.join("; ")}${tail}. A delivery claim must say so.`;
}
