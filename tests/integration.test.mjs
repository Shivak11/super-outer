import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const capture = () => {
  let out = "";
  let err = "";
  return {
    stdout: { write: (value) => { out += value; } },
    stderr: { write: (value) => { err += value; } },
    get out() { return out; },
    get err() { return err; },
  };
};
const invoke = async (argv, cwd) => {
  const io = capture();
  const code = await runCli(argv, { cwd, stdout: io.stdout, stderr: io.stderr });
  return { code, json: io.out ? JSON.parse(io.out) : null, error: io.err };
};

test("a material task moves from repository understanding to bounded isolated proof", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-integration-repo-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "Fixture service\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");

  const profile = await invoke(["profile", "create", "--root", root, "--repository", "fixture/service"], root);
  assert.equal(profile.code, 0, profile.error);
  assert.equal(Object.keys(profile.json.profile.sections).length, 9);

  const input = path.join(root, "task-input.json");
  fs.writeFileSync(input, `${JSON.stringify({
    title: "Add an authenticated high-volume service",
    description: "A backend API with authorization, strict latency, and production release",
    material: true,
  })}\n`);
  const route = await invoke(["route", "--input", input], root);
  assert.equal(route.code, 0, route.error);
  assert.deepEqual([...route.json.selected_modules].sort(), [
    "backend-api",
    "delivery-release",
    "observability-operations",
    "reliability-recovery",
    "scale-performance-cost",
    "security-privacy-abuse",
  ].sort());

  const task = await invoke([
    "task", "create", "--root", root, "--id", "material-service", "--mode", route.json.mode,
    "--modules", route.json.selected_modules.join(","), "--actions", "edit-files,run-tests",
    "--paths", "src/**", "--destinations", "none", "--plan", "approved-plan.md",
  ], root);
  assert.equal(task.code, 0, task.error);
  assert.equal(task.json.task.status, "UNASSESSED");

  const repositoryGate = await invoke(["repo", "enable", "--root", root], root);
  assert.equal(repositoryGate.code, 0, repositoryGate.error);
  const commitGate = await invoke(["repo", "verify", "--root", root, "--commit-gate"], root);
  assert.equal(commitGate.code, 0, commitGate.error);
});
