import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SUPER_OUTER_VERSION } from "../src/constants.mjs";
import { renderManagedGuidance, applyManagedGuidance, managedGuidanceVersion } from "../src/managed-guidance.mjs";
import { PAYLOAD_DIGEST } from "../developer-update/runtime/developer-upgrade.mjs";
import { VERSION_TOKEN, developerPayloadDigest } from "../developer-update/build.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

/**
 * 5.3.0 could be installed while the active instruction still said "v4". These
 * pin every surface that states a version to one source of truth.
 */
test("every manifest agrees with the version constant", () => {
  for (const manifest of ["package.json", "plugin.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    assert.equal(json(manifest).version, SUPER_OUTER_VERSION, manifest);
  }
});

test("the learning skills plugin carries the Super-outer version", () => {
  for (const manifest of ["optional/super-outer-learning/.claude-plugin/plugin.json", "optional/super-outer-learning/.codex-plugin/plugin.json"]) {
    assert.equal(json(manifest).version, SUPER_OUTER_VERSION, manifest);
  }
});

test("the skill and readme state the same version", () => {
  assert.match(read("skills/super-outer/SKILL.md"), new RegExp(`Version: \`${SUPER_OUTER_VERSION.replace(/\./g, "\\.")}\``));
  assert.match(read("README.md"), new RegExp(SUPER_OUTER_VERSION.replace(/\./g, "\\.")));
});

test("installer, host adapter and cursor bridge carry the same version", () => {
  for (const file of ["scripts/install.mjs", "scripts/host-adapter.mjs", "adapters/cursor/bridge.mjs"]) {
    assert.ok(read(file).includes(SUPER_OUTER_VERSION), `${file} does not name ${SUPER_OUTER_VERSION}`);
  }
});

test("the packaged developer update targets this version", () => {
  assert.ok(
    read("developer-update/runtime/developer-upgrade.mjs").includes(`VERSION = "${SUPER_OUTER_VERSION}"`),
    "developer-update runtime VERSION must match the constant",
  );
});

/**
 * The claim that mattered: what the hook reports at runtime, what the source
 * says, and what the managed guidance block tells the model must be the same
 * number. Any one of the three drifting is how "5.4 installed, v4 announced"
 * happened in the first place.
 */
test("source, managed guidance and the running hook all report one version", () => {
  const guidanceFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "so-ver-")), "AGENTS.md");
  applyManagedGuidance(guidanceFile);
  assert.equal(managedGuidanceVersion(guidanceFile), SUPER_OUTER_VERSION, "managed block");

  const probe = spawnSync(
    process.execPath,
    ["-e", "import('./src/constants.mjs').then(m => process.stdout.write(m.SUPER_OUTER_VERSION))"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(probe.stdout.trim(), SUPER_OUTER_VERSION, "runtime import");
});

test("no shipped surface still announces a bare major version", () => {
  // The exact phrasing that went stale for months.
  // User-facing surfaces only. The explanatory comment in managed-guidance.mjs
  // quotes the old label deliberately, as the record of why the block exists,
  // and the developer-update runtime names it to strip it from older installs.
  for (const file of ["skills/super-outer/SKILL.md", "README.md"]) {
    assert.doesNotMatch(read(file), /Super-outer v4\b/, `${file} still says "Super-outer v4"`);
  }
  assert.doesNotMatch(renderManagedGuidance(), /Super-outer v4\b/);
});

/**
 * The package shipped as 5.4.1 while every line the reader saw said 4.0.3, and
 * that is what stopped a developer from installing it. Assets may not type a
 * version at all; they carry a token the build substitutes.
 */
test("no developer-update asset types a version by hand", () => {
  const directory = path.join(root, "developer-update", "assets");
  for (const name of fs.readdirSync(directory)) {
    const text = fs.readFileSync(path.join(directory, name), "utf8");
    assert.doesNotMatch(text, /\b\d+\.\d+\.\d+\b/, `${name} types a version instead of using ${VERSION_TOKEN}`);
    if (/Super-outer v/i.test(text)) {
      assert.ok(text.includes(VERSION_TOKEN), `${name} names a version without the substitution token`);
    }
  }
});

/**
 * The pinned digest is what proves an installed plugin is the reviewed payload
 * rather than something sharing its version number. Drift must fail here, on
 * the commit that caused it, not months later inside someone's install.
 */
test("the pinned payload digest matches the current source", () => {
  assert.equal(
    developerPayloadDigest(root),
    PAYLOAD_DIGEST,
    "the payload changed since the digest was pinned; run `npm run sync:digest` and commit the result",
  );
});

test("the state directory is not named after a major version", () => {
  for (const file of ["hooks/super-outer-hook.mjs", "src/approval.mjs", "adapters/cursor/bridge.mjs"]) {
    assert.doesNotMatch(read(file), /super-outer-v\d+-state/, `${file} pins a versioned state directory`);
  }
});

/**
 * A task record is one checkout's live development state. One was committed
 * and stayed ACTIVE, naming a branch that no longer exists, so the marketplace
 * clone carried it to every user and every session opened in this repository
 * with a stale-branch notice. Nothing shipped is wrong with the notice; the
 * record simply should never have travelled.
 */
test("no development task record is tracked by git", () => {
  const tracked = execFileSync("git", ["ls-files", ".engineering/"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const records = tracked.filter((relative) => /(?:^|\/)(?:current-)?task\.json$|\/tasks\//.test(relative));
  assert.deepEqual(records, [], `a task record is committed and would reach every user: ${records.join(", ")}`);
});

/**
 * CI has no host binary on PATH and reaches them only through the documented
 * per-host override. A precheck that ignored that override refused to install
 * for anyone whose host is not on PATH, though the installer could reach it.
 */
test("the setup precheck honours the documented host override", async () => {
  const { hostAvailable } = await import("../developer-update/runtime/developer-upgrade.mjs");
  const previous = process.env.SUPER_OUTER_CLAUDE_BIN;
  try {
    process.env.SUPER_OUTER_CLAUDE_BIN = "/nonexistent/claude";
    assert.equal(hostAvailable("claude"), false, "a missing override is not available");
    process.env.SUPER_OUTER_CLAUDE_BIN = process.execPath;
    assert.equal(hostAvailable("claude"), true, "an absolute override is found off PATH");
  } finally {
    if (previous === undefined) delete process.env.SUPER_OUTER_CLAUDE_BIN;
    else process.env.SUPER_OUTER_CLAUDE_BIN = previous;
  }
});
