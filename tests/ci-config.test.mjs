import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyCiHead } from "../scripts/verify-ci-head.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("CI checks the exact pull-request head on every supported platform and runtime", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow, /os: \[macos-latest, ubuntu-latest\]/);
  assert.doesNotMatch(workflow, /windows-latest/);
  assert.equal((workflow.match(/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/g) || []).length, 2);
  assert.equal((workflow.match(/actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/g) || []).length, 2);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
  assert.match(workflow, /fetch-depth: 0/g);
  assert.match(workflow, /persist-credentials: false/g);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /node-version: 24/);
  assert.equal((workflow.match(/npm run verify/g) || []).length, 2);
});

test("release scripts use platform-safe Node file URL conversion", () => {
  for (const relative of [
    "scripts/check-source.mjs",
    "scripts/verify-schemas.mjs",
    "scripts/validate-manifests.mjs",
    "tests/schema-validation.test.mjs",
  ]) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /fileURLToPath/);
    assert.doesNotMatch(source, /import\.meta\.url\)\.pathname/);
  }
});

test("the CI identity gate rejects a different candidate", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-ci-head-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repository });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repository });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repository });
  fs.writeFileSync(path.join(repository, "README.md"), "candidate\n");
  execFileSync("git", ["add", "."], { cwd: repository });
  execFileSync("git", ["commit", "-m", "candidate"], { cwd: repository });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  const identity = verifyCiHead({ cwd: repository, expected: head });
  assert.equal(identity.status, "IDENTITY_CONFIRMED");
  assert.equal(identity.terminal, false);
  assert.equal(identity.conclusion, null);
  assert.throws(() => verifyCiHead({ cwd: repository, expected: "0".repeat(40) }), /different version/);
});
