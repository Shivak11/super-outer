import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { buildDeveloperPackage } from "../build.mjs";
import {
  installDeveloperUpgrade,
  LEGACY_CLAUDE_BLOCK,
  loadBundle,
  normalizeComponents,
  PAYLOAD_DIGEST,
  rollbackDeveloperUpgrade,
  VERSION,
  verifyDeveloperUpgrade,
} from "../runtime/developer-upgrade.mjs";

// A version typed into a test goes stale exactly as a version typed into a
// shipped asset does. Both now derive from the one constant.
const escaped = (value) => value.replace(/\./g, "\\.");
const root = path.resolve(".");
// The real path, so a host's config folder and the paths it records compare equal on macOS, where /var is a link.
const temp = (name) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)));
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
const extractPackage = (packageFile) => {
  const destination = temp("super-outer-developer-unzip");
  const extracted = spawnSync("unzip", ["-q", packageFile, "-d", destination], { encoding: "utf8" });
  assert.equal(extracted.status, 0, extracted.stderr);
  return path.join(destination, "Super-outer-Developer-Update-6.6.0");
};

const fakeHostSource = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const host = path.basename(process.argv[1]).startsWith("claude") ? "claude" : "codex";
const config = host === "claude" ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME;
if (!config) { console.error("missing config root"); process.exit(2); }
const stateFile = host === "claude" ? path.join(config, "plugins", "installed_plugins.json") : path.join(config, "config.toml");
const readState = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!Array.isArray(parsed.records)) parsed.records = [];
    if (!parsed.marketplaces || typeof parsed.marketplaces !== "object") parsed.marketplaces = {};
    return parsed;
  } catch { return { records: [], marketplaces: {} }; }
};
const writeState = (state) => {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\\n");
};
const args = process.argv.slice(2);
if (args[0] !== "plugin") { console.error("unsupported command"); process.exit(2); }
const state = readState();
if (args[1] === "list") { console.log(JSON.stringify(state.records)); process.exit(0); }
if (args[1] === "marketplace" && args[2] === "remove") {
  const name = args[3];
  if (!state.marketplaces[name]) { console.error("marketplace not found"); process.exit(1); }
  delete state.marketplaces[name]; writeState(state); console.log("removed"); process.exit(0);
}
if (args[1] === "marketplace" && args[2] === "add") {
  const source = path.resolve(args[3]);
  const manifest = host === "claude"
    ? path.join(source, ".claude-plugin", "marketplace.json")
    : path.join(source, ".agents", "plugins", "marketplace.json");
  const value = JSON.parse(fs.readFileSync(manifest, "utf8"));
  state.marketplaces[value.name] = source; writeState(state); console.log("added"); process.exit(0);
}
if ((host === "claude" && args[1] === "uninstall") || (host === "codex" && args[1] === "remove")) {
  const id = args[2];
  // A real host deletes the plugin's installed folder on uninstall, so rollback must restore it from its backup.
  for (const record of state.records.filter((entry) => (entry.id || entry.pluginId) === id)) {
    const folder = record.installPath || record.source?.path;
    if (folder && folder.startsWith(config)) fs.rmSync(folder, { recursive: true, force: true });
  }
  state.records = state.records.filter((record) => (record.id || record.pluginId) !== id);
  writeState(state); console.log("removed"); process.exit(0);
}
if ((host === "claude" && args[1] === "install") || (host === "codex" && args[1] === "add")) {
  if (process.env.SUPER_OUTER_FAKE_FAIL_HOST === host) { console.error("injected host installation failure"); process.exit(1); }
  const id = args[2];
  const [name, marketplace] = id.split("@");
  const marketplaceRoot = state.marketplaces[marketplace];
  if (!marketplaceRoot) { console.error("marketplace missing"); process.exit(1); }
  const source = path.join(marketplaceRoot, "plugins", name);
  const plugin = JSON.parse(fs.readFileSync(path.join(source, host === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json"), "utf8"));
  const destination = path.join(config, "plugins", "cache", marketplace, name, plugin.version);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  state.records = state.records.filter((record) => (record.id || record.pluginId) !== id);
  state.records.push(host === "claude"
    ? { id, name, version: plugin.version, scope: "user", enabled: true, installPath: destination }
    : { pluginId: id, name, marketplaceName: marketplace, version: plugin.version, installed: true, enabled: true, source: { source: "local", path: destination } });
  writeState(state); console.log(JSON.stringify({ installed: id })); process.exit(0);
}
console.error("unsupported plugin command: " + args.join(" "));
process.exit(2);
`;

const installFakeHosts = (home) => {
  const bin = path.join(home, "fake-bin");
  fs.mkdirSync(bin, { recursive: true });
  const executables = {};
  for (const host of ["claude", "codex"]) {
    const filename = path.join(bin, `${host}-fake`);
    fs.writeFileSync(filename, fakeHostSource, { mode: 0o755 });
    executables[host] = filename;
  }
  return executables;
};

const legacyHome = () => {
  const home = temp("super-outer-developer-home");
  const legacy = [
    ".claude/skills/plain-language-engineering-loop",
    ".agents/skills/plain-language-engineering-loop",
  ];
  for (const relative of legacy) {
    fs.mkdirSync(path.join(home, relative), { recursive: true });
    fs.writeFileSync(path.join(home, relative, "SKILL.md"), `# OUTER v3\\n\\n${relative}\\n`);
  }
  for (const relative of [
    ".claude/skills/plain-language-engineering-loop.backup-20260803-155206-055678",
    ".agents/skills/plain-language-engineering-loop.backup-20260803-155206-055678",
  ]) {
    fs.mkdirSync(path.join(home, relative), { recursive: true });
    fs.writeFileSync(path.join(home, relative, "SKILL.md"), `# OUTER\\n\\nVersion 2.1 — retained fixture.\\n${relative}\\n`);
  }
  fs.mkdirSync(path.join(home, ".claude", "commands"), { recursive: true });
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "commands", "outer.md"), "legacy v3 /outer exact bytes\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), `${JSON.stringify({
    theme: "keep-claude",
    hooks: { PreToolUse: [{ hooks: [
      { type: "command", command: "node ~/.claude/skills/plain-language-engineering-loop/scripts/outer-pre-mutation-gate.mjs" },
      { type: "command", command: "node /keep/claude-hook.mjs" },
    ] }] },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, ".codex", "hooks.json"), `${JSON.stringify({
    keep: "codex",
    hooks: { PreToolUse: [{ hooks: [
      { type: "command", command: "node ~/.agents/skills/plain-language-engineering-loop/scripts/outer-pre-mutation-gate.mjs" },
      { type: "command", command: "node /keep/codex-hook.mjs" },
    ] }] },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), [
    "# Keep Claude", "", "## OUTER v3 — senior-engineer control before material work", "", "APPROVE OUTER-OLD", "", "## Keep This", "", "Unrelated Claude rule.", "",
  ].join("\n"));
  fs.writeFileSync(path.join(home, ".codex", "AGENTS.md"), [
    "<keep>Codex rule</keep>", "", "<outer-v3>", "APPROVE OUTER-OLD", "</outer-v3>", "",
  ].join("\n"));
  fs.writeFileSync(path.join(home, ".cursor", "mcp.json"), "cursor must remain exact\n");
  return home;
};

const snapshot = (home, paths) => Object.fromEntries(paths.map((relative) => {
  const filename = path.join(home, relative);
  return [relative, fs.existsSync(filename) ? fs.readFileSync(filename) : null];
}));
const assertSnapshot = (home, values) => {
  for (const [relative, expected] of Object.entries(values)) {
    const filename = path.join(home, relative);
    if (expected === null) assert.equal(fs.existsSync(filename), false, relative);
    else assert.deepEqual(fs.readFileSync(filename), expected, relative);
  }
};

test("developer ZIP builds byte-identically and carries the exact repository-native v6.6.0 payload", async () => {
  const first = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-one") });
  const second = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-two") });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(fs.readFileSync(first.package), fs.readFileSync(second.package));
  const bundleRoot = extractPackage(first.package);
  const manifest = JSON.parse(fs.readFileSync(path.join(bundleRoot, "PACKAGE-MANIFEST.json"), "utf8"));
  // Compared against the pinned constant, not a typed copy of it: a second
  // hand-typed digest is one more thing that can silently go stale.
  assert.equal(manifest.payload_digest, PAYLOAD_DIGEST);
  assert.match(manifest.payload_commit, /^(?:[a-f0-9]{40}|unknown)$/);
  assert.equal(manifest.design_system_authority, "repository-native");
  assert.equal(manifest.cursor_managed, false);
  assert.equal(Object.keys(manifest.files).some((relative) => relative.startsWith(".cursor/")), false);
  assert.equal(fs.existsSync(path.join(bundleRoot, "marketplace/plugins/super-outer/skills/super-outer/modules/product-ui-ux-motion/subplaybooks/company-native-system.md")), true);
  assert.equal(fs.statSync(path.join(bundleRoot, "Install Super-outer.command")).mode & 0o111, 0o111);
  for (const name of ["Install Super-outer.command", "READ ME FIRST.md", "Verify Super-outer.command", "Roll Back Super-outer.command"]) {
    const text = fs.readFileSync(path.join(bundleRoot, name), "utf8");
    assert.doesNotMatch(text, /__SUPER_OUTER_VERSION__/, `${name} shipped with an unsubstituted version token`);
    assert.doesNotMatch(text, /\b4\.0\.3\b/, `${name} still announces 4.0.3`);
    if (/Super-outer v/i.test(text)) assert.match(text, new RegExp(`Super-outer v${escaped(VERSION)}`, "i"), `${name} announces the wrong version`);
  }
  const repository = temp("super-outer-native-design-repository");
  fs.mkdirSync(path.join(repository, "design-system"), { recursive: true });
  fs.writeFileSync(path.join(repository, "design-system/tokens.json"), '{"primary":"repository-ink"}\n');
  fs.writeFileSync(path.join(repository, "design-system/motion.md"), "Use the repository motion language.\n");
  const profileModule = await import(`${pathToFileURL(path.join(bundleRoot, "marketplace/plugins/super-outer/src/profile.mjs")).href}?fixture=${Date.now()}`);
  const profile = await profileModule.createRepositoryProfile({
    root: repository,
    sections: {
      ui: {
        status: "EXPLICIT",
        authority: "repository-contract",
        sources: ["design-system/tokens.json", "design-system/motion.md"],
      },
    },
  });
  assert.equal(profileModule.validateProfile(profile).valid, true);
  assert.equal(profile.sections.ui.status, "EXPLICIT");
  assert.equal(profile.sections.ui.authority, "repository-contract");
  assert.deepEqual(profile.sections.ui.sources.map((source) => source.path).sort(), ["design-system/motion.md", "design-system/tokens.json"]);

  git(repository, "init", "-b", "main");
  git(repository, "config", "user.email", "test@example.com");
  git(repository, "config", "user.name", "Test");
  git(repository, "add", ".");
  git(repository, "commit", "-m", "repository design foundation");
  const cliModule = await import(`${pathToFileURL(path.join(bundleRoot, "marketplace/plugins/super-outer/src/cli.mjs")).href}?fixture=${Date.now()}`);
  const enableIo = capture();
  const enabled = await cliModule.runCli(["repo", "enable", "--root", repository], {
    cwd: repository,
    stdout: enableIo.stdout,
    stderr: enableIo.stderr,
  });
  assert.equal(enabled, 0, enableIo.err);
  const tasksDirectory = path.join(repository, ".engineering/super-outer/tasks");
  fs.mkdirSync(tasksDirectory, { recursive: true });
  for (let index = 1; index <= 6; index += 1) {
    fs.writeFileSync(path.join(tasksDirectory, `historical-${index}.json`), `${JSON.stringify({ historical: true, index })}\n`);
  }
  const verifyIo = capture();
  const commitGate = await cliModule.runCli(["repo", "verify", "--root", repository, "--commit-gate"], {
    cwd: repository,
    stdout: verifyIo.stdout,
    stderr: verifyIo.stderr,
  });
  assert.equal(commitGate, 0, verifyIo.err);
});

test("one run replaces v3 globally, preserves native design authority, leaves Cursor exact, repeats safely, and rolls back exact bytes", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-install") });
  const bundleRoot = extractPackage(packageResult.package);
  await loadBundle(bundleRoot);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const previous = {
    platform: process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM,
    claude: process.env.SUPER_OUTER_CLAUDE_BIN,
    codex: process.env.SUPER_OUTER_CODEX_BIN,
  };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  const restoredPaths = [
    ".claude/settings.json", ".codex/hooks.json", ".claude/CLAUDE.md", ".codex/AGENTS.md",
    ".claude/commands/outer.md", ".claude/plugins/installed_plugins.json", ".codex/config.toml",
    ".claude/skills/plain-language-engineering-loop/SKILL.md", ".agents/skills/plain-language-engineering-loop/SKILL.md",
  ];
  const before = snapshot(home, restoredPaths);
  const cursorBefore = fs.readFileSync(path.join(home, ".cursor/mcp.json"));
  try {
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true);
    assert.equal(installed.hosts.claude.exact, 1);
    assert.equal(installed.hosts.codex.exact, 1);
    assert.equal(installed.legacy.outer21Active, false);
    assert.equal(installed.legacy.outerV3Active, false);
    assert.equal(installed.designSystemAuthority, "repository-native");
    assert.equal(installed.cursorTouched, false);
    assert.deepEqual(fs.readFileSync(path.join(home, ".cursor/mcp.json")), cursorBefore);
    const claudeGuidance = fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8");
    const codexGuidance = fs.readFileSync(path.join(home, ".codex/AGENTS.md"), "utf8");
    assert.doesNotMatch(claudeGuidance, /APPROVE OUTER-|OUTER v3/);
    assert.doesNotMatch(codexGuidance, /APPROVE OUTER-|<outer-v3>/);
    assert.match(claudeGuidance, /repository's own design system/);
    assert.match(codexGuidance, /repository's own design system/);
    assert.match(claudeGuidance, /multiple OUTER task records are[\s\S]*bookkeeping warnings only/);
    assert.match(codexGuidance, /multiple OUTER task records are[\s\S]*bookkeeping warnings only/);
    // One owned block per file, stating the version that is actually installed.
    for (const guide of [claudeGuidance, codexGuidance]) {
      assert.equal((guide.match(/<!-- BEGIN SUPER-OUTER MANAGED GUIDANCE -->/g) || []).length, 1);
      assert.equal((guide.match(/<!-- END SUPER-OUTER MANAGED GUIDANCE -->/g) || []).length, 1);
      assert.match(guide, new RegExp(`## Super-outer — installed guidance \\(v${escaped(VERSION)}\\)`));
      assert.doesNotMatch(guide, /Super-outer v4\b/);
    }
    assert.match(claudeGuidance, /Keep Claude/);
    assert.match(codexGuidance, /<keep>Codex rule<\/keep>/);
    const archives = installed.receipt.legacy;
    assert.equal(fs.existsSync(path.join(archives.outer21.archive, "manifest.json")), true);
    assert.equal(fs.existsSync(path.join(archives.outerV3.archive, "manifest.json")), true);
    const repeated = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(repeated.idempotent, true);
    const verified = await verifyDeveloperUpgrade({ home, bundleRoot });
    assert.equal(verified.valid, true, verified.failures.join(", "));
    const packagedVerification = spawnSync(process.execPath, [
      path.join(bundleRoot, "runtime/developer-upgrade.mjs"), "verify", "--bundle", bundleRoot, "--home", home, "--json",
    ], { encoding: "utf8", env: process.env });
    assert.equal(packagedVerification.status, 0, packagedVerification.stderr);
    assert.equal(JSON.parse(packagedVerification.stdout).valid, true);
    const rolledBack = await rollbackDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(rolledBack.rolledBack, true);
    assertSnapshot(home, before);
    assert.deepEqual(fs.readFileSync(path.join(home, ".cursor/mcp.json")), cursorBefore);
    assert.equal(fs.existsSync(archives.outer21.archive), true);
    assert.equal(fs.existsSync(archives.outerV3.archive), true);
  } finally {
    if (previous.platform === undefined) delete process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM; else process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = previous.platform;
    if (previous.claude === undefined) delete process.env.SUPER_OUTER_CLAUDE_BIN; else process.env.SUPER_OUTER_CLAUDE_BIN = previous.claude;
    if (previous.codex === undefined) delete process.env.SUPER_OUTER_CODEX_BIN; else process.env.SUPER_OUTER_CODEX_BIN = previous.codex;
  }
});

test("a host installation failure restores every managed pre-upgrade byte", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-failure") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  process.env.SUPER_OUTER_FAKE_FAIL_HOST = "codex";
  const watched = [
    ".claude/settings.json", ".codex/hooks.json", ".claude/CLAUDE.md", ".codex/AGENTS.md",
    ".claude/commands/outer.md", ".claude/plugins/installed_plugins.json", ".codex/config.toml",
    ".claude/skills/plain-language-engineering-loop/SKILL.md", ".agents/skills/plain-language-engineering-loop/SKILL.md",
    ".cursor/mcp.json",
  ];
  const before = snapshot(home, watched);
  try {
    await assert.rejects(
      installDeveloperUpgrade({ home, bundleRoot, yes: true }),
      /injected host installation failure/,
    );
    assertSnapshot(home, before);
  } finally {
    delete process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM;
    delete process.env.SUPER_OUTER_CLAUDE_BIN;
    delete process.env.SUPER_OUTER_CODEX_BIN;
    delete process.env.SUPER_OUTER_FAKE_FAIL_HOST;
  }
});

test("a Claude-only Mac installs successfully and reports Codex as absent", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-one-host") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = path.join(home, "missing-codex");
  try {
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    assert.equal(installed.hosts.claude.present, true);
    assert.equal(installed.hosts.codex.present, false);
    assert.equal(fs.existsSync(path.join(home, ".codex/super-outer-agent-roles.json")), false);
  } finally {
    delete process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM;
    delete process.env.SUPER_OUTER_CLAUDE_BIN;
    delete process.env.SUPER_OUTER_CODEX_BIN;
  }
});

test("installed hosts that have never been opened get recoverable config roots", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-fresh-hosts") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = temp("super-outer-fresh-host-home");
  const executables = installFakeHosts(home);
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  try {
    assert.equal(fs.existsSync(path.join(home, ".claude")), false);
    assert.equal(fs.existsSync(path.join(home, ".codex")), false);
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    assert.equal(fs.existsSync(path.join(home, ".claude")), true);
    assert.equal(fs.existsSync(path.join(home, ".codex")), true);
    const rolledBack = await rollbackDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(rolledBack.rolledBack, true);
    assert.equal(fs.existsSync(path.join(home, ".claude")), false);
    assert.equal(fs.existsSync(path.join(home, ".codex")), false);
  } finally {
    delete process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM;
    delete process.env.SUPER_OUTER_CLAUDE_BIN;
    delete process.env.SUPER_OUTER_CODEX_BIN;
  }
});

test("a changed package file is rejected before host configuration changes", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-corrupt") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const watched = snapshot(home, [".claude/settings.json", ".codex/hooks.json", ".cursor/mcp.json"]);
  fs.appendFileSync(path.join(bundleRoot, "marketplace/plugins/super-outer/skills/super-outer/modules/product-ui-ux-motion/subplaybooks/company-native-system.md"), "corruption\n");
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  try {
    await assert.rejects(installDeveloperUpgrade({ home, bundleRoot, yes: true }), /checksum failed/);
    assertSnapshot(home, watched);
  } finally {
    delete process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM;
    delete process.env.SUPER_OUTER_CLAUDE_BIN;
    delete process.env.SUPER_OUTER_CODEX_BIN;
  }
});

test("an unmanaged Codex reviewer-role collision stops and restores legacy state", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-role-collision") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  fs.mkdirSync(path.join(home, ".codex/agents"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex/agents/failure-scout.toml"), "unmanaged role exact bytes\n");
  const watched = snapshot(home, [
    ".claude/settings.json", ".codex/hooks.json", ".claude/CLAUDE.md", ".codex/AGENTS.md",
    ".claude/skills/plain-language-engineering-loop/SKILL.md", ".agents/skills/plain-language-engineering-loop/SKILL.md",
    ".codex/agents/failure-scout.toml", ".cursor/mcp.json",
  ]);
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  try {
    await assert.rejects(installDeveloperUpgrade({ home, bundleRoot, yes: true }), /different unmanaged Codex role/);
    assertSnapshot(home, watched);
  } finally {
    delete process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM;
    delete process.env.SUPER_OUTER_CLAUDE_BIN;
    delete process.env.SUPER_OUTER_CODEX_BIN;
  }
});

/**
 * The failure this suite now guards: a developer clones the repository, runs
 * the one documented command, and Super-outer is on. Previously the only
 * documented command staged into a throwaway folder and refused the real home,
 * so a careful reader concluded installation was blocked on purpose.
 */
test("one command from a clone switches both hosts on, and undoes itself exactly", async () => {
  const { setup } = await import("../../scripts/setup.mjs");
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const previous = { ...process.env };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  const restoredPaths = [".claude/CLAUDE.md", ".codex/AGENTS.md", ".claude/settings.json", ".codex/hooks.json"];
  const before = snapshot(home, restoredPaths);
  try {
    const installed = await setup({ command: "install", home, root });
    assert.equal(installed.valid, true, (installed.failures || []).join(", "));
    assert.equal(installed.hosts.claude.exact, 1);
    assert.equal(installed.hosts.codex.exact, 1);

    const verified = await setup({ command: "verify", home, root });
    assert.equal(verified.valid, true, verified.failures.join(", "));

    const rolledBack = await setup({ command: "rollback", home, root });
    assert.equal(rolledBack.rolledBack, true);
    assertSnapshot(home, before);
  } finally {
    for (const key of ["SUPER_OUTER_ALLOW_TEST_PLATFORM", "SUPER_OUTER_CLAUDE_BIN", "SUPER_OUTER_CODEX_BIN"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

/**
 * Two instruction-file shapes that must not lose a line the author wrote.
 * The first is any machine an earlier installer touched; the second is a
 * machine already on the managed block with hand-written notes after it.
 */
test("taking over an instruction file keeps every hand-written line", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-guidance") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const previous = { ...process.env };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  const claudeFile = path.join(home, ".claude/CLAUDE.md");
  try {
    // A machine an earlier installer already wrote a frozen v4 section into,
    // with the author's own Super-outer notes sitting after it.
    fs.writeFileSync(claudeFile, [
      "# My own guide", "", "My first rule.", "",
      LEGACY_CLAUDE_BLOCK, "",
      "## Super-outer — my own additions", "", "Never lose this line.", "",
    ].join("\n"));

    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, (installed.failures || []).join(", "));
    const guide = fs.readFileSync(claudeFile, "utf8");
    assert.match(guide, /My first rule\./);
    assert.match(guide, /Never lose this line\./, "the author's own section survived");
    assert.doesNotMatch(guide, /apply the installed Super-outer v4 guidance/, "the stale v4 section was removed");
    assert.doesNotMatch(guide, /Super-outer v4\b/);
    assert.match(guide, new RegExp(`## Super-outer — installed guidance \\(v${escaped(VERSION)}\\)`));
    assert.equal((guide.match(/<!-- BEGIN SUPER-OUTER MANAGED GUIDANCE -->/g) || []).length, 1);

    // Re-running against the managed block replaces only the block.
    const second = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(second.valid !== false, true);
    const again = fs.readFileSync(claudeFile, "utf8");
    assert.match(again, /Never lose this line\./);
    assert.equal((again.match(/<!-- BEGIN SUPER-OUTER MANAGED GUIDANCE -->/g) || []).length, 1);
  } finally {
    for (const key of ["SUPER_OUTER_ALLOW_TEST_PLATFORM", "SUPER_OUTER_CLAUDE_BIN", "SUPER_OUTER_CODEX_BIN"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

/**
 * A hand-written Super-outer section is the author's. Leaving it alone must
 * not cost them the installation itself.
 */
test("a hand-written Super-outer section is preserved and the install still succeeds", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-handwritten") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const previous = { ...process.env };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  const claudeFile = path.join(home, ".claude/CLAUDE.md");
  try {
    fs.writeFileSync(claudeFile, ["# Mine", "", "## Super-outer v9 guidance I maintain myself", "", "Do not touch.", ""].join("\n"));
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, (installed.failures || []).join(", "));
    assert.equal(fs.readFileSync(claudeFile, "utf8").includes("Do not touch."), true);
    assert.equal(installed.hosts.claude.exact, 1, "the plugin still installed");
    assert.ok(installed.notes.includes("claude-guidance-left-to-author"), "the skipped file is reported");
    assert.equal(
      installed.receipt.guidance.find((entry) => entry.file === ".claude/CLAUDE.md").action,
      "refuse",
    );
  } finally {
    for (const key of ["SUPER_OUTER_ALLOW_TEST_PLATFORM", "SUPER_OUTER_CLAUDE_BIN", "SUPER_OUTER_CODEX_BIN"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


/**
 * The layout that loses data if the legacy block is located by scanning to the
 * next heading: the reader added prose directly beneath it, with no heading of
 * its own to stop the cut. Earlier installers always appended last, so this is
 * the normal shape of a machine that has had Super-outer for a while.
 */
test("un-headed prose written after the old block survives the takeover", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-prose") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const previous = { ...process.env };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  const claudeFile = path.join(home, ".claude/CLAUDE.md");
  try {
    fs.writeFileSync(claudeFile, [
      "# My guide", "", "Rule one.", "",
      LEGACY_CLAUDE_BLOCK, "",
      "### A subsection of my own", "", "Rule two, written after the install.", "",
      "And a closing line with no heading at all.", "",
    ].join("\n"));

    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, (installed.failures || []).join(", "));
    const guide = fs.readFileSync(claudeFile, "utf8");
    assert.match(guide, /Rule one\./);
    assert.match(guide, /### A subsection of my own/);
    assert.match(guide, /Rule two, written after the install\./);
    assert.match(guide, /And a closing line with no heading at all\./);
    assert.doesNotMatch(guide, /Super-outer v4\b/, "the frozen block is gone");
    assert.match(guide, /## Super-outer — installed guidance/);
  } finally {
    for (const key of ["SUPER_OUTER_ALLOW_TEST_PLATFORM", "SUPER_OUTER_CLAUDE_BIN", "SUPER_OUTER_CODEX_BIN"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

/**
 * The double-click route runs the packaged runtime as its own process. Verify
 * was covered; install was not, and install is what a recipient actually runs.
 */
test("the packaged runtime installs as a standalone process", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-cli") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const env = {
    ...process.env,
    SUPER_OUTER_ALLOW_TEST_PLATFORM: "1",
    SUPER_OUTER_CLAUDE_BIN: executables.claude,
    SUPER_OUTER_CODEX_BIN: executables.codex,
  };
  const result = spawnSync(process.execPath, [
    path.join(bundleRoot, "runtime/developer-upgrade.mjs"),
    "install", "--bundle", bundleRoot, "--home", home, "--yes", "--json",
  ], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true, (parsed.failures || []).join(", "));
  assert.match(fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8"), /## Super-outer — installed guidance/);
});

/**
 * A legacy section someone edited cannot have its boundaries known exactly, so
 * it is left alone and reported. Installing still succeeds: an old paragraph in
 * a Markdown file is not a reason to withhold the tool.
 */
test("an edited legacy section is reported, not guessed at, and does not fail the install", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-edited") });
  const bundleRoot = extractPackage(packageResult.package);
  const home = legacyHome();
  const executables = installFakeHosts(home);
  const previous = { ...process.env };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  const claudeFile = path.join(home, ".claude/CLAUDE.md");
  try {
    fs.writeFileSync(claudeFile, [
      "# Mine", "",
      "## Super-outer v4 — warn first, approve only super-critical work", "",
      "I rewrote this paragraph myself.", "",
    ].join("\n"));
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, (installed.failures || []).join(", "));
    assert.equal(installed.hosts.claude.exact, 1);
    assert.ok(installed.notes.includes("claude-legacy-guidance-left-to-author"));
    assert.match(fs.readFileSync(claudeFile, "utf8"), /I rewrote this paragraph myself\./);
  } finally {
    for (const key of ["SUPER_OUTER_ALLOW_TEST_PLATFORM", "SUPER_OUTER_CLAUDE_BIN", "SUPER_OUTER_CODEX_BIN"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

/** The plugin records a fake host holds, by full id. */
const fakeRecords = (home, host) => {
  const file = host === "claude"
    ? path.join(home, ".claude", "plugins", "installed_plugins.json")
    : path.join(home, ".codex", "config.toml");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")).records.map((record) => record.id || record.pluginId).sort();
};
const fakeHostEnv = (executables) => {
  const previous = { ...process.env };
  process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM = "1";
  process.env.SUPER_OUTER_CLAUDE_BIN = executables.claude;
  process.env.SUPER_OUTER_CODEX_BIN = executables.codex;
  return () => {
    for (const key of ["SUPER_OUTER_ALLOW_TEST_PLATFORM", "SUPER_OUTER_CLAUDE_BIN", "SUPER_OUTER_CODEX_BIN"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
};
const core = "super-outer@super-outer-developer-update";
const learning = "super-outer-learning@super-outer-developer-update";

test("only files the host writes at a plugin's root are left out of a digest", async () => {
  const { hostWrittenPath } = await import("../../scripts/build-package.mjs");
  for (const relative of [".in_use", ".in_use/30905", ".orphaned_at", ".claude-plugin/types", ".claude-plugin/types/claude-code/index.d.ts", "tsconfig.json"]) {
    assert.equal(hostWrittenPath(relative), true, relative);
  }
  for (const relative of ["skills/x/.in_use/1", "a/.in_use", "skills/super-outer/tsconfig.json", ".claude-plugin/plugin.json", "hooks/hooks.json"]) {
    assert.equal(hostWrittenPath(relative), false, relative);
  }
});

test("a component choice reads skills, both or none", () => {
  assert.deepEqual(normalizeComponents("both"), ["skills"]);
  assert.throws(() => normalizeComponents("skills,mod"), /Unknown component: mod/);
  assert.deepEqual(normalizeComponents(" Skills "), ["skills"]);
  assert.deepEqual(normalizeComponents("none"), []);
  assert.equal(normalizeComponents(undefined), null);
  assert.throws(() => normalizeComponents("skills,themes"), /Unknown component: themes/);
  assert.throws(() => normalizeComponents(" , "), /Give --components a value/);
});

test("the package carries the optional learning plugin for both hosts", async () => {
  const packageResult = buildDeveloperPackage({ root, outputDir: temp("super-outer-package-optional") });
  const bundleRoot = extractPackage(packageResult.package);
  const manifest = JSON.parse(fs.readFileSync(path.join(bundleRoot, "PACKAGE-MANIFEST.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.optional_plugins).sort(), ["super-outer-learning"]);
  assert.equal(manifest.optional_plugins["super-outer-learning"].version, VERSION);
  const names = (relative) => JSON.parse(fs.readFileSync(path.join(bundleRoot, "marketplace", ...relative.split("/")), "utf8"))
    .plugins.map((plugin) => plugin.name).sort();
  assert.deepEqual(names(".claude-plugin/marketplace.json"), ["super-outer", "super-outer-learning"]);
  assert.deepEqual(names(".agents/plugins/marketplace.json"), ["super-outer", "super-outer-learning"]);
  // The core payload never carries the optional plugins.
  assert.equal(fs.existsSync(path.join(bundleRoot, "marketplace/plugins/super-outer/optional")), false);
  const bundle = await loadBundle(bundleRoot);
  assert.deepEqual([...bundle.optional["super-outer-learning"].hosts].sort(), ["claude", "codex"]);
});

test("a first install brings the optional learning skills and saves that choice", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-default") }).package);
  const home = temp("super-outer-default-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    assert.deepEqual(installed.components, ["skills"]);
    assert.deepEqual(fakeRecords(home, "claude"), [core, learning].sort());
    assert.deepEqual(fakeRecords(home, "codex"), [core, learning].sort());
    const saved = JSON.parse(fs.readFileSync(path.join(home, ".super-outer/components.json"), "utf8"));
    assert.deepEqual(saved.components, ["skills"]);
    assert.match(fs.readFileSync(path.join(home, ".super-outer/developer-upgrade-receipt.txt"), "utf8"),
      /Optional parts: the learning skills\./);
  } finally { restore(); }
});

test("a changed choice adds and removes optional parts, and an update keeps the saved choice", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-choice") }).package);
  const home = temp("super-outer-choice-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    const skillsOnly = await installDeveloperUpgrade({ home, bundleRoot, yes: true, components: "skills" });
    assert.equal(skillsOnly.valid, true, skillsOnly.failures.join(", "));
    assert.deepEqual(fakeRecords(home, "claude"), [core, learning].sort());
    assert.deepEqual(fakeRecords(home, "codex"), [core, learning].sort());

    const update = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(update.idempotent, true, "an update with no choice keeps the saved one");
    assert.deepEqual(update.components, ["skills"]);

    const none = await installDeveloperUpgrade({ home, bundleRoot, yes: true, components: "none" });
    assert.equal(none.valid, true, none.failures.join(", "));
    assert.deepEqual(fakeRecords(home, "claude"), [core]);
    assert.deepEqual(fakeRecords(home, "codex"), [core]);

    const verified = await verifyDeveloperUpgrade({ home, bundleRoot });
    assert.equal(verified.valid, true, verified.failures.join(", "));
    assert.deepEqual(verified.components, []);
  } finally { restore(); }
});

/**
 * An optional plugin may already be installed from another marketplace. Two
 * active copies would both run, so choosing that part replaces the other copy;
 * not choosing it leaves the other copy exactly where it was.
 */
test("an optional plugin from another source is replaced only when it is chosen, and rollback restores it", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-foreign") }).package);
  const seedForeign = (home) => {
    const installPath = path.join(home, ".claude", "plugins", "cache", "other", "super-outer-learning", "0.7.2");
    fs.mkdirSync(path.join(installPath, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(installPath, ".claude-plugin", "plugin.json"), `${JSON.stringify({ name: "super-outer-learning", version: "0.7.2" })}\n`);
    const stateFile = path.join(home, ".claude", "plugins", "installed_plugins.json");
    fs.writeFileSync(stateFile, `${JSON.stringify({
      records: [{ id: "super-outer-learning@other", name: "super-outer-learning", version: "0.7.2", scope: "user", enabled: true, installPath }],
      marketplaces: { other: "/elsewhere/other-marketplace" },
    }, null, 2)}\n`);
    return { installPath, stateFile };
  };

  const noneHome = temp("super-outer-foreign-none-home");
  let restore = fakeHostEnv(installFakeHosts(noneHome));
  try {
    seedForeign(noneHome);
    const installed = await installDeveloperUpgrade({ home: noneHome, bundleRoot, yes: true, components: "none" });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    assert.ok(fakeRecords(noneHome, "claude").includes("super-outer-learning@other"), "choosing none leaves another copy alone");
  } finally { restore(); }

  const skillsHome = temp("super-outer-foreign-skills-home");
  restore = fakeHostEnv(installFakeHosts(skillsHome));
  try {
    const { installPath, stateFile } = seedForeign(skillsHome);
    const before = fs.readFileSync(stateFile);
    const installed = await installDeveloperUpgrade({ home: skillsHome, bundleRoot, yes: true, components: "skills" });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    assert.deepEqual(fakeRecords(skillsHome, "claude"), [core, learning].sort());
    assert.deepEqual(installed.receipt.hosts.find((host) => host.host === "claude").replaced, ["super-outer-learning@other"]);

    const rolledBack = await rollbackDeveloperUpgrade({ home: skillsHome, bundleRoot, yes: true });
    assert.equal(rolledBack.rolledBack, true);
    assert.deepEqual(fs.readFileSync(stateFile), before);
    assert.equal(fs.existsSync(path.join(installPath, ".claude-plugin", "plugin.json")), true);
    assert.equal(fs.existsSync(path.join(skillsHome, ".super-outer/components.json")), false);
  } finally { restore(); }
});

test("one command from a clone takes the component choice", async () => {
  const { setup } = await import("../../scripts/setup.mjs");
  const home = temp("super-outer-setup-components-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    const installed = await setup({ command: "install", home, root, components: ["skills"] });
    assert.equal(installed.valid, true, (installed.failures || []).join(", "));
    assert.deepEqual(installed.components, ["skills"]);
    assert.deepEqual(fakeRecords(home, "claude"), [core, learning].sort());
  } finally { restore(); }
});

/**
 * Claude Code writes into the folders it installs: a list of the sessions using
 * a plugin, and type files and a tsconfig.json beside a plugin it loads. A correct install must still verify, and a re-run must change nothing.
 */
test("files the host writes into installed plugins neither fail verification nor force a reinstall", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-host-writes") }).package);
  const home = temp("super-outer-host-writes-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    const cache = path.join(home, ".claude", "plugins", "cache", "super-outer-developer-update");
    const coreFolder = path.join(cache, "super-outer", VERSION);
    const learningFolder = fs.readdirSync(path.join(cache, "super-outer-learning")).map((version) => path.join(cache, "super-outer-learning", version))[0];
    fs.mkdirSync(path.join(coreFolder, ".in_use"), { recursive: true });
    fs.writeFileSync(path.join(coreFolder, ".in_use", "30905"), "");
    fs.mkdirSync(path.join(learningFolder, ".claude-plugin", "types", "claude-code"), { recursive: true });
    fs.writeFileSync(path.join(learningFolder, ".claude-plugin", "types", "claude-code", "index.d.ts"), "// Written by Claude Code\n");
    fs.writeFileSync(path.join(learningFolder, "tsconfig.json"), "{}\n");

    const verified = await verifyDeveloperUpgrade({ home, bundleRoot });
    assert.equal(verified.valid, true, verified.failures.join(", "));
    const again = await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(again.idempotent, true, "a re-run with the saved choice changes nothing");

    // A file the package does carry still counts.
    fs.appendFileSync(path.join(learningFolder, "README.md"), "edited\n");
    const edited = await verifyDeveloperUpgrade({ home, bundleRoot });
    assert.ok(edited.failures.includes("claude-super-outer-learning-not-exactly-one-verified"), edited.failures.join(", "));
  } finally { restore(); }
});

test("an unreadable saved choice stops an update instead of guessing, and an explicit choice still installs", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-corrupt-choice") }).package);
  const home = temp("super-outer-corrupt-choice-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    fs.mkdirSync(path.join(home, ".super-outer"), { recursive: true });
    fs.writeFileSync(path.join(home, ".super-outer/components.json"), "{ not json\n");
    await assert.rejects(installDeveloperUpgrade({ home, bundleRoot, yes: true }), /saved choice .* cannot be read/);
    assert.deepEqual(fakeRecords(home, "claude"), []);
    const chosen = await installDeveloperUpgrade({ home, bundleRoot, yes: true, components: "none" });
    assert.equal(chosen.valid, true, chosen.failures.join(", "));
    assert.deepEqual(fakeRecords(home, "claude"), [core]);
  } finally { restore(); }
});

/**
 * A spawned installer must never be able to reach the real home: an earlier
 * version of this test ran a real install when run against code that accepted
 * the bare flag. A throwaway home and missing hosts keep any regression inside
 * the test: with no host available, an installer that accepted the flag stops before writing anything.
 */
test("a --components flag with no value or an empty value is refused", () => {
  const home = temp("super-outer-bare-flag-home");
  const env = {
    ...process.env,
    HOME: home,
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    CODEX_HOME: path.join(home, ".codex"),
    SUPER_OUTER_JEV: "off",
    SUPER_OUTER_ALLOW_TEST_PLATFORM: "1",
    SUPER_OUTER_CLAUDE_BIN: path.join(home, "missing-claude"),
    SUPER_OUTER_CODEX_BIN: path.join(home, "missing-codex"),
  };
  for (const tail of [["--components"], ["--components", ""], ["--components", " , "]]) {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "setup.mjs"), "install", "--home", home, ...tail], { encoding: "utf8", env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Give --components a value/);
  }
  assert.deepEqual(fs.readdirSync(home), [], "nothing was written to the throwaway home");
});

test("another copy's folder is backed up only when it sits in the plugin cache", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-foreign-path") }).package);
  const home = temp("super-outer-foreign-path-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    const documents = path.join(home, "Documents");
    fs.mkdirSync(documents, { recursive: true });
    fs.writeFileSync(path.join(documents, "notes.txt"), "mine\n");
    // Built as a string: path.join would remove the ".." segments before the installer saw them.
    const installPath = `${home}/.claude/plugins/cache/other/super-outer-learning/../../../../../Documents`;
    fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), `${JSON.stringify({
      records: [{ id: "super-outer-learning@other", name: "super-outer-learning", version: "0.7.2", scope: "user", enabled: true, installPath }],
      marketplaces: {},
    }, null, 2)}\n`);
    const installed = await installDeveloperUpgrade({ home, bundleRoot, yes: true, components: "skills" });
    assert.equal(installed.valid, true, installed.failures.join(", "));
    const latest = JSON.parse(fs.readFileSync(path.join(home, ".super-outer/latest-developer-upgrade.json"), "utf8"));
    const record = JSON.parse(fs.readFileSync(path.join(latest.directory, "record.json"), "utf8"));
    assert.equal(record.targets.some((entry) => entry.relative === "Documents" || entry.relative.includes("..")), false);
    fs.writeFileSync(path.join(documents, "later.txt"), "written after the install\n");
    await rollbackDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(fs.readFileSync(path.join(documents, "later.txt"), "utf8"), "written after the install\n");
  } finally { restore(); }
});

test("install writes a stable launcher that runs the installed version, and rollback removes it", async () => {
  const bundleRoot = extractPackage(buildDeveloperPackage({ root, outputDir: temp("super-outer-package-launcher") }).package);
  const home = temp("super-outer-launcher-home");
  const restore = fakeHostEnv(installFakeHosts(home));
  try {
    await installDeveloperUpgrade({ home, bundleRoot, yes: true });
    const launcher = path.join(home, ".super-outer/bin/super-outer");
    const text = fs.readFileSync(launcher, "utf8");
    assert.ok(text.startsWith("#!/bin/sh\n"));
    assert.ok(text.includes(path.join(home, `.super-outer/developer-marketplace/${VERSION}/plugins/super-outer/bin/super-outer.mjs`)));
    assert.equal(fs.statSync(launcher).mode & 0o777, 0o755);
    const ran = spawnSync(launcher, ["jev", "ask", "--kind", "form", "--options", "a,b"], {
      input: "write it", encoding: "utf8", env: { ...process.env, SUPER_OUTER_JEV: "off" },
    });
    assert.equal(ran.status, 0, ran.stderr);
    assert.deepEqual(JSON.parse(ran.stdout), { answer: null, source: "off", confident: false });
    await rollbackDeveloperUpgrade({ home, bundleRoot, yes: true });
    assert.equal(fs.existsSync(launcher), false);
  } finally { restore(); }
});
