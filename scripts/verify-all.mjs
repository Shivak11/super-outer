#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPackage, verifyPackage } from "./build-package.mjs";
import { installSuperOuter, verifyInstallation } from "./install.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const runNode = (relative, args = []) => {
  const result = spawnSync(process.execPath, [path.join(root, relative), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.status !== 0) {
    throw new Error(`${relative} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-verify-"));
try {
  const source = runNode("scripts/check-source.mjs");
  const manifests = runNode("scripts/validate-manifests.mjs");
  const schemas = runNode("scripts/verify-schemas.mjs");
  // The installer's own tests live beside it and were previously outside CI,
  // so the one path that switches Super-outer on had no automated cover.
  const testFiles = [["tests"], ["developer-update", "tests"]].flatMap((segments) => {
    const directory = path.join(root, ...segments);
    return fs.readdirSync(directory)
      .filter((name) => name.endsWith(".test.mjs"))
      .sort()
      .map((name) => path.join(directory, name));
  });
  const tests = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  if (tests.status !== 0) throw new Error(`Tests failed:\n${tests.stderr || tests.stdout}`);

  const first = buildPackage({ root, outputFile: path.join(temporaryRoot, "first.zip") });
  const second = buildPackage({ root, outputFile: path.join(temporaryRoot, "second.zip") });
  assert.equal(first.sha256, second.sha256, "Repeated package builds must be byte-identical");
  assert.deepEqual(fs.readFileSync(first.package), fs.readFileSync(second.package));
  const packaged = verifyPackage({ packageFile: first.package, checksumFile: first.checksumFile });
  assert.equal(packaged.entries.some((entry) => entry.name.includes("/.engineering/")), false);

  const isolatedHome = path.join(temporaryRoot, "isolated-home");
  const staged = installSuperOuter({ home: isolatedHome, sourceRoot: root });
  const installation = verifyInstallation({ home: isolatedHome, sourceRoot: root });
  assert.equal(staged.source_staged, true);
  assert.equal(staged.installed, false);
  assert.equal(installation.staged_source_valid, true);
  assert.equal(installation.host_discovery, false);
  assert.equal(installation.hook_execution, false);

  process.stdout.write([
    "Super-outer verification passed.",
    `- Source: ${source}`,
    `- Plugin structure: ${manifests}`,
    `- Public records: ${schemas}`,
    `- Tests: ${testFiles.length} files passed.`,
    `- Package: ${packaged.entries.length} files, repeatable SHA-256 ${first.sha256}.`,
    "- Isolated staging: passed.",
    "- Claude/Codex discovery and live hook execution: not claimed by this check.",
  ].join("\n") + "\n");
} finally {
  if (temporaryRoot.startsWith(`${os.tmpdir()}${path.sep}super-outer-verify-`)) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
