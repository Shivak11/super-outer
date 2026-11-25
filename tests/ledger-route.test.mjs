import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { LEDGER_PATH, ledgerRouteLines, routeLedgerCheck } from "../src/sequencing.mjs";
import { defaultSearch, searchTerms } from "../src/archetypes.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

// Routing checks the deferral ledger on its own, so the owner hears about a
// deferred part that has come due without anyone running `ledger check`.

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const FULL_PROMPT = "Add a background queue that retries failed payment webhooks and backfills the orders table";

const entry = (id, extra = {}) => ({
  id,
  prompt: `Add ${id} later`,
  why: "consequence",
  archetype: null,
  status: "DEFERRED",
  revisitWhen: [],
  recorded_at: "2026-10-12T09:30:00.000Z",
  ...extra,
});

const waitsOnNumber = (id) => entry(id, {
  revisitWhen: [`${id}-term-nobody-wrote`],
  measuredWhen: [{ metric: "db_peak_busy_percent", comparison: ">", threshold: 60 }],
});

// git grep searches tracked files only, so every fixture file is committed.
const repo = ({ ledger = null, ledgerText = null, files = {} } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-ledger-route-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  if (ledger !== null || ledgerText !== null) {
    fs.mkdirSync(path.join(root, ".engineering/super-outer"), { recursive: true });
    fs.writeFileSync(path.join(root, LEDGER_PATH), ledgerText ?? `${JSON.stringify(ledger, null, 2)}\n`);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  return root;
};

const ledgerOf = (...entries) => ({ schema_version: "1.0.0", entries });

const session = () => ({
  stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-ledger-route-state-")),
  id: `ledger-session-${Math.random().toString(16).slice(2)}`,
});

const contextFor = (root, prompt, current = session(), { withSession = true } = {}) => {
  const env = isolatedEnv({
    SUPER_OUTER_STATE_DIR: current.stateDir,
    SUPER_OUTER_CLIENT: "codex",
    SUPER_OUTER_JEV: "off",
  });
  delete env.SUPER_OUTER_SESSION_ID;
  const result = spawnSync(process.execPath, [HOOK, "UserPromptSubmit"], {
    cwd: root,
    input: JSON.stringify({
      cwd: root,
      client: "codex",
      ...(withSession ? { session_id: current.id } : {}),
      turn_id: "user-1",
      prompt,
    }),
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}").hookSpecificOutput?.additionalContext ?? "";
};

// --- the search routing runs ------------------------------------------------

test("one search finds each term's first file, the same file the command reports", () => {
  const root = repo({
    files: {
      "src/a.mjs": "export const PublicEndpoint = true;\n",
      "src/b.mjs": "const webhook = 'retry';\nconst publicendpoint = 1;\n",
      "src/c.mjs": "nothing here\n",
    },
  });
  const { found, complete } = searchTerms(["publicEndpoint", "Webhook", "webhook", "serviceWorker"], root);
  assert.equal(complete, true);
  assert.deepEqual([...found.entries()], [
    ["publicendpoint", "src/a.mjs"],
    ["webhook", "src/b.mjs"],
    ["serviceworker", null],
  ]);
  for (const term of ["publicEndpoint", "Webhook", "serviceWorker"]) {
    assert.equal(found.get(term.toLowerCase()), defaultSearch(term, root), term);
  }
});

test("a term inside a longer term is still found", () => {
  const root = repo({ files: { "src/api.mjs": "// a public endpoint for partners\n" } });
  const { found } = searchTerms(["public endpoint", "endpoint"], root);
  assert.equal(found.get("public endpoint"), "src/api.mjs");
  assert.equal(found.get("endpoint"), "src/api.mjs");
});

test("the search ignores the ledger and the vendored skill, which name every term", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { revisitWhen: ["publicEndpoint"] })),
    files: { "skills/super-outer/references/archetypes/x.json": "publicEndpoint\n" },
  });
  assert.deepEqual(searchTerms(["publicEndpoint"], root), { found: new Map([["publicendpoint", null]]), complete: true });
});

test("a search that runs past its deadline is reported as incomplete", () => {
  const root = repo({ files: { "src/a.mjs": "alpha\n", "src/b.mjs": "beta\n" } });
  let now = 0;
  const slowClock = () => { now += 500; return now; };
  const late = searchTerms(["alpha", "beta"], root, { budgetMs: 800, clock: slowClock });
  assert.equal(late.complete, false);
  assert.equal(late.found.get("beta"), null);
  // git itself stopped by the limit says nothing about the code either.
  assert.equal(searchTerms(["alpha"], root, { budgetMs: 1 }).complete, false);
});

test("a common term does not make the search read every file for a rare one", () => {
  const files = {};
  for (let index = 0; index < 120; index += 1) files[`src/file-${String(index).padStart(3, "0")}.mjs`] = "export const user = 1;\n";
  files["src/zz-last.mjs"] = "export const serviceWorker = true;\n";
  const root = repo({ files });
  let reads = 0;
  const countingClock = () => { reads += 1; return 0; };
  const { found, complete } = searchTerms(["user", "serviceWorker"], root, { clock: countingClock });
  assert.equal(complete, true);
  assert.equal(found.get("user"), "src/file-000.mjs");
  assert.equal(found.get("serviceworker"), "src/zz-last.mjs");
  // The clock is read once per file, so far fewer than 121 files were read.
  assert.ok(reads < 40, `read about ${reads} files`);
});

// --- what routing reads from the ledger -------------------------------------

test("routing reads no ledger as nothing to say, and an unreadable one as unreadable", () => {
  assert.equal(routeLedgerCheck(repo(), { searchAll: searchTerms }).status, "none");
  const broken = routeLedgerCheck(repo({ ledgerText: "{ not json" }), { searchAll: searchTerms });
  assert.equal(broken.status, "unreadable");
  assert.deepEqual(ledgerRouteLines(broken).map((line) => line.key), ["unreadable"]);
  assert.match(ledgerRouteLines(broken)[0].text, /cannot be read, so routing did not check/);
});

test("a due part becomes one plain line that names the part, the term and the file", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { prompt: "Add rate limits to the public API", revisitWhen: ["publicEndpoint"] })),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  const check = routeLedgerCheck(root, { searchAll: searchTerms });
  assert.equal(check.status, "checked");
  assert.equal(check.complete, true);
  const lines = ledgerRouteLines(check);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].key, "due:rate-limits");
  assert.match(lines[0].text, /"Add rate limits to the public API"/);
  assert.match(lines[0].text, /"publicEndpoint"/);
  assert.match(lines[0].text, /src\/api\.mjs/);
  assert.match(lines[0].text, /12 October 2026/);
  assert.match(lines[0].text, /Super-outer tells the owner in one plain line/);
});

test("text from the ledger and the code stays on one bounded line", () => {
  const longPrompt = `Add rate limits\nto the public API\t${"and more detail ".repeat(40)}`;
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { prompt: longPrompt, revisitWhen: ["publicEndpoint"] })),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  const [line] = ledgerRouteLines(routeLedgerCheck(root, { searchAll: searchTerms }));
  assert.doesNotMatch(line.text, /[\n\t]/);
  assert.match(line.text, /"Add rate limits to the public API and more detail/);
  assert.match(line.text, /…"/);
  assert.ok(line.text.length < 500, `${line.text.length} characters`);
});

test("several due parts share one line", () => {
  const root = repo({
    ledger: ledgerOf(
      entry("rate-limits", { revisitWhen: ["publicEndpoint"] }),
      entry("audit-log", { revisitWhen: ["adminRole"], recorded_at: null }),
    ),
    files: { "src/api.mjs": "export const publicEndpoint = true;\nexport const adminRole = 'admin';\n" },
  });
  const lines = ledgerRouteLines(routeLedgerCheck(root, { searchAll: searchTerms }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].key, "due:audit-log,rate-limits");
  assert.match(lines[0].text, /^2 parts the owner deferred are now due/);
  assert.match(lines[0].text, /"Add rate-limits later"/);
  assert.match(lines[0].text, /"Add audit-log later"/);
});

test("parts that wait on numbers become one count line that names none of them", () => {
  const root = repo({ ledger: ledgerOf(waitsOnNumber("read-replica"), waitsOnNumber("cache-layer"), waitsOnNumber("sharding")) });
  const lines = ledgerRouteLines(routeLedgerCheck(root, { searchAll: searchTerms }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].key, "not-measured:3");
  assert.match(lines[0].text, /^3 deferred parts wait on numbers nobody has supplied/);
  assert.match(lines[0].text, /super-outer ledger check --metrics/);
  assert.doesNotMatch(lines[0].text, /read-replica|cache-layer|sharding/);
});

test("parts still waiting for a code change produce no line at all", () => {
  const root = repo({ ledger: ledgerOf(entry("offline-mode", { revisitWhen: ["serviceWorker"] })) });
  assert.deepEqual(ledgerRouteLines(routeLedgerCheck(root, { searchAll: searchTerms })), []);
});

// --- the prompt hook --------------------------------------------------------

test("a routed prompt carries the due part next to the route", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { prompt: "Add rate limits to the public API", revisitWhen: ["publicEndpoint"] })),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  const context = contextFor(root, FULL_PROMPT);
  assert.match(context, /Super-outer routed this request as/);
  assert.match(context, /A part the owner deferred is now due: "Add rate limits to the public API"/);
});

test("the due part is said once per session, not on every prompt", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { revisitWhen: ["publicEndpoint"] }), waitsOnNumber("read-replica")),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  const current = session();
  const first = contextFor(root, FULL_PROMPT, current);
  assert.match(first, /is now due/);
  assert.match(first, /1 deferred part waits on numbers nobody has supplied/);
  const second = contextFor(root, FULL_PROMPT, current);
  assert.match(second, /Super-outer routed this request as/);
  assert.doesNotMatch(second, /is now due|waits on numbers/);
  // A new session hears it again.
  assert.match(contextFor(root, FULL_PROMPT), /is now due/);
});

test("a part that comes due later in the session is still said, before any commit", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { revisitWhen: ["publicEndpoint"] }), entry("audit-log", { revisitWhen: ["adminRole"] })),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  const current = session();
  assert.match(contextFor(root, FULL_PROMPT, current), /"Add rate-limits later"/);
  fs.writeFileSync(path.join(root, "src/api.mjs"), "export const publicEndpoint = true;\nexport const adminRole = 'admin';\n");
  const later = contextFor(root, FULL_PROMPT, current);
  assert.match(later, /"Add audit-log later"/);
  assert.doesNotMatch(later, /"Add rate-limits later"/);
});

test("without a session id the due part is still said only once", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { revisitWhen: ["publicEndpoint"] })),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  const current = session();
  assert.match(contextFor(root, FULL_PROMPT, current, { withSession: false }), /is now due/);
  assert.doesNotMatch(contextFor(root, FULL_PROMPT, current, { withSession: false }), /is now due/);
});

test("an unreadable ledger never costs the prompt its route", () => {
  const context = contextFor(repo({ ledgerText: "{ not json" }), FULL_PROMPT);
  assert.match(context, /Super-outer routed this request as/);
  assert.match(context, /Question allowance/);
  assert.match(context, /deferral ledger at \.engineering\/super-outer\/ledger\.json cannot be read/);
});

test("a repository without a ledger gets the route and no ledger line", () => {
  const context = contextFor(repo(), FULL_PROMPT);
  assert.match(context, /Super-outer routed this request as/);
  assert.doesNotMatch(context, /deferred|ledger/i);
});

test("a small safe prompt stays silent even when a part is due", () => {
  const root = repo({
    ledger: ledgerOf(entry("rate-limits", { revisitWhen: ["publicEndpoint"] })),
    files: { "src/api.mjs": "export const publicEndpoint = true;\n" },
  });
  assert.equal(contextFor(root, "Fix the typo in the README"), "");
});
