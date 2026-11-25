#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

const copyFile = (source, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
  fs.copyFileSync(source, destination);
  if (destination.endsWith(".mjs")) fs.chmodSync(destination, 0o755);
};

/**
 * Walk the hook's real imports so the staged runtime cannot drift from what the
 * hook needs. Returns repository-relative paths, deepest first is irrelevant —
 * every file is copied.
 */
const moduleDependencies = (entry) => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    // Static imports, and imports the hook makes while it runs, such as the
    // Jev modules it loads only for a prompt. Missing the second kind left
    // Cursor without Jev in the first 5.8.0 build.
    for (const match of fs.readFileSync(file, "utf8").matchAll(/(?:from\s+|import\(\s*)"(\.[^"]+)"/g)) {
      visit(path.resolve(path.dirname(file), match[1]));
    }
  };
  visit(entry);
  seen.delete(entry);
  return [...seen].map((file) => path.relative(ROOT, file));
};

/**
 * A receipt is not proof that anything runs. The Cursor installer reported
 * INSTALLED for weeks while the staged hook could not even be imported.
 */
const assertRuntimeRuns = (runtime) => {
  // Jev is switched off for this check, so installing never sends its prompt.
  const env = { ...process.env, SUPER_OUTER_JEV: "off" };
  delete env.SUPER_OUTER_OPENROUTER_KEY;
  const probe = spawnSync(process.execPath, [path.join(runtime, "hooks/super-outer-hook.mjs"), "UserPromptSubmit"], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: runtime, prompt: "Add login with Google" }),
    encoding: "utf8",
    env,
  });
  if (probe.status !== 0 || /ERR_MODULE_NOT_FOUND|Cannot find module/.test(probe.stderr || "")) {
    throw new Error(`The staged Cursor runtime does not run: ${(probe.stderr || "").trim().split("\n")[0] || "unknown error"}`);
  }
  // Every file the route names must exist in the staged runtime.
  let context = "";
  try { context = JSON.parse(probe.stdout || "{}").hookSpecificOutput?.additionalContext || ""; } catch {}
  const missing = (context.match(/\/[^\s,()]+\.(?:md|json)/g) || [])
    .filter((file) => file.startsWith(runtime) && !fs.existsSync(file));
  if (missing.length) throw new Error(`The staged Cursor route names files that are not staged: ${missing.join(", ")}`);
};

const stageRuntime = (home) => {
  const runtime = path.join(home, ".super-outer", "cursor-runtime");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o755 });
  // Derived from the hook's own imports rather than typed from memory. A
  // hand-listed set silently omitted src/router.mjs the moment the hook began
  // computing the route, and the staged hook died on import while the
  // installer still reported success.
  const files = [
    ["hooks/super-outer-hook.mjs", "hooks/super-outer-hook.mjs"],
    ...moduleDependencies(path.join(ROOT, "hooks/super-outer-hook.mjs"))
      .map((relative) => [relative, relative]),
    ["package.json", "package.json"]
  ];
  for (const [relative, target] of files) {
    copyFile(path.join(ROOT, relative), path.join(runtime, target));
  }
  // The whole skill sits beside the hook, as it does in the Claude Code and
  // Codex plugins. The router reads the anticipation libraries at runtime, and
  // from 5.19 the route names files such as references/story-walk.md by their
  // absolute path beside the hook, so a partial copy would name missing files.
  const skill = path.join(runtime, "skills", "super-outer");
  fs.rmSync(skill, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "skills", "super-outer"), skill, { recursive: true });
  assertRuntimeRuns(runtime);
  fs.writeFileSync(
    path.join(runtime, "install-receipt.json"),
    `${JSON.stringify({
      schema_version: "1.0.0",
      host: "cursor",
      version: VERSION,
      installed_at: new Date().toISOString(),
      source_root: ROOT
    }, null, 2)}\n`,
    { mode: 0o600 }
  );
  return runtime;
};

const mergeHooksConfig = (existing, incoming) => {
  const base = existing && typeof existing === "object" ? existing : { version: 1, hooks: {} };
  const hooks = { ...(base.hooks || {}) };
  for (const [event, entries] of Object.entries(incoming.hooks || {})) {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    const filtered = current.filter((entry) => {
      const command = String(entry?.command || "");
      return !command.includes("super-outer-bridge.mjs") && !command.includes("super-outer-hook.mjs");
    });
    hooks[event] = [...filtered, ...entries];
  }
  return {
    ...base,
    version: base.version || 1,
    hooks
  };
};

/**
 * The documentation has always said the skill lands at
 * `~/.cursor/skills/super-outer`, and the installer never put it there. The
 * copy on this machine was placed by hand in August and still announced 4.0.3
 * while the hooks ran 5.5.0.
 *
 * Each skill directory is entirely plugin-owned, so it is replaced rather than
 * merged. Nothing a person writes lives inside it. From 5.23.0 the plugin ships
 * more than one skill, and every folder under skills/ is installed.
 */
const installSkill = (home, name) => {
  const source = path.join(ROOT, "skills", name);
  const destination = path.join(home, ".cursor", "skills", name);
  fs.rmSync(destination, { recursive: true, force: true });
  const copyTree = (from, to) => {
    fs.mkdirSync(to, { recursive: true, mode: 0o755 });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Refusing to install a symbolic link: ${entry.name}`);
      const next = path.join(from, entry.name);
      if (entry.isDirectory()) copyTree(next, path.join(to, entry.name));
      else if (entry.isFile()) copyFile(next, path.join(to, entry.name));
    }
  };
  copyTree(source, destination);
  const installed = fs.readFileSync(path.join(destination, "SKILL.md"), "utf8");
  if (name === "super-outer" && !installed.includes(`Version: \`${VERSION}\``)) {
    throw new Error(`The installed Cursor skill does not announce ${VERSION}.`);
  }
  return destination;
};

const shippedSkills = () => fs.readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, "skills", entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();

/**
 * Skill folders an earlier release installed that the plugin no longer ships.
 * 6.0.0 folds team-technical-diagram into draw-system-diagram as the
 * code-flow kind, so an upgrade removes the old copy.
 */
export const RETIRED_SKILLS = Object.freeze(["team-technical-diagram"]);

const installCursorHooks = ({ home = os.homedir() } = {}) => {
  const absoluteHome = path.resolve(home);
  const cursorDir = path.join(absoluteHome, ".cursor");
  const hooksDir = path.join(cursorDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true, mode: 0o755 });

  const runtime = stageRuntime(absoluteHome);
  const skills = shippedSkills().map((name) => installSkill(absoluteHome, name));
  for (const name of RETIRED_SKILLS) fs.rmSync(path.join(absoluteHome, ".cursor", "skills", name), { recursive: true, force: true });
  const skill = path.join(absoluteHome, ".cursor", "skills", "super-outer");
  copyFile(
    path.join(ROOT, "adapters/cursor/bridge.mjs"),
    path.join(hooksDir, "super-outer-bridge.mjs")
  );

  const template = JSON.parse(fs.readFileSync(path.join(ROOT, "adapters/cursor/hooks.json"), "utf8"));
  const hooksFile = path.join(cursorDir, "hooks.json");
  let existing = null;
  if (fs.existsSync(hooksFile)) {
    existing = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
  }
  const merged = mergeHooksConfig(existing, template);
  fs.writeFileSync(hooksFile, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });

  const receipt = {
    schema_version: "1.0.0",
    status: "INSTALLED",
    host: "cursor",
    super_outer_version: VERSION,
    installed_at: new Date().toISOString(),
    runtime,
    skill,
    skills,
    bridge: path.join(hooksDir, "super-outer-bridge.mjs"),
    hooks_json: hooksFile,
    blocking_hooks_installed: true,
    design_system_authority: "repository-native",
    note: "Restart Cursor or open a new agent chat after install. Cursor Stop cannot hard-block completion; critical Stop becomes a follow-up message."
  };

  const receiptDir = path.join(absoluteHome, ".super-outer", "cursor-activations");
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o755 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const receiptPath = path.join(receiptDir, `${stamp}.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(
    path.join(absoluteHome, ".super-outer", "latest-cursor-install.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 }
  );

  return receipt;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.env.SUPER_OUTER_INSTALL_HOME || os.homedir();
  const receipt = installCursorHooks({ home });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

export { installCursorHooks, mergeHooksConfig, stageRuntime };
