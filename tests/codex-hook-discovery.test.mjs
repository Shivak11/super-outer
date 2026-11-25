import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildPackage, listPackageFiles, verifyPackage } from "../scripts/build-package.mjs";
import { codexHookBlockers, missingCodexHookEvents, missingCodexSkills, readCodexPluginHooks } from "../scripts/check-codex-hooks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("the installable package leaves out the Agent Plugins root manifest, so Codex finds the hooks", () => {
  const relatives = listPackageFiles(root).map((file) => file.relative);
  assert.equal(relatives.includes("plugin.json"), false, "plugin.json must stay in the repository only");
  assert.deepEqual(codexHookBlockers(relatives, readSource), []);
});

test("the package verifier refuses a package that carries the Agent Plugins root manifest", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "so-codex-verify-"));
  try {
    const built = buildPackage({ root, outputDir: scratch });
    assert.equal(verifyPackage({ packageFile: built.package }).valid, true);
    // Put the repository's root manifest into a copy of the real package.
    const tainted = path.join(scratch, "tainted.zip");
    fs.copyFileSync(built.package, tainted);
    fs.mkdirSync(path.join(scratch, "super-outer"));
    fs.copyFileSync(path.join(root, "plugin.json"), path.join(scratch, "super-outer", "plugin.json"));
    const zipped = spawnSync("zip", ["-q", "-0", "-X", tainted, "super-outer/plugin.json"], { cwd: scratch });
    assert.equal(zipped.status, 0, String(zipped.stderr));
    assert.throws(() => verifyPackage({ packageFile: tainted }), /Codex would load none of its hooks/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the repository itself keeps the Agent Plugins root manifest", () => {
  assert.match(readSource("plugin.json"), /agent-plugins\.org/);
});

test("an Agent Plugins root manifest is reported as blocking Codex hooks", () => {
  const relatives = ["plugin.json", "hooks/hooks.json", ".codex-plugin/plugin.json"];
  const blockers = codexHookBlockers(relatives, (relative) =>
    relative === "plugin.json" ? '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"}' : '{"name":"x"}');
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /Agent Plugins manifest/);
});

test("a missing hooks file or a hooks field in the Codex manifest is reported", () => {
  assert.match(codexHookBlockers([".codex-plugin/plugin.json"], () => "{}").join(" "), /hooks\.json is missing/);
  assert.match(codexHookBlockers(["hooks/hooks.json", ".codex-plugin/plugin.json"], () => '{"hooks":"./h.json"}').join(" "), /names hooks itself/);
});

test("skill folders Codex does not list are named", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "so-codex-skills-"));
  try {
    for (const name of ["one", "two"]) {
      fs.mkdirSync(path.join(folder, "skills", name), { recursive: true });
      fs.writeFileSync(path.join(folder, "skills", name, "SKILL.md"), "---\nname: x\n---\n");
    }
    assert.deepEqual(missingCodexSkills({ pluginFolder: folder, skills: ["super-outer:one"] }), ["two"]);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("missing events are named", () => {
  assert.deepEqual(missingCodexHookEvents(["userPromptSubmit", "preToolUse", "stop"]), []);
  assert.deepEqual(missingCodexHookEvents([]), ["userPromptSubmit", "preToolUse", "stop"]);
});

// Asks a real Codex. It starts Codex's local app server and sends nothing to a
// model; it runs only when SUPER_OUTER_CODEX_LIVE=1, because CI has no Codex.
test("an installed Codex lists the hooks in the packaged plugin", { skip: process.env.SUPER_OUTER_CODEX_LIVE !== "1" }, async () => {
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), "so-codex-package-"));
  try {
    for (const file of listPackageFiles(root)) {
      const target = path.join(staged, file.relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.absolute, target);
    }
    const result = await readCodexPluginHooks({ pluginFolder: staged });
    assert.equal(result.ran, true, result.reason);
    assert.deepEqual(missingCodexHookEvents(result.events), []);
    // Every skill folder must reach Codex too; a skill Codex cannot list is never chosen.
    assert.deepEqual(missingCodexSkills({ pluginFolder: staged, skills: result.skills }), []);
    assert.ok(result.skills.includes("super-outer:edge-cases"));
  } finally {
    fs.rmSync(staged, { recursive: true, force: true });
  }
});
