// The prompt hook with Jev, run as Claude Code runs it: a new process for each
// event, JSON in and JSON out. A local server stands in for OpenRouter, so no
// test reaches the network. The hook is started asynchronously, because the
// local server answers from this test's own process.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildQuestions, DESIGN_KEYS, DEPTHS } from "../src/jev/questions.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";
import { json, startServer } from "./helpers/jev-server.mjs";

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const DESIGN_LINE = "This may be a user-facing new feature or redesign.";
const JEV_DECIDED = "Jev decided whether the design path applies.";
const FAKE_KEY = ["test", "only", "key", "0123456789"].join("-");

const temporary = (t, prefix) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

// A folder that looks like a repository with no task record.
const repository = (t) => {
  const root = temporary(t, "so-jev-hook-repo-");
  fs.mkdirSync(path.join(root, ".git"));
  return root;
};

const runHook = (event, input, env) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HOOK, event], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `hook exited ${code}`));
      resolve({ output: JSON.parse(stdout || "{}"), elapsed: Date.now() - started });
    });
    child.stdin.end(JSON.stringify(input));
  });

// Every answer the shipped question set asks for, with low readings unless a
// test says otherwise. `design: true` reads as building something people use.
const answersFor = ({ design = false, small = 0.05, protectedReading = 0.05, depth = "QUICK", confidence = 0.5, libraries = {} } = {}) => {
  const answers = {};
  for (const [key, question] of Object.entries(buildQuestions({ record: true }))) {
    if (question.type === "noul") answers[key] = { type: "noul", noul: 0.05 };
  }
  for (const key of DESIGN_KEYS) answers[key] = { type: "noul", noul: 0.05 };
  answers.surface_made = { type: "noul", noul: design ? 0.95 : 0.05 };
  answers.small_adjustment = { type: "noul", noul: small };
  answers.protected = { type: "noul", noul: protectedReading };
  answers.depth = { type: "choice", choice: depth, confidence, probabilities: Object.fromEntries(DEPTHS.map((d) => [d, d === depth ? confidence : 0])) };
  for (const [key, value] of Object.entries(libraries)) answers[key] = { type: "noul", noul: value };
  return answers;
};

const jevServer = async (t, respond) => {
  const server = await startServer(respond);
  t.after(() => server.close());
  return server;
};
const answering = (answers) => (_request, response) => json(response, 200, { model: "typesafe/jev-1.13-20260917", answers, usage: { input_tokens: 2600 } });

const jevEnv = (t, server, extra = {}) => {
  const state = temporary(t, "so-jev-hook-state-");
  return isolatedEnv({
    SUPER_OUTER_STATE_DIR: state,
    SUPER_OUTER_OPENROUTER_KEY: FAKE_KEY,
    SUPER_OUTER_JEV_ENDPOINT: server.url,
    SUPER_OUTER_CONFIG_DIR: temporary(t, "so-jev-hook-config-"),
    SUPER_OUTER_DATA_DIR: temporary(t, "so-jev-hook-data-"),
    NO_COLOR: "1",
    ...extra,
  }, { jev: "on" });
};
const offEnv = (t) => isolatedEnv({ SUPER_OUTER_STATE_DIR: temporary(t, "so-jev-hook-off-"), NO_COLOR: "1" });

const context = (result) => result.output.hookSpecificOutput?.additionalContext ?? "";
const prompt = (root, text, session = "jev-session") => ({ hook_event_name: "UserPromptSubmit", prompt: text, cwd: root, session_id: session });

test("Jev's reading gives the design path to a request the word lists miss", async (t) => {
  const root = repository(t);
  const text = "design the empty state screen for first-time users";
  const before = context(await runHook("UserPromptSubmit", prompt(root, text), offEnv(t)));
  assert.ok(!before.includes(DESIGN_LINE), before);

  const server = await jevServer(t, answering(answersFor({ design: true })));
  const after = context(await runHook("UserPromptSubmit", prompt(root, text), jevEnv(t, server)));
  assert.ok(after.includes(DESIGN_LINE), after);
  assert.ok(after.includes(JEV_DECIDED), after);
  assert.match(after, /Specialists: [^.]*product-ui-ux-motion/);
  assert.match(after, /routed this request as (FOCUSED|FULL|CRITICAL)\./);

  assert.equal(server.requests.length, 1);
  const [sent] = server.requests;
  assert.equal(sent.body.state, text);
  assert.equal(sent.body.model, "typesafe/jev-1.13");
  assert.equal(sent.headers.authorization, `Bearer ${FAKE_KEY}`);
});

test("a no from Jev removes only the design line and keeps the rest of the route", async (t) => {
  const root = repository(t);
  const text = "Add padding to the settings screen";
  const words = context(await runHook("UserPromptSubmit", prompt(root, text), offEnv(t)));
  assert.ok(words.includes(DESIGN_LINE), words);

  const server = await jevServer(t, answering(answersFor({ design: false, small: 0.9 })));
  const judged = context(await runHook("UserPromptSubmit", prompt(root, text), jevEnv(t, server)));
  assert.ok(!judged.includes(DESIGN_LINE), judged);
  assert.ok(judged.includes(JEV_DECIDED), judged);
  const routeFacts = (line) => line.split(DESIGN_LINE)[0].split(JEV_DECIDED)[0].trim();
  assert.equal(routeFacts(judged), routeFacts(words));
});

test("without a usable reading the route is the word lists' alone", async (t) => {
  const root = repository(t);
  const text = "design the empty state screen for first-time users";
  const words = context(await runHook("UserPromptSubmit", prompt(root, text), offEnv(t)));

  const failures = [
    ["an HTTP error", (_r, response) => json(response, 500, { error: "down" })],
    ["a malformed answer", (_r, response) => json(response, 200, { answers: { surface_made: { noul: "yes" } } })],
    ["a body that is not JSON", (_r, response) => json(response, 200, "not json")],
    ["a redirect", (_r, response) => { response.writeHead(302, { location: "http://127.0.0.1:9/elsewhere" }); response.end(); }],
  ];
  for (const [name, respond] of failures) {
    const server = await jevServer(t, respond);
    const result = context(await runHook("UserPromptSubmit", prompt(root, text), jevEnv(t, server)));
    assert.equal(result, words, name);
    assert.equal(server.requests.length, 1, name);
  }

  const slow = await jevServer(t, (_r, response) => setTimeout(() => json(response, 200, { answers: answersFor({ design: true }) }), 1500));
  const timed = await runHook("UserPromptSubmit", prompt(root, text), jevEnv(t, slow, { SUPER_OUTER_JEV_TIMEOUT_MS: "200" }));
  assert.equal(context(timed), words, "a timeout");
  assert.ok(timed.elapsed < 1500, `the hook waited ${timed.elapsed} ms`);

  const noKey = await jevServer(t, answering(answersFor({ design: true })));
  const env = jevEnv(t, noKey);
  delete env.SUPER_OUTER_OPENROUTER_KEY;
  assert.equal(context(await runHook("UserPromptSubmit", prompt(root, text), env)), words, "no key");
  assert.equal(noKey.requests.length, 0);

  const switchedOff = await jevServer(t, answering(answersFor({ design: true })));
  assert.equal(context(await runHook("UserPromptSubmit", prompt(root, text), jevEnv(t, switchedOff, { SUPER_OUTER_JEV: "off" }))), words, "switched off");
  assert.equal(switchedOff.requests.length, 0);
});

test("prompts that must not leave the computer are never sent", async (t) => {
  const root = repository(t);
  const server = await jevServer(t, answering(answersFor()));
  const env = jevEnv(t, server);
  // The same setup sends an ordinary prompt, so a zero below means the rule held.
  await runHook("UserPromptSubmit", prompt(root, "add a profile page where people can edit their photo"), env);
  assert.equal(server.requests.length, 1);

  const key = ["sk", "-or-v1-", "0123456789abcdef".repeat(4)].join("");
  const withheld = [
    ["a key", `here is the key ${key}, rotate it`],
    ["a small safe edit", "fix the typo in the readme"],
    ["a slash command", "/model opus"],
    ["host markup left in the text", "look at this <system-reminder> tag in the parser output"],
    ["a very short reply", "ok"],
  ];
  for (const [name, text] of withheld) {
    await runHook("UserPromptSubmit", prompt(root, text), env);
    assert.equal(server.requests.length, 1, name);
  }
  const long = await runHook("UserPromptSubmit", prompt(root, `build a page ${"x".repeat(60000)}`), env);
  assert.equal(server.requests.length, 1, "a prompt over 50,000 characters");
  assert.ok(long.elapsed < 5000, `a long prompt took ${long.elapsed} ms`);
});

test("while tests run, the hook cannot reach the real endpoint even with a key", async (t) => {
  const root = repository(t);
  const probe = path.join(temporary(t, "so-jev-hook-probe-"), "probe.jsonl");
  const env = isolatedEnv({
    SUPER_OUTER_STATE_DIR: temporary(t, "so-jev-hook-state-"),
    SUPER_OUTER_OPENROUTER_KEY: FAKE_KEY,
    SUPER_OUTER_HOOK_PROBE_FILE: probe,
  }, { jev: "on" });
  assert.ok(env.NODE_TEST_CONTEXT, "node --test sets NODE_TEST_CONTEXT for the processes it starts");
  await runHook("UserPromptSubmit", prompt(root, "design the empty state screen for first-time users"), env);
  const routed = fs.readFileSync(probe, "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.phase === "routed");
  assert.equal(routed.jev_reason, "test_network_refused");
  assert.equal(routed.route_reader, "words");
});

test("the probe file records which reader decided, and never the prompt", async (t) => {
  const root = repository(t);
  const server = await jevServer(t, answering(answersFor({ design: true })));
  const probe = path.join(temporary(t, "so-jev-hook-probe-"), "probe.jsonl");
  const text = "design the empty state screen for first-time users";
  await runHook("UserPromptSubmit", prompt(root, text), jevEnv(t, server, { SUPER_OUTER_HOOK_PROBE_FILE: probe }));
  const raw = fs.readFileSync(probe, "utf8");
  const routed = raw.trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.phase === "routed");
  assert.equal(routed.route_reader, "jev");
  assert.equal(routed.design_line, true);
  assert.equal(routed.jev_status, "used");
  assert.equal(raw.includes(text), false);
  assert.equal(raw.includes(FAKE_KEY), false);
});

test("the key reminder comes once per session with the first tool call", async (t) => {
  const root = repository(t);
  const env = isolatedEnv({ SUPER_OUTER_STATE_DIR: temporary(t, "so-jev-notice-state-"), NO_COLOR: "1" }, { jev: "on" });
  const tool = (session) => ({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "README.md" }, cwd: root, session_id: session });

  const silent = await runHook("UserPromptSubmit", prompt(root, "add a profile page"), env);
  assert.equal(silent.output.systemMessage, undefined, "prompt submission stays silent");

  const first = await runHook("PreToolUse", tool("notice-session"), env);
  assert.match(first.output.systemMessage ?? "", /Heads up/);
  assert.match(first.output.systemMessage, /SUPER_OUTER_OPENROUTER_KEY/);
  assert.match(first.output.systemMessage, /SUPER_OUTER_JEV=off/);
  const second = await runHook("PreToolUse", tool("notice-session"), env);
  assert.equal(second.output.systemMessage, undefined, "said once per session");

  const off = await runHook("PreToolUse", tool("other-session"), { ...env, SUPER_OUTER_JEV: "off" });
  assert.equal(off.output.systemMessage, undefined, "no reminder once Jev is switched off");
  const keyed = await runHook("PreToolUse", tool("third-session"), { ...env, SUPER_OUTER_OPENROUTER_KEY: FAKE_KEY });
  assert.equal(keyed.output.systemMessage, undefined, "no reminder once a key is placed");

  const config = temporary(t, "so-jev-notice-config-");
  fs.writeFileSync(path.join(config, "jev.env"), `SUPER_OUTER_OPENROUTER_KEY=${FAKE_KEY}\n`, { mode: 0o644 });
  fs.chmodSync(path.join(config, "jev.env"), 0o644);
  const exposed = await runHook("PreToolUse", tool("fourth-session"), { ...env, SUPER_OUTER_CONFIG_DIR: config });
  assert.match(exposed.output.systemMessage ?? "", /chmod 600/);
  assert.equal((exposed.output.systemMessage ?? "").includes(FAKE_KEY), false);
});

test("a key in Super-outer's own file switches Jev on, and the record is kept only when asked", async (t) => {
  const root = repository(t);
  const server = await jevServer(t, answering(answersFor({ design: true })));
  const config = temporary(t, "so-jev-file-config-");
  const data = temporary(t, "so-jev-file-data-");
  fs.writeFileSync(path.join(config, "jev.env"), `SUPER_OUTER_OPENROUTER_KEY="${FAKE_KEY}"\n`, { mode: 0o600 });
  const env = jevEnv(t, server, { SUPER_OUTER_CONFIG_DIR: config, SUPER_OUTER_DATA_DIR: data });
  delete env.SUPER_OUTER_OPENROUTER_KEY;

  await runHook("UserPromptSubmit", prompt(root, "design the empty state screen for first-time users"), env);
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].headers.authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(fs.existsSync(path.join(data, "jev-record")), false, "no record unless switched on");

  fs.appendFileSync(path.join(config, "jev.env"), "SUPER_OUTER_JEV_RECORD=on\n");
  await runHook("UserPromptSubmit", prompt(root, "design the empty state screen for first-time users"), env);
  const files = fs.readdirSync(path.join(data, "jev-record"));
  assert.equal(files.length, 1);
  const rows = fs.readFileSync(path.join(data, "jev-record", files[0]), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].prompt_head.length <= 120);
  assert.equal(JSON.stringify(rows[0]).includes(FAKE_KEY), false);
  assert.equal(fs.statSync(path.join(data, "jev-record", files[0])).mode & 0o077, 0);

  // A general OpenRouter variable never switches Jev on.
  const general = await jevServer(t, answering(answersFor({ design: true })));
  const generalEnv = jevEnv(t, general, { OPENROUTER_API_KEY: FAKE_KEY });
  delete generalEnv.SUPER_OUTER_OPENROUTER_KEY;
  await runHook("UserPromptSubmit", prompt(root, "design the empty state screen for first-time users"), generalEnv);
  assert.equal(general.requests.length, 0);
});

test("routes at FOCUSED and above name the engineering approach stage, and quicker routes do not", async (t) => {
  const root = repository(t);
  const approach = `includes the engineering approach stage, which comes before any implementation: ${path.resolve("skills/super-outer/references/engineering-approach.md")}`;
  const focused = context(await runHook("UserPromptSubmit", prompt(root, "design the empty state screen for first-time users"), offEnv(t)));
  assert.match(focused, /routed this request as (FOCUSED|FULL|CRITICAL)\./);
  assert.ok(focused.includes(approach), focused);
  const quick = context(await runHook("UserPromptSubmit", prompt(root, "move the save button 8px to the left"), offEnv(t)));
  assert.match(quick, /routed this request as QUICK\./);
  assert.ok(!quick.includes(approach), quick);
});

// 5.14.0: a short follow-up inside a task belongs to that task, but never when
// Jev reads it as design work, because that would drop the design line.
test("a follow-up that Jev reads as design work is routed afresh", async (t) => {
  const root = repository(t);
  const server = await jevServer(t, answering(answersFor({ design: true })));
  const env = jevEnv(t, server);
  const task = context(await runHook("UserPromptSubmit", prompt(root, "Migrate the recordings table to add an owner column and backfill it"), env));
  assert.match(task, /routed this request as (FULL|CRITICAL)\./);
  const followUp = context(await runHook("UserPromptSubmit", prompt(root, "do that stuck note recording one also"), env));
  assert.doesNotMatch(followUp, /already in progress/);
  assert.ok(followUp.includes(DESIGN_LINE), followUp);

  // With Jev reading no design work, the same follow-up joins the task.
  const quiet = await jevServer(t, answering(answersFor({ design: false, small: 0.9 })));
  const quietEnv = jevEnv(t, quiet);
  await runHook("UserPromptSubmit", prompt(root, "Migrate the recordings table to add an owner column and backfill it", "quiet-session"), quietEnv);
  const joined = context(await runHook("UserPromptSubmit", prompt(root, "do that stuck note recording one also", "quiet-session"), quietEnv));
  assert.match(joined, /already in progress/);
});
