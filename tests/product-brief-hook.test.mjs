import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { isolatedEnv } from "./helpers/isolated-env.mjs";

// v5.10: the prompt hook points new work at the product brief and story walk,
// reads the brief's header for stated demand, and asks for the assumption
// check on changes a customer will see.

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const repo = ({ brief = null } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-brief-repo-"));
  git(root, "init", "-b", "main");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  if (brief !== null) {
    fs.mkdirSync(path.join(root, ".engineering/super-outer"), { recursive: true });
    fs.writeFileSync(path.join(root, ".engineering/super-outer/product-brief.md"), brief);
  }
  return root;
};

const contextFor = (root, prompt) => {
  const env = isolatedEnv({
    SUPER_OUTER_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-brief-state-")),
    SUPER_OUTER_CLIENT: "codex",
    SUPER_OUTER_JEV: "off",
  });
  const result = spawnSync(process.execPath, [HOOK, "UserPromptSubmit"], {
    cwd: root,
    input: JSON.stringify({ cwd: root, client: "codex", session_id: "brief-session", turn_id: "user-1", prompt }),
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}").hookSpecificOutput?.additionalContext ?? "";
};

const header = (fields) => `---\nschema: super-outer-product-brief/1\n${fields}\nupdated: 2026-10-12\n---\n\n# Product brief\n`;

test("new work without a brief is pointed at the story walk and the brief interview", () => {
  for (const prompt of [
    "Build a chat app with realtime messaging for 50k users",
    "Add memory to my existing agent so it remembers each user",
    "Build me an app that lets students record mock interviews",
    "Build me a simple to-do list app just for myself",
  ]) {
    const context = contextFor(repo(), prompt);
    assert.match(context, /No product brief/, prompt);
    assert.match(context, /story-walk\.md/, prompt);
    assert.match(context, /outside this task's question allowance/, prompt);
    // 6.6: the journey map sits between the brief interview and the story walk.
    assert.match(context, /Super-outer runs the brief interview, writes the journey map with the owner phase by phase, walks one customer's story through the simplest design and looks up how this kind of system is built \([^)]+product-brief\.md, [^)]+journey-map\.md and [^)]+story-walk\.md\)\./, prompt);
  }
});

test("the three files the no-brief line names exist, in the order brief, journey map, story walk", () => {
  const context = contextFor(repo(), "Build me an app that lets students record mock interviews");
  const line = /No product brief yet, and this request reads as new work\..*?The interview sits outside this task's question allowance\./.exec(context)?.[0] ?? "";
  const named = line.match(/[^\s(,]+\.md/g) ?? [];
  assert.deepEqual(named.map((file) => path.basename(file)), ["product-brief.md", "journey-map.md", "story-walk.md"], line);
  for (const file of named) assert.ok(fs.existsSync(file), `the line names a missing file: ${file}`);
});

test("a fix never starts the brief interview", () => {
  for (const prompt of [
    "Fix the crash when the upload fails on a slow network",
    "The chat bubble colour is wrong",
    "Rename the helper in the upload module",
  ]) {
    const context = contextFor(repo(), prompt);
    assert.doesNotMatch(context, /No product brief/, prompt);
    assert.doesNotMatch(context, /journey map|journey-map\.md/, prompt);
  }
});

test("an existing brief is read, not asked for again", () => {
  const root = repo({ brief: header("kind: chat app\ndaily_users: 800") });
  assert.doesNotMatch(contextFor(root, "Build a chat app with realtime messaging for 50k users"), /No product brief/);
});

test("a brief that records heavy use brings in the scale specialist", () => {
  const busy = repo({ brief: header("kind: marketplace\ndaily_users: 25000") });
  assert.match(contextFor(busy, "Add a filter to the orders page"), /product brief records about 25,000 people a day/);
  const spike = repo({ brief: header("kind: marketplace\nlaunch_spike: true") });
  assert.match(contextFor(spike, "Add a filter to the orders page"), /product brief records a launch spike/);
  const quiet = repo({ brief: header("kind: marketplace\ndaily_users: 500") });
  assert.doesNotMatch(contextFor(quiet, "Add a filter to the orders page"), /product brief records/);
});

test("a change a customer will see asks for the assumption check", () => {
  assert.match(contextFor(repo(), "Add a filter to the orders page"), /reply 'ok' or correct any line/);
  assert.doesNotMatch(contextFor(repo(), "Fix the button on the pricing page."), /reply 'ok' or correct any line/);
});

test("with a brief, a new kind of system is pointed at the story walk without re-asking the brief", () => {
  const root = repo({ brief: header("kind: tutoring web app\ndaily_users: 3000") });
  const context = contextFor(root, "Add memory to the tutor bot so it remembers what each student struggled with last week");
  assert.match(context, /story-walk\.md/);
  assert.match(context, /A product brief exists/);
  assert.doesNotMatch(context, /No product brief/);
  // A small feature in a product that has a brief needs only the assumption check.
  // 6.6: the same line names the journey map for work that reshapes the system.
  assert.match(context, /journey-map\.md/);
  assert.match(context, /writes the journey map with the owner, or changes the rows this work touches when a map is recorded/);
  assert.doesNotMatch(contextFor(root, "Add a filter to the orders page"), /journey-map\.md/);
  assert.doesNotMatch(contextFor(root, "Add a filter to the orders page"), /story-walk\.md/);
  // A fix never gets the walk.
  assert.doesNotMatch(contextFor(root, "Fix the crash when the tutor bot gets an empty answer"), /story-walk\.md/);
});

test("a plain new feature without a brief is offered a drafted brief, never held for it", () => {
  const context = contextFor(repo(), "Add a filter to the orders page");
  assert.match(context, /offers the interview/);
  assert.doesNotMatch(context, /before anything is built/);
});
