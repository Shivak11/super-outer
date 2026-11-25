// The sending rules and the order of the checks are adapted from Super-outer Experimental's tests/route-check.test.mjs and tests/route-check-hook.test.mjs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { HOST_BLOCK_TAGS, TYPED_WRAPPER_TAGS, typedText } from "../src/host-blocks.mjs";
import { combineRoute } from "../src/jev/combine.mjs";
import { PROMPT_LIMITS, hasListedHostTag, holdsJsonObject, isSlashCommand, judgeRoute, looksHostWritten, stateFor } from "../src/jev/judge.mjs";
import { QUESTION_SET_VERSION } from "../src/jev/questions.mjs";
import { readAnswers } from "../src/jev/reading.mjs";
import { readRecord, recordDir } from "../src/jev/record.mjs";
import { looksSecret } from "../src/jev/prompt-filter.mjs";
import { routeTask } from "../src/router.mjs";
import { answerFixture, json, refuseRemoteFetch, startServer } from "./helpers/jev-server.mjs";

refuseRemoteFetch();

// The fake key is plain words, so a prompt can hold it without looking like
// a secret. That lets one test send a prompt containing the key and check
// that the record still never holds it.
// It holds no word that the filter reads as a credential mention.
const KEY = "fake-test-value-for-super-outer-0123";
const NOW = new Date("2026-10-07T10:00:00.000Z");
// The word router shows no design line for this request from held-out set
// H2, and Jev's recorded answer shows one.
const ORDINARY = "design the empty state screen for first-time users";
const OPENROUTER_64 = ["sk-or-v1-", "0123456789abcdef".repeat(4)].join("");

const temporary = (t, prefix) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const writeKeyFile = (configDir, text, mode = 0o600) => {
  const file = path.join(configDir, "jev.env");
  fs.writeFileSync(file, text, { mode });
  fs.chmodSync(file, mode);
  return file;
};
const withoutUndefined = (env) => Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
const answerWith = (fixture) => (_, response) => json(response, 200, answerFixture(fixture));

/**
 * A server that answers as Jev would, empty config and data folders, and an
 * environment built from nothing that holds a fake key and points the call
 * at the server. No test here reads the real environment's key or folders.
 * A test removes a variable by passing it as undefined.
 */
async function setup(t, { respond = answerWith("design-yes"), env = {}, keyFile = null, keyFileMode = 0o600 } = {}) {
  const server = await startServer(respond);
  t.after(() => server.close());
  const configDir = temporary(t, "jev-judge-config-");
  const dataDir = temporary(t, "jev-judge-data-");
  if (keyFile !== null) writeKeyFile(configDir, keyFile, keyFileMode);
  const baseEnv = withoutUndefined({
    SUPER_OUTER_CONFIG_DIR: configDir,
    SUPER_OUTER_DATA_DIR: dataDir,
    SUPER_OUTER_JEV_ENDPOINT: server.url,
    SUPER_OUTER_OPENROUTER_KEY: KEY,
    ...env,
  });
  const judge = (typed, { route, env: extra = {}, cwd = dataDir, now = NOW } = {}) =>
    judgeRoute({ typed, route: route ?? routeTask({ description: typed }), env: withoutUndefined({ ...baseEnv, ...extra }), cwd, now });
  return { server, configDir, dataDir, env: baseEnv, judge };
}

/** The result is the word router's route and design line, with no line from Jev. */
const assertWordRoute = (result, typed, route = routeTask({ description: typed })) => {
  assert.deepEqual(result.route, route);
  assert.deepEqual(result.design, combineRoute({ route, reading: null, text: typed }).design);
  assert.equal(result.design.source, "words");
  assert.deepEqual(result.lines, []);
};

// ------------------------------------------------------------- the helpers

test("the limits are 8 and 50,000 typed characters, 1,500 sent, 1,700 checked and 120 recorded", () => {
  assert.deepEqual(PROMPT_LIMITS, { minimumCharacters: 8, maximumCharacters: 50000, stateCharacters: 1500, promptHeadCharacters: 120, checkedCharacters: 1700 });
});

test("only the first 1,500 characters of the typed text are sent, and the cut never leaves half of a character", () => {
  const state = stateFor("a".repeat(1500) + "b".repeat(100));
  assert.equal(state.length, 1500);
  assert.equal(state.includes("b"), false);
  const split = stateFor("a".repeat(1499) + "\u{1F600}" + "b".repeat(50));
  assert.equal(split, "a".repeat(1499));
  assert.equal(split.isWellFormed(), true);
  assert.equal(stateFor("short"), "short");
});

test("a listed host tag is found whether it opens or closes, in any case and with attributes", () => {
  for (const name of [...HOST_BLOCK_TAGS, ...TYPED_WRAPPER_TAGS]) {
    assert.equal(hasListedHostTag(`before <${name}> after`), true, name);
    assert.equal(hasListedHostTag(`before </${name}> after`), true, name);
  }
  assert.equal(hasListedHostTag('typed <SYSTEM-REMINDER level="x"> more'), true);
  assert.equal(hasListedHostTag("a tag cut off at the end <cross-session-message"), true);
});

test("an angle bracket that is not a listed tag is not host markup", () => {
  for (const text of [
    "make the <div> wider on phones",
    "rename <system-reminders> in the docs",
    "the <system-reminder-banner> component",
    "explain what a system-reminder is",
    "<user-prompt-submit-hook>ls</user-prompt-submit-hook> is not in Super-outer's list",
  ]) {
    assert.equal(hasListedHostTag(text), false, text);
  }
});

test("a slash command is text that starts with a slash and a letter", () => {
  for (const text of ["/model", "/super-outer:outer design the screen", "  /clear"]) assert.equal(isSlashCommand(text), true, text);
  for (const text of ["build the /api/v1 route", "/ 2 is a fraction", "/1 thing", "// a comment", "/Users/someone/app add a settings page", ORDINARY]) assert.equal(isSlashCommand(text), false, text);
});

// --------------------------------------------------------------- a used reading

test("an ordinary request is sent once, with the key, the model, the typed words and 24 questions", async (t) => {
  const { server, judge } = await setup(t);
  const result = await judge(ORDINARY);
  assert.equal(server.requests.length, 1);
  const [sent] = server.requests;
  assert.equal(sent.headers.authorization, `Bearer ${KEY}`);
  assert.equal(sent.body.model, "typesafe/jev-1.13");
  assert.equal(sent.body.state, ORDINARY);
  assert.equal(Object.keys(sent.body.questions).length, 24);
  assert.deepEqual([result.status, result.reason, result.settingsState, result.model], ["used", null, "on", "typesafe/jev-1.13-20260917"]);
  assert.equal(typeof result.latencyMs, "number");
});

test("Jev's reading shows the design line for a request the word lists miss, with the new-feature shape and the product UI specialist", async (t) => {
  const { judge } = await setup(t);
  const route = routeTask({ description: ORDINARY });
  assert.equal(combineRoute({ route, reading: null, text: ORDINARY }).design.shown, false, "the word lists show no design line here");
  const result = await judge(ORDINARY, { route });
  assert.deepEqual(result.design, { shown: true, source: "jev", jev: true, words: false, guard: false });
  assert.deepEqual(result.route.change_shape, { shape: "new_feature", activation: true, depth_floor: "FOCUSED", reasons: ["jev_design"] });
  assert.ok(result.route.selected_modules.includes("product-ui-ux-motion"));
  assert.deepEqual([result.route.mode, result.route.question_budget], ["FOCUSED", 4]);
  assert.deepEqual(result.lines, []);
  assert.equal(route.change_shape.shape, null, "the word route passed in is unchanged");
});

test("Jev's no hides the line the word lists would show and leaves the rest of the route as it was", async (t) => {
  const typed = "add padding to the settings screen";
  const { judge } = await setup(t, { respond: answerWith("design-no") });
  const route = routeTask({ description: typed });
  const result = await judge(typed, { route });
  assert.equal(result.status, "used");
  assert.deepEqual(result.design, { shown: false, source: "jev", jev: false, words: true, guard: false });
  assert.deepEqual(result.route, route);
});

test("a long request is cut to its first 1,500 characters before it is sent", async (t) => {
  const { server, judge } = await setup(t);
  const typed = `${ORDINARY}. ${"The empty state should explain what to do first. ".repeat(60)}`.trim();
  assert.ok(typed.length > 1500 && !looksSecret(typed));
  assert.equal((await judge(typed)).status, "used");
  assert.equal(server.requests[0].body.state, typed.slice(0, 1500));
});

test("a request of exactly 8 or exactly 50,000 characters is still sent", async (t) => {
  const { server, judge } = await setup(t);
  const eight = "build ui";
  assert.equal(eight.length, 8);
  assert.notEqual(routeTask({ description: eight }).mode, "SMALL_SAFE");
  assert.equal((await judge(eight)).status, "used");
  const longest = `${ORDINARY} `.repeat(1000).slice(0, 50000);
  assert.equal(longest.trim().length, 50000);
  assert.equal((await judge(longest)).status, "used");
  assert.equal(server.requests.length, 2);
});

// ------------------------------------------------------------ nothing is sent
//
// Each test below first shows that its setup sends nothing for the prompt
// under test, then sends an ordinary prompt through the same setup and shows
// that the server receives it. A guard that stopped working would therefore
// fail the first count.

test("a SMALL_SAFE word route is never sent", async (t) => {
  const { server, judge } = await setup(t);
  const typed = "fix the typo in the readme";
  const result = await judge(typed);
  assert.deepEqual([result.status, result.reason, result.settingsState], ["skipped", "small_safe", "on"]);
  assertWordRoute(result, typed);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("SUPER_OUTER_JEV=off in the environment sends nothing", async (t) => {
  const { server, judge } = await setup(t);
  const result = await judge(ORDINARY, { env: { SUPER_OUTER_JEV: "off" } });
  assert.deepEqual([result.status, result.reason, result.settingsState], ["skipped", "off", "off"]);
  assertWordRoute(result, ORDINARY);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("SUPER_OUTER_JEV=off in the key file sends nothing, even with a key in the environment", async (t) => {
  const { server, configDir, judge } = await setup(t, { keyFile: "SUPER_OUTER_JEV=off\n" });
  assert.deepEqual([(await judge(ORDINARY)).reason, server.requests.length], ["off", 0]);
  writeKeyFile(configDir, "# switched back on\n");
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("with no key placed for Super-outer nothing is sent, and a general OPENROUTER_API_KEY does not count", async (t) => {
  const { server, judge } = await setup(t);
  const result = await judge(ORDINARY, { env: { SUPER_OUTER_OPENROUTER_KEY: undefined, OPENROUTER_API_KEY: KEY } });
  assert.deepEqual([result.status, result.reason, result.settingsState], ["skipped", "no_key", "no_key"]);
  assertWordRoute(result, ORDINARY);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("a key file that others can read sends nothing, and the same file readable only by its owner does", async (t) => {
  const { server, configDir, judge } = await setup(t, {
    env: { SUPER_OUTER_OPENROUTER_KEY: undefined },
    keyFile: `SUPER_OUTER_OPENROUTER_KEY=${KEY}\n`,
    keyFileMode: 0o644,
  });
  const result = await judge(ORDINARY);
  assert.deepEqual([result.status, result.reason, result.settingsState], ["skipped", "key_file_permissions", "key_file_permissions"]);
  assert.equal(server.requests.length, 0);
  fs.chmodSync(path.join(configDir, "jev.env"), 0o600);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("a request shorter than 8 characters is not sent", async (t) => {
  const { server, judge } = await setup(t);
  const typed = "add ui";
  assert.notEqual(routeTask({ description: typed }).mode, "SMALL_SAFE");
  const result = await judge(typed);
  assert.deepEqual([result.status, result.reason], ["skipped", "too_short"]);
  assertWordRoute(result, typed);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("a request longer than 50,000 characters is not sent, and the length is checked before the secret scan", async (t) => {
  const { server, judge } = await setup(t);
  const typed = `Build a new settings screen ${"a".repeat(50000)}`;
  assert.equal(looksSecret(typed), true, "this text would also be stopped by the secret scan");
  const result = await judge(typed);
  assert.deepEqual([result.status, result.reason], ["skipped", "too_long"]);
  // A two-megabyte prompt shaped to be slow to scan comes back at once.
  const hostile = "eyJabcdefghij-".repeat(150000);
  const started = performance.now();
  const huge = await judge(hostile, { route: routeTask({ description: ORDINARY }) });
  assert.equal(huge.reason, "too_long");
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("a slash command is not sent", async (t) => {
  const { server, judge } = await setup(t);
  const typed = `/super-outer:outer ${ORDINARY}`;
  assert.notEqual(routeTask({ description: typed }).mode, "SMALL_SAFE");
  const result = await judge(typed);
  assert.deepEqual([result.status, result.reason], ["skipped", "host_command"]);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("a request with a listed host tag left in it after the host's blocks are removed is not sent", async (t) => {
  const { server, judge } = await setup(t);
  const typed = typedText("Design the empty state screen and strip <system-reminder> tags from what the user sees");
  assert.ok(typed.includes("<system-reminder>"), "Super-outer's removal leaves a lone tag in the middle of a line");
  const result = await judge(typed);
  assert.deepEqual([result.status, result.reason], ["skipped", "host_markup"]);
  assert.equal(server.requests.length, 0);
  assert.equal((await judge("Design the empty state screen and strip the reminder tags from what the user sees")).status, "used");
  assert.equal(server.requests.length, 1);
});

test("a request that looks like it holds a key, a token or a password is not sent", async (t) => {
  const { server, judge } = await setup(t);
  for (const typed of [`${ORDINARY}, the key is ${OPENROUTER_64}`, `${ORDINARY} and the admin password is hunter2hunter2`]) {
    const result = await judge(typed);
    assert.deepEqual([result.status, result.reason], ["skipped", "secret_pattern"], typed);
    assertWordRoute(result, typed);
  }
  assert.equal(server.requests.length, 0);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(server.requests.length, 1);
});

test("the skip reasons are checked in their fixed order", async (t) => {
  const { server, judge } = await setup(t);
  const reason = async (typed, options) => (await judge(typed, options)).reason;
  assert.equal(await reason("fix the typo in the readme", { env: { SUPER_OUTER_OPENROUTER_KEY: undefined } }), "small_safe");
  assert.equal(await reason("add ui", { env: { SUPER_OUTER_JEV: "off" } }), "off");
  assert.equal(await reason("add ui", { env: { SUPER_OUTER_OPENROUTER_KEY: undefined } }), "no_key");
  assert.equal(await reason("/add ui", {}), "too_short");
  assert.equal(await reason(`/super-outer:outer ${"x".repeat(50000)}`, { route: routeTask({ description: ORDINARY }) }), "too_long");
  assert.equal(await reason(`/super-outer:outer ${ORDINARY} ${OPENROUTER_64}`), "host_command");
  assert.equal(await reason(`${ORDINARY} <system-reminder> ${OPENROUTER_64}`), "host_markup");
  assert.equal(server.requests.length, 0);
});

test("a call without a word route sends nothing and never throws", async (t) => {
  const { server, env } = await setup(t);
  const result = await judgeRoute({ typed: ORDINARY, env, now: NOW });
  assert.deepEqual([result.status, result.reason], ["skipped", "no_route"]);
  assert.equal(server.requests.length, 0);
  const nothing = await judgeRoute({ env });
  assert.equal(nothing.status, "skipped");
  const notText = await judgeRoute({ typed: 42, route: routeTask({ description: ORDINARY }), env });
  assert.deepEqual([notText.status, notText.reason], ["skipped", "too_short"]);
});

// ------------------------------------------------------------------ failures

const failureCases = [
  ["a server that never answers", "timeout", () => {}, { SUPER_OUTER_JEV_TIMEOUT_MS: "150" }],
  ["an HTTP error", "http_500", (_, response) => json(response, 500, { error: "server error" }), {}],
  ["a rate limit", "http_429", (_, response) => json(response, 429, { error: "slow down" }), {}],
  [
    "a redirect",
    "http_307",
    (_, response) => {
      response.writeHead(307, { location: "http://127.0.0.1:9/elsewhere" });
      response.end();
    },
    {},
  ],
  ["a body that is not JSON", "malformed", (_, response) => json(response, 200, "not json at all"), {}],
];
for (const [name, reason, respond, env] of failureCases) {
  test(`${name} gives the word route, with the reason ${reason}`, async (t) => {
    const { server, judge } = await setup(t, { respond, env });
    const result = await judge(ORDINARY);
    assert.deepEqual([result.status, result.reason, result.model], ["failed", reason, null]);
    assertWordRoute(result, ORDINARY);
    assert.equal(server.requests.length, 1, "one attempt and no retry");
  });
}

test("a port with nothing listening gives the word route, with the reason network", async (t) => {
  const { judge } = await setup(t);
  const closed = await startServer(() => {});
  await closed.close();
  const result = await judge(ORDINARY, { env: { SUPER_OUTER_JEV_ENDPOINT: closed.url } });
  assert.deepEqual([result.status, result.reason], ["failed", "network"]);
  assertWordRoute(result, ORDINARY);
});

test("an answer set with an answer missing or out of range gives the word route, with the reason malformed", async (t) => {
  const missing = answerFixture("design-yes");
  delete missing.answers.library_retirement;
  const outOfRange = answerFixture("design-yes");
  outOfRange.answers.surface_made.noul = 1.7;
  for (const body of [missing, outOfRange]) {
    const { judge } = await setup(t, { respond: (_, response) => json(response, 200, body) });
    const result = await judge(ORDINARY);
    assert.deepEqual([result.status, result.reason, result.model], ["failed", "malformed", "typesafe/jev-1.13-20260917"]);
    assertWordRoute(result, ORDINARY);
  }
});

test("with the record on, an answer set missing a question asked only for the record is malformed", async (t) => {
  const withoutDomain = answerFixture("design-yes");
  delete withoutDomain.answers.domain_habit_loops;
  const { judge } = await setup(t, { respond: (_, response) => json(response, 200, withoutDomain) });
  assert.equal((await judge(ORDINARY)).status, "used", "without the record the domain question is not asked");
  assert.deepEqual([(await judge(ORDINARY, { env: { SUPER_OUTER_JEV_RECORD: "on" } })).reason], ["malformed"]);
});

// ---------------------------------------------------------------- the record

test("the record is not kept unless it is switched on", async (t) => {
  const { dataDir, judge } = await setup(t);
  assert.equal((await judge(ORDINARY)).status, "used");
  assert.equal(fs.existsSync(recordDir(dataDir)), false);
});

test("with the record on, a used reading writes one row and the call also asks the 17 questions kept for the record", async (t) => {
  const { server, dataDir, judge } = await setup(t, { env: { SUPER_OUTER_JEV_RECORD: "on" } });
  const repository = path.join(dataDir, "MyProduct");
  fs.mkdirSync(path.join(repository, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repository, "src", "screens"), { recursive: true });
  const typed = `  ${ORDINARY},\n\n   with   a friendly picture and one button that starts the first recording right away  `;
  const result = await judge(typed, { cwd: path.join(repository, "src", "screens") });
  assert.equal(result.status, "used");
  assert.equal(Object.keys(server.requests[0].body.questions).length, 41);

  const rows = readRecord({ dataDir });
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(typeof row.latency_ms, "number");
  delete row.latency_ms;
  const text = typed.trim();
  assert.deepEqual(row, {
    ts: NOW.toISOString(),
    repo: "MyProduct",
    prompt_head: text.replace(/\s+/g, " ").slice(0, 120),
    prompt_sha256: createHash("sha256").update(text).digest("hex"),
    question_set: QUESTION_SET_VERSION,
    status: "used",
    reason: null,
    model: "typesafe/jev-1.13-20260917",
    input_tokens: 2600,
    words: { mode: "FOCUSED", design: false, libraries: [] },
    jev: readAnswers(answerFixture("design-yes").answers, { record: true }),
    decided: { design_shown: true, source: "jev", guard: false, mode: "FOCUSED", question_budget: 4 },
    lines: [],
  });
  assert.equal(row.prompt_head.length, 120);
  const file = path.join(recordDir(dataDir), "2026-10-07.jsonl");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(file, "utf8").includes(KEY), false);
});

test("the record can be switched on in the key file, and the repository name falls back to the working folder", async (t) => {
  const { dataDir, judge } = await setup(t, { keyFile: "SUPER_OUTER_JEV_RECORD=on\n" });
  const folder = path.join(dataDir, "loose-folder");
  fs.mkdirSync(folder);
  await judge(ORDINARY, { cwd: folder });
  const rows = readRecord({ dataDir });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].repo, "loose-folder");
});

test("with the record on, a failed call that was sent writes a row with no reading", async (t) => {
  const { dataDir, judge } = await setup(t, { respond: () => {}, env: { SUPER_OUTER_JEV_RECORD: "on", SUPER_OUTER_JEV_TIMEOUT_MS: "150" } });
  assert.equal((await judge(ORDINARY)).reason, "timeout");
  const [row] = readRecord({ dataDir });
  assert.deepEqual([row.status, row.reason, row.jev, row.model, row.input_tokens], ["failed", "timeout", null, null, null]);
  assert.deepEqual(row.decided, { design_shown: false, source: "words", guard: false, mode: "FOCUSED", question_budget: 4 });
});

test("with the record on, a prompt that was not sent never writes a row", async (t) => {
  const { server, dataDir, judge } = await setup(t, { env: { SUPER_OUTER_JEV_RECORD: "on" } });
  for (const typed of ["fix the typo in the readme", "add ui", `${ORDINARY} ${OPENROUTER_64}`, `/super-outer:outer ${ORDINARY}`]) {
    assert.equal((await judge(typed)).status, "skipped", typed);
  }
  assert.equal(server.requests.length, 0);
  assert.deepEqual(readRecord({ dataDir }), []);
  await judge(ORDINARY);
  assert.equal(readRecord({ dataDir }).length, 1, "the same setup writes a row for a prompt it sends");
});

test("a typed prompt that holds the key is still sent, and its row is replaced so the record never holds the key", async (t) => {
  const { server, dataDir, judge } = await setup(t, { env: { SUPER_OUTER_JEV_RECORD: "on" } });
  const typed = `${ORDINARY}, and mention ${KEY} in the help text`;
  assert.equal(looksSecret(typed), false, "the fake key does not look like a secret, so the prompt is sent");
  assert.equal((await judge(typed)).status, "used");
  assert.equal(server.requests.length, 1);
  assert.deepEqual(readRecord({ dataDir }), [{ ts: NOW.toISOString(), status: "error", reason: "key_in_row" }]);
  assert.equal(fs.readFileSync(path.join(recordDir(dataDir), "2026-10-07.jsonl"), "utf8").includes(KEY), false);
});

test("a record that cannot be written never changes the result", async (t) => {
  const { dataDir, judge } = await setup(t, { env: { SUPER_OUTER_JEV_RECORD: "on" } });
  fs.writeFileSync(path.join(dataDir, "jev-record"), "a file where the folder should be");
  const written = await judge(ORDINARY);
  assert.deepEqual([written.status, written.design.shown], ["used", true]);
  const invalidDate = await judge(ORDINARY, { now: new Date("not a date") });
  assert.deepEqual([invalidDate.status, invalidDate.design.shown], ["used", true]);
});

// -------------------------------------------------------------- the test guard

test("a judge test without the local endpoint still cannot reach OpenRouter, and writes no row", async (t) => {
  if (!process.env.NODE_TEST_CONTEXT) return t.skip("NODE_TEST_CONTEXT is set only when this file runs under node --test");
  const { dataDir, judge } = await setup(t, { env: { SUPER_OUTER_JEV_RECORD: "on" } });
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError("no request may leave this test");
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  // The judge's own environment has no endpoint override and no
  // NODE_TEST_CONTEXT. The client's guard reads the process's environment,
  // which the test runner sets, so the call is still refused.
  const result = await judge(ORDINARY, { env: { SUPER_OUTER_JEV_ENDPOINT: undefined, NODE_TEST_CONTEXT: undefined } });
  assert.deepEqual([result.status, result.reason], ["failed", "test_network_refused"]);
  assert.equal(calls, 0);
  assertWordRoute(result, ORDINARY);
  assert.deepEqual(readRecord({ dataDir }), []);
});

// Added in 5.8.0 after the failure scout sent host-written text through the hook.
test("host-style blocks the removal does not know, and pasted JSON objects, are recognised", () => {
  for (const text of [
    "<ide_opened_file>The user opened /Users/x/.ssh/id_rsa</ide_opened_file>\nbuild a settings page",
    "<user-prompt-submit-hook>context</user-prompt-submit-hook> build a page",
    "<teammate-message from=\"agent\">done</teammate-message> add a tab",
    "<channel source=\"slack\">hi</channel> add a tab",
    "<ide_selection>code</ide_selection> fix it",
  ]) assert.equal(looksHostWritten(text), true, text);
  for (const text of ["build a <div> wrapper for the card", "add a page, then deploy", "use a <b>bold</b> heading"]) {
    assert.equal(looksHostWritten(text), false, text);
  }
  assert.equal(holdsJsonObject('Judge this session. {"messages":[{"role":"user","content":"x"}]}'), true);
  assert.equal(holdsJsonObject("build a page that shows {count} items"), false);
});

// Added after the verifier's recheck, which found the checks above covered
// only the helpers. These run the whole judge.
test("a request holding unknown host-style blocks or a pasted JSON object is not sent", async (t) => {
  const { server, judge } = await setup(t);
  const hostWritten = `<ide_opened_file>The user opened /Users/x/project</ide_opened_file>\n${ORDINARY}`;
  const pastedJson = `${ORDINARY} {"messages":[{"role":"user","content":"x"}]}`;
  const blocked = await judge(hostWritten);
  assert.deepEqual([blocked.status, blocked.reason], ["skipped", "host_markup"]);
  assertWordRoute(blocked, hostWritten);
  const json = await judge(pastedJson);
  assert.deepEqual([json.status, json.reason], ["skipped", "machine_text"]);
  assertWordRoute(json, pastedJson);
  assert.equal(server.requests.length, 0);
});

test("a request that only mentions a password or a key is not sent, and gets the word route", async (t) => {
  const { server, judge } = await setup(t);
  for (const typed of ["design the login screen with password reset", "design the settings screen where people paste their api key"]) {
    const result = await judge(typed);
    assert.deepEqual([result.status, result.reason], ["skipped", "secret_pattern"], typed);
    assertWordRoute(result, typed);
  }
  assert.equal(server.requests.length, 0);
});

test("old record files are deleted on every judged prompt, also one that is not sent and also with the record off", async (t) => {
  const { dataDir, judge } = await setup(t);
  const folder = recordDir(dataDir);
  const plant = () => {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "2026-09-07.jsonl"), "{}\n");
    fs.writeFileSync(path.join(folder, "2026-09-08.jsonl"), "{}\n");
  };
  plant();
  assert.equal((await judge("add ui")).status, "skipped");
  assert.deepEqual(fs.readdirSync(folder), ["2026-09-08.jsonl"], "30 days old is deleted, 29 days old stays");
  plant();
  await judge("fix the typo in the readme");
  assert.deepEqual(fs.readdirSync(folder), ["2026-09-08.jsonl"], "a SMALL_SAFE prompt also prunes");
});

test("with the record on, a call that could not connect or was refused writes no row", async (t) => {
  const { dataDir, judge } = await setup(t, { env: { SUPER_OUTER_JEV_RECORD: "on" } });
  const closed = await startServer(() => {});
  await closed.close();
  assert.equal((await judge(ORDINARY, { env: { SUPER_OUTER_JEV_ENDPOINT: closed.url } })).reason, "network");
  assert.equal((await judge(ORDINARY, { env: { SUPER_OUTER_JEV_ENDPOINT: "https://example.com/api" } })).reason, "endpoint_refused");
  assert.deepEqual(readRecord({ dataDir }), []);
  await judge(ORDINARY);
  assert.equal(readRecord({ dataDir }).length, 1, "the same setup writes a row for a call that was answered");
});

// 5.8.1: a 50,000-character request of "pin:" repeated took 7 seconds to
// check in 5.8.0, beyond the hook's 5-second limit. The check now covers only
// the part that is sent, and every rule runs in time proportional to the text.
test("each credential word with each separator, repeated to the maximum length, is judged in under 500 ms", async (t) => {
  const { judge } = await setup(t);
  const words = ["pin", "pass", "password", "cred", "creds", "seed", "token", "login", "sign in", "code", "key", "secret", "otp", "2fa"];
  const separators = [":", "=", " ", "/", "-", "'", " is ", "_", ".", "  "];
  const slow = [];
  for (const word of words) {
    for (const separator of separators) {
      const unit = `${word}${separator}`;
      const typed = `build the new settings screen for the billing app ${unit.repeat(Math.floor((PROMPT_LIMITS.maximumCharacters - 60) / unit.length))}`;
      const started = performance.now();
      await judge(typed);
      const took = performance.now() - started;
      if (took >= 500) slow.push(`${JSON.stringify(unit)}: ${Math.round(took)} ms`);
    }
  }
  assert.deepEqual(slow, []);
});

test("the filter alone checks 50,000 characters of each credential word and separator in under 500 ms", () => {
  const slow = [];
  // seed+ and login+ reach the 5.8.1 rules without an earlier rule matching,
  // so a slow pattern there shows up here.
  for (const unit of ["pin:", "cred:", "seed:", "login:", "pass ", "token=", "code ", "key:", "p@ss", "4111 ", "sign in /", "seed+", "login+"]) {
    const text = unit.repeat(Math.floor(50000 / unit.length));
    const started = performance.now();
    looksSecret(text);
    const took = performance.now() - started;
    if (took >= 500) slow.push(`${JSON.stringify(unit)}: ${Math.round(took)} ms`);
  }
  assert.deepEqual(slow, []);
});

test("the secret check covers the part that is sent and 200 characters past the cut", async (t) => {
  const { server, judge } = await setup(t);
  const filler = (length) => `${ORDINARY} `.repeat(Math.ceil(length / (ORDINARY.length + 1))).slice(0, length);
  const inside = `${filler(1000)} pin 4821 ${filler(1000)}`;
  // The PIN starts at character 1,495, so its digits fall past the 1,500 sent.
  const straddling = `${filler(1494)} pin 4821 ${filler(500)}`;
  const past = `${filler(1800)} pin 4821`;
  assert.equal((await judge(inside)).reason, "secret_pattern");
  assert.equal((await judge(straddling)).reason, "secret_pattern");
  assert.equal(server.requests.length, 0);
  const sent = await judge(past);
  assert.equal(sent.status, "used");
  assert.equal(server.requests.length, 1);
  assert.equal(JSON.stringify(server.requests[0].body).includes("4821"), false, "the part after the cut is never sent");
});

// From the verifier's review of 5.8.1: the judge's two checks and its
// 1,700-character cut each needed a test that only they pass.
test("a card number split by long runs of spaces is withheld by the check with white space collapsed", async (t) => {
  const { server, judge } = await setup(t);
  const typed = `${ORDINARY}, test card 4111      1111      1111      1111`;
  assert.equal(looksSecret(typed), false, "the check as typed does not see it");
  assert.equal((await judge(typed)).reason, "secret_pattern");
  assert.equal(server.requests.length, 0);
});

test("a card number that starts just before the 1,500th character is withheld", async (t) => {
  const { server, judge } = await setup(t);
  const filler = `${ORDINARY} `.repeat(40).slice(0, 1489);
  const typed = `${filler} 4111 1111 1111 1111 and then more words about the screen`;
  assert.equal((await judge(typed)).reason, "secret_pattern");
  assert.equal(server.requests.length, 0);
});

// A key broken by a line break right after its prefix is seen only by the
// check as typed, which joins the lines; collapsing white space leaves a
// space after the prefix. So this guards the as-typed check's own margin.
test("a key broken after its prefix 1,550 characters in is withheld by the check as typed", async (t) => {
  const { server, judge } = await setup(t);
  const filler = `${ORDINARY} `.repeat(40).slice(0, 1549);
  const key = ["gh", "p_", "\n    ", "abcdefghijklmnopqrstuvwxyz0123456789"].join("");
  const typed = `${filler} ${key} and then more words about the screen`;
  assert.equal(looksSecret(typed.replace(/\s+/g, " ").slice(0, 1700)), false, "the collapsed check does not see it");
  assert.equal((await judge(typed)).reason, "secret_pattern");
  assert.equal(server.requests.length, 0);
});

// The collapsed check reaches 1,700 characters of the collapsed text. This
// card number is seen only after collapsing and sits past the 1,500th
// collapsed character, so cutting that check at 1,500 fails here.
test("a card number seen only after collapsing, 1,560 collapsed characters in, is withheld", async (t) => {
  const { server, judge } = await setup(t);
  const filler = `${ORDINARY} `.repeat(40).slice(0, 1559);
  const typed = `${filler} 4111      1111      1111      1111 and more words`;
  assert.equal(looksSecret(typed.slice(0, 1700)), false, "the check as typed does not see it");
  assert.equal((await judge(typed)).reason, "secret_pattern");
  assert.equal(server.requests.length, 0);
});
