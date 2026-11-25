import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DIMENSIONS, dueDimensions, planSweep, readReceipts, recordReceipt, receiptsFile } from "../src/sweep.mjs";
import { recordCandidate } from "../src/suggestions.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString().trim();
const repo = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-sweep-"));
  git(root, "init", "-q");
  fs.writeFileSync(path.join(root, "README.md"), "x\n");
  git(root, "add", "."); git(root, "commit", "-qm", "init");
  return root;
};

test("thirteen dimensions: the twelve modules plus run-operate", () => {
  assert.equal(DIMENSIONS.length, 13);
  assert.ok(DIMENSIONS.some((d) => d.id === "run-operate"));
  assert.ok(DIMENSIONS.some((d) => d.id === "observability-operations"));
});

test("all due without receipts; none due after receipts with no change; changed files reopen their dimension", () => {
  const root = repo();
  assert.equal(dueDimensions(root).length, 13);
  for (const d of DIMENSIONS) recordReceipt(root, d.id, "pass");
  assert.equal(readReceipts(root).length, 13);
  assert.ok(fs.existsSync(receiptsFile(root)));
  assert.deepEqual(dueDimensions(root), []);
  fs.mkdirSync(path.join(root, "migrations"));
  fs.writeFileSync(path.join(root, "migrations", "001.sql"), "create table x();\n");
  git(root, "add", "."); git(root, "commit", "-qm", "mig");
  const due = dueDimensions(root).map((d) => d.id);
  assert.ok(due.includes("data-migrations"));
  assert.ok(!due.includes("product-ui-ux-motion"));
});

test("tolerates a folder that is not a git repository", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-sweep-nogit-"));
  assert.equal(dueDimensions(root).length, 13);
  recordReceipt(root, "ai-llm", "pass");
  assert.equal(dueDimensions(root).length, 12);
});

test("plan lists due dimensions plus pending suggestions, and rejects unknown dimensions", () => {
  const root = repo();
  recordCandidate({ root, toolName: "Edit", summary: "added setInterval(poll, 1000) in a.js" });
  const plan = planSweep(root);
  assert.equal(plan.due.length, 13);
  assert.equal(plan.suggestions.length, 1);
  assert.throws(() => recordReceipt(root, "nope", "pass"));
});

test("CLI: sweep --plan and sweep --record", () => {
  const root = repo();
  const bin = path.resolve(import.meta.dirname, "..", "bin", "super-outer.mjs");
  const run = (...args) => execFileSync(process.execPath, [bin, "sweep", ...args], { cwd: root, env: { ...process.env, SUPER_OUTER_JEV: "off" } }).toString();
  assert.match(run("--plan"), /run-operate/);
  for (const d of DIMENSIONS) run("--record", d.id, "pass");
  const out = JSON.parse(run("--plan", "--json"));
  assert.deepEqual(out.due, []);
});

test("the plan lists the diagrams the changed files need", () => {
  const root = repo();
  assert.deepEqual(planSweep(root).diagrams, []);
  for (const d of DIMENSIONS) recordReceipt(root, d.id, "pass");
  fs.mkdirSync(path.join(root, "api"));
  fs.writeFileSync(path.join(root, "api", "export.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(root, "wrangler.toml"), "name = \"x\"\n");
  git(root, "add", "."); git(root, "commit", "-qm", "api");
  assert.deepEqual(planSweep(root).diagrams, { unclear: true });
  assert.deepEqual(planSweep(root, { facts: { maintainer: "developer" } }).diagrams, ["architecture", "code-flow"]);
  const bin = path.resolve(import.meta.dirname, "..", "bin", "super-outer.mjs");
  const text = execFileSync(process.execPath, [bin, "sweep", "--plan"], { cwd: root, env: { ...process.env, SUPER_OUTER_JEV: "off" } }).toString();
  assert.match(text, /^diagrams unclear/m);
});
