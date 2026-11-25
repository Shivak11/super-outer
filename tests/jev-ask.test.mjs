// `super-outer jev ask`, run as another plugin runs it: a new process, the
// request on stdin, one JSON line out, exit code 0 every time. A local server
// stands in for OpenRouter, so no test reaches the network.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ASK_QUESTION_SET_VERSION, askKey, buildAskQuestions } from "../src/jev/questions.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";
import { json, startServer } from "./helpers/jev-server.mjs";

const BIN = path.resolve("bin/super-outer.mjs");
const FAKE_KEY = ["test", "only", "key", "0123456789"].join("-");
const OPTIONS = ["essay", "post", "chapter"];

const temporary = (t, prefix) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const runAsk = (args, text, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, "jev", "ask", ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(text);
  });

const parseOne = (stdout) => {
  const lines = stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, `expected one line, got: ${stdout}`);
  return JSON.parse(lines[0]);
};

const answers = (readings) => Object.fromEntries(Object.entries(readings).map(([option, p]) => [askKey(option), { type: "noul", noul: p }]));
const answering = (readings) => (_request, response) => json(response, 200, { model: "typesafe/jev-1.13-20260917", answers: answers(readings) });

const onEnv = (t, server, extra = {}) => isolatedEnv({
  SUPER_OUTER_OPENROUTER_KEY: FAKE_KEY,
  SUPER_OUTER_JEV_ENDPOINT: server ? server.url : "http://127.0.0.1:9/",
  SUPER_OUTER_CONFIG_DIR: temporary(t, "so-jev-ask-config-"),
  SUPER_OUTER_DATA_DIR: temporary(t, "so-jev-ask-data-"),
  ...extra,
}, { jev: "on" });

const args = ["--kind", "writing-form", "--options", OPTIONS.join(",")];

test("the question set asks one yes-or-no question for each option", () => {
  const questions = buildAskQuestions("writing-form", OPTIONS);
  assert.deepEqual(Object.keys(questions), OPTIONS.map(askKey));
  for (const question of Object.values(questions)) assert.equal(question.type, "noul");
  assert.match(ASK_QUESTION_SET_VERSION, /^6\.1\.0-r\d+$/);
});

test("bad arguments print a refused line and still exit 0", async (t) => {
  const env = isolatedEnv();
  const cases = [
    [],
    ["--kind", "Writing Form", "--options", "a,b"],
    ["--kind", "x".repeat(41), "--options", "a,b"],
    ["--kind", "form", "--options", "only-one"],
    ["--kind", "form", "--options", "a,b,c,d,e,f,g,h,i"],
    ["--kind", "form", "--options", "a,B"],
    ["--kind", "form", "--options", "a,a"],
    ["--kind", "form"],
  ];
  for (const bad of cases) {
    const result = await runAsk(bad, "turn my notes into an essay", env);
    assert.equal(result.code, 0, bad.join(" "));
    assert.deepEqual(parseOne(result.stdout), { answer: null, source: "refused", confident: false }, bad.join(" "));
  }
});

test("with Jev switched off the answer is null and the source is off", async (t) => {
  const result = await runAsk(args, "turn my notes into an essay", isolatedEnv());
  assert.equal(result.code, 0);
  assert.deepEqual(parseOne(result.stdout), { answer: null, source: "off", confident: false });
});

test("with no key the source is off", async (t) => {
  const env = isolatedEnv({ SUPER_OUTER_CONFIG_DIR: temporary(t, "so-jev-ask-nokey-") }, { jev: "on" });
  const result = await runAsk(args, "turn my notes into an essay", env);
  assert.deepEqual(parseOne(result.stdout), { answer: null, source: "off", confident: false });
});

test("a request that holds a secret, is empty or is too long is refused and nothing is sent", async (t) => {
  const server = await startServer(answering({ essay: 0.95, post: 0.05, chapter: 0.05 }));
  t.after(() => server.close());
  const env = onEnv(t, server);
  for (const text of [
    "use this key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH to write the essay",
    "   ",
    "word ".repeat(301),
  ]) {
    const result = await runAsk(args, text, env);
    assert.equal(result.code, 0);
    assert.deepEqual(parseOne(result.stdout), { answer: null, source: "refused", confident: false });
  }
  assert.equal(server.requests.length, 0);
});

test("a confident single answer from Jev is returned and recorded", async (t) => {
  const server = await startServer(answering({ essay: 0.93, post: 0.04, chapter: 0.1 }));
  t.after(() => server.close());
  const env = onEnv(t, server, { SUPER_OUTER_JEV_RECORD: "on" });
  const text = "turn my notes on hiring into a long essay";
  const result = await runAsk(args, text, env);
  assert.equal(result.code, 0);
  assert.deepEqual(parseOne(result.stdout), { answer: "essay", source: "jev", confident: true });
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0].body.state, text);
  assert.deepEqual(Object.keys(server.requests[0].body.questions), OPTIONS.map(askKey));

  const folder = path.join(env.SUPER_OUTER_DATA_DIR, "jev-record");
  const rows = fs.readdirSync(folder).flatMap((name) => fs.readFileSync(path.join(folder, name), "utf8").trim().split("\n").map((line) => JSON.parse(line)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recorded, true);
  assert.equal(rows[0].question_set, ASK_QUESTION_SET_VERSION);
  assert.equal(rows[0].kind, "ask:writing-form");
  assert.equal(rows[0].answer, "essay");
  assert.ok(!JSON.stringify(rows[0]).includes(FAKE_KEY));
});

test("an unconfident or split reading gives a null answer with source local", async (t) => {
  for (const readings of [
    { essay: 0.6, post: 0.05, chapter: 0.05 },
    { essay: 0.9, post: 0.85, chapter: 0.05 },
    { essay: 0.1, post: 0.05, chapter: 0.05 },
  ]) {
    const server = await startServer(answering(readings));
    t.after(() => server.close());
    const result = await runAsk(args, "turn my notes on hiring into something", onEnv(t, server));
    assert.equal(result.code, 0);
    assert.deepEqual(parseOne(result.stdout), { answer: null, source: "local", confident: false }, JSON.stringify(readings));
  }
});

test("a failed call gives source local and exit 0", async (t) => {
  const server = await startServer((_request, response) => json(response, 500, {}));
  t.after(() => server.close());
  const result = await runAsk(args, "turn my notes on hiring into something", onEnv(t, server));
  assert.equal(result.code, 0);
  assert.deepEqual(parseOne(result.stdout), { answer: null, source: "local", confident: false });
});
