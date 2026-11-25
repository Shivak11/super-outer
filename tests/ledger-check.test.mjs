import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  LEDGER_PATH,
  checkLedger,
  dueDeferrals,
  parseMetrics,
  readLedger,
  recordDeferrals,
  validateMeasuredWhen,
} from "../src/sequencing.mjs";
import { runCli } from "../src/cli.mjs";

const temporaryRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), "so-ledger-"));

const later = (id, extra = {}) => ({
  id,
  sequence: "defer",
  prompt: `Add ${id} later`,
  why: "consequence",
  archetype: null,
  ...extra,
});

const busyDatabase = {
  metric: "db_peak_busy_percent",
  comparison: ">",
  threshold: 60,
  says: "the database is busier than 60% at peak",
};

test("a measured trigger travels from the story walk into the ledger", () => {
  const root = temporaryRepo();
  recordDeferrals(root, [later("caching", { revisitWhen: [], measuredWhen: [busyDatabase] })]);
  const [entry] = readLedger(root).entries;
  assert.deepEqual(entry.measuredWhen, [busyDatabase]);
  assert.deepEqual(entry.revisitWhen, []);
});

test("an entry without a measured trigger keeps the old shape", () => {
  const root = temporaryRepo();
  recordDeferrals(root, [later("i18n", { revisitWhen: ["locale"] })]);
  const [entry] = readLedger(root).entries;
  assert.equal("measuredWhen" in entry, false);
});

test("a malformed measured trigger is refused when it is recorded", () => {
  const root = temporaryRepo();
  assert.throws(
    () => recordDeferrals(root, [later("caching", { measuredWhen: [{ metric: "db", comparison: "exceeds", threshold: 60 }] })]),
    /comparison/,
  );
  assert.equal(fs.existsSync(path.join(root, LEDGER_PATH)), false, "a refused entry writes nothing");
});

test("validation names each problem in a measured trigger", () => {
  assert.deepEqual(validateMeasuredWhen([busyDatabase]), []);
  const problems = validateMeasuredWhen([{ metric: "", comparison: "=", threshold: "60%" }]);
  assert.equal(problems.length, 3);
  assert.match(problems.join(" "), /metric/);
  assert.match(problems.join(" "), /comparison/);
  assert.match(problems.join(" "), /threshold/);
  assert.deepEqual(validateMeasuredWhen(undefined), []);
  assert.match(validateMeasuredWhen("db > 60").join(" "), /list/);
});

test("metrics must be numbers, and a value that is not is set aside with a reason", () => {
  const parsed = parseMetrics({ measured_at: "2026-10-12", metrics: { db_peak_busy_percent: 72, sessions: "200", ratio: Number.NaN } });
  assert.deepEqual(parsed.values, { db_peak_busy_percent: 72 });
  assert.equal(parsed.measured_at, "2026-10-12");
  assert.equal(parsed.problems.length, 2);
  assert.match(parsed.problems.join(" "), /sessions/);
  assert.throws(() => parseMetrics({ db_peak_busy_percent: 72 }), /metrics/);
  assert.throws(() => parseMetrics([]), /metrics/);
});

test("a measured number makes a deferral due with no change to the code", () => {
  const ledger = { entries: [{ id: "caching", prompt: "Add caching", status: "DEFERRED", revisitWhen: [], measuredWhen: [busyDatabase] }] };
  const quiet = checkLedger("/nowhere", ledger, { search: () => null, metrics: parseMetrics({ metrics: { db_peak_busy_percent: 55 } }) });
  assert.equal(quiet.due.length, 0);
  assert.equal(quiet.waiting.length, 1);

  const due = checkLedger("/nowhere", ledger, { search: () => null, metrics: parseMetrics({ metrics: { db_peak_busy_percent: 72 } }) });
  assert.equal(due.due.length, 1);
  assert.equal(due.due[0].source, "measured");
  assert.equal(due.due[0].value, 72);
  assert.match(due.due[0].evidence, /72/);
  assert.match(due.due[0].evidence, /60/);
});

test("each comparison means what it says at the boundary", () => {
  const entry = (comparison) => ({ id: comparison, prompt: comparison, status: "DEFERRED", measuredWhen: [{ metric: "m", comparison, threshold: 10 }] });
  const ledger = { entries: [">", ">=", "<", "<="].map(entry) };
  const atTen = checkLedger("/nowhere", ledger, { search: () => null, metrics: parseMetrics({ metrics: { m: 10 } }) });
  assert.deepEqual(atTen.due.map((item) => item.id).sort(), ["<=", ">="]);
});

test("a missing number is reported as not measured, never as fine", () => {
  const ledger = { entries: [{ id: "caching", prompt: "Add caching", status: "DEFERRED", measuredWhen: [busyDatabase] }] };
  const missing = checkLedger("/nowhere", ledger, { search: () => null, metrics: parseMetrics({ metrics: { other: 1 } }) });
  assert.equal(missing.due.length, 0);
  assert.equal(missing.waiting.length, 0);
  assert.equal(missing.not_measured.length, 1);
  assert.deepEqual(missing.not_measured[0].missing, ["db_peak_busy_percent"]);
  assert.match(missing.summary, /db_peak_busy_percent/);

  const noFile = checkLedger("/nowhere", ledger, { search: () => null, metrics: null });
  assert.equal(noFile.not_measured.length, 1);
  assert.match(noFile.summary, /no metrics file/i);
});

test("a hand-written trigger that cannot be checked is reported, never treated as not due", () => {
  const ledger = { entries: [{ id: "caching", prompt: "Add caching", status: "DEFERRED", measuredWhen: [{ metric: "db", comparison: "exceeds", threshold: 60 }] }] };
  const result = checkLedger("/nowhere", ledger, { search: () => null, metrics: parseMetrics({ metrics: { db: 99 } }) });
  assert.equal(result.due.length, 0);
  assert.equal(result.waiting.length, 0);
  assert.equal(result.cannot_check.length, 1);
  assert.match(result.summary, /cannot be checked/);
});

test("the repository search still makes a deferral due on its own", () => {
  const root = temporaryRepo();
  recordDeferrals(root, [later("rate-limit", { revisitWhen: ["public endpoint"] })]);
  const ledger = readLedger(root);
  const search = (needle) => (needle === "public endpoint" ? "src/api/public.ts" : null);
  const due = dueDeferrals(root, ledger, { search });
  assert.equal(due.length, 1);
  assert.equal(due[0].source, "repository");
  assert.equal(due[0].trigger, "public endpoint");
  assert.equal(due[0].evidence, "src/api/public.ts");
});

test("either kind of trigger is enough, and a due entry is listed once", () => {
  const ledger = { entries: [{ id: "caching", prompt: "Add caching", status: "DEFERRED", revisitWhen: ["redis"], measuredWhen: [busyDatabase] }] };
  const both = checkLedger("/nowhere", ledger, { search: () => "src/cache.ts", metrics: parseMetrics({ metrics: { db_peak_busy_percent: 90 } }) });
  assert.equal(both.due.length, 1);
  const searchOnly = checkLedger("/nowhere", ledger, { search: () => "src/cache.ts", metrics: null });
  assert.equal(searchOnly.due.length, 1);
  assert.equal(searchOnly.due[0].source, "repository");
  assert.equal(searchOnly.not_measured.length, 0, "a due entry is not also listed as unmeasured");
});

test("closed entries are never reported", () => {
  const ledger = { entries: [{ id: "caching", prompt: "Add caching", status: "DONE", measuredWhen: [busyDatabase] }] };
  const result = checkLedger("/nowhere", ledger, { search: () => "x", metrics: parseMetrics({ metrics: { db_peak_busy_percent: 90 } }) });
  assert.equal(result.due.length + result.waiting.length + result.not_measured.length + result.cannot_check.length, 0);
});

test("the plain summary uses no dashes", () => {
  const ledger = { entries: [
    { id: "a", prompt: "Add caching", status: "DEFERRED", measuredWhen: [busyDatabase] },
    { id: "b", prompt: "Add replicas", status: "DEFERRED", measuredWhen: [{ metric: "replica_lag", comparison: ">=", threshold: 5 }] },
    { id: "c", prompt: "Add search", status: "DEFERRED", revisitWhen: ["summary search"] },
    { id: "d", prompt: "Add limits", status: "DEFERRED", measuredWhen: [{ metric: "x", comparison: "?", threshold: 1 }] },
  ] };
  const result = checkLedger("/nowhere", ledger, {
    search: (needle) => (needle === "summary search" ? "src/search.ts" : null),
    metrics: parseMetrics({ metrics: { db_peak_busy_percent: 72, bad: "1" } }),
  });
  assert.doesNotMatch(result.summary, /[–—]| - /);
  assert.match(result.summary, /the database is busier than 60% at peak/);
  assert.match(result.summary, /Add search/);
  assert.match(result.summary, /replica_lag/);
});

// The command the owner or a CI job runs.

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const repository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-ledger-cli-"));
  git(root, "init", "-b", "main"); git(root, "config", "user.email", "test@example.com"); git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n"); git(root, "add", "."); git(root, "commit", "-m", "base");
  return root;
};
const invoke = async (argv, cwd) => {
  let out = ""; let err = "";
  const code = await runCli(argv, { cwd, stdout: { write: (value) => { out += value; } }, stderr: { write: (value) => { err += value; } } });
  return { code, out, err, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
};
const writeJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
};

test("ledger check reports a part made due by a supplied number", async () => {
  const root = repository();
  recordDeferrals(root, [later("caching", { revisitWhen: [], measuredWhen: [busyDatabase] })]);
  const metrics = path.join(root, "metrics.json");
  writeJson(metrics, { measured_at: "2026-10-12", metrics: { db_peak_busy_percent: 72 } });
  const result = await invoke(["ledger", "check", "--metrics", metrics], root);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.due.length, 1);
  assert.equal(result.json.due[0].id, "caching");
  assert.match(result.json.summary, /Due now: Add caching later/);
  assert.match(result.json.summary, /the database is busier than 60% at peak/);
});

test("ledger check runs the repository search without a metrics file", async () => {
  const root = repository();
  recordDeferrals(root, [later("rate-limit", { revisitWhen: ["publicEndpoint"] })]);
  git(root, "add", "."); git(root, "commit", "-m", "ledger");
  const quiet = await invoke(["ledger", "check"], root);
  assert.equal(quiet.code, 0, quiet.err);
  assert.equal(quiet.json.due.length, 0, "a term found only in the ledger itself does not count");

  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "api.mjs"), "export const publicEndpoint = true;\n");
  git(root, "add", "."); git(root, "commit", "-m", "endpoint");
  const due = await invoke(["ledger", "check"], root);
  assert.equal(due.json.due.length, 1);
  assert.equal(due.json.due[0].evidence, "src/api.mjs");
});

test("ledger check says so when there is no ledger", async () => {
  const root = repository();
  const result = await invoke(["ledger", "check"], root);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.ledger, null);
  assert.match(result.json.summary, /no deferral ledger/i);
});

test("ledger check refuses an unreadable ledger instead of reporting nothing due", async () => {
  const root = repository();
  fs.mkdirSync(path.dirname(path.join(root, LEDGER_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, LEDGER_PATH), "{ not json");
  const broken = await invoke(["ledger", "check"], root);
  assert.equal(broken.code, 1);
  assert.match(broken.err, /cannot be read/);

  writeJson(path.join(root, LEDGER_PATH), { schema_version: "1.0.0" });
  const shapeless = await invoke(["ledger", "check"], root);
  assert.equal(shapeless.code, 1);
  assert.match(shapeless.err, /entries/);
});

test("ledger check refuses a missing or malformed metrics file", async () => {
  const root = repository();
  recordDeferrals(root, [later("caching", { measuredWhen: [busyDatabase] })]);
  const missing = await invoke(["ledger", "check", "--metrics", path.join(root, "absent.json")], root);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /metrics file/i);

  const flat = path.join(root, "flat.json");
  writeJson(flat, { db_peak_busy_percent: 72 });
  const wrongShape = await invoke(["ledger", "check", "--metrics", flat], root);
  assert.equal(wrongShape.code, 1);
  assert.match(wrongShape.err, /metrics/);

  const unknown = await invoke(["ledger", "audit"], root);
  assert.equal(unknown.code, 1);
});
