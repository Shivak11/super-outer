import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installSuperOuter, verifyInstallation } from "../scripts/install.mjs";
import { createProductionHostAdapter } from "../scripts/host-adapter.mjs";
import { deactivateLegacyOuter, inventoryOuter21, inventoryV3 } from "../scripts/migrate-v3.mjs";
import { rollbackInstallation } from "../scripts/rollback.mjs";

const HOST_COMMAND_IDS = [
  "claude-marketplace", "claude-install", "claude-list", "claude-probe",
  "codex-install", "codex-list", "codex-probe",
];

const OUTER21_RELATIVES = [
  ".claude/skills/plain-language-engineering-loop.backup-20260803-155206-055678",
  ".agents/skills/plain-language-engineering-loop.backup-20260803-155206-055678",
];

const installRoleProof = ({ home, staged }) => {
  const destination = path.join(home, ".codex/agents");
  fs.mkdirSync(destination, { recursive: true });
  const roles = ["benchmark-researcher.toml", "design-prototyper.toml", "experience-reviewer.toml", "failure-scout.toml", "independent-verifier.toml"].map((file) => {
    const source = path.join(staged.codex, ".codex/agents", file);
    const target = path.join(destination, file);
    fs.copyFileSync(source, target);
    return {
      file,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
    };
  });
  const indexFile = path.join(home, ".codex/super-outer-agent-roles.json");
  fs.writeFileSync(indexFile, `${JSON.stringify({ schema_version: "1.0.0", plugin: "super-outer", version: "6.6.0", roles }, null, 2)}\n`);
  return {
    config_root: ".codex",
    index_sha256: crypto.createHash("sha256").update(fs.readFileSync(indexFile)).digest("hex"),
    roles,
  };
};

const passingHostProof = ({ activationId, sourceDigest, home, staged }, overrides = {}) => ({
  schema_version: "1.0.0",
  status: "PASS",
  activation_id: activationId,
  source_digest: sourceDigest,
  staged_source_digests: { claude: sourceDigest, codex: sourceDigest },
  claude_discovered: true,
  codex_discovered: true,
  claude_hook_executed: true,
  codex_hook_executed: true,
  hook_executed: true,
  probe_freshness: true,
  probe_binding: { activation_id: activationId, source_digest: sourceDigest, version: "6.6.0", phase: "completed" },
  runtime_activation: "HOOK_COMPLETED",
  model_response_completed: true,
  model_outcomes: { claude: "completed", codex: "completed" },
  account_session: { claude: true, codex: true },
  proof_limit: null,
  blocked_reason: null,
  commands: HOST_COMMAND_IDS.map((id) => ({ id, exit_code: 0, outcome: "completed" })),
  discovery: {
    claude: { discovered: true, enabled: true, version: "6.6.0", source_reported: false, source_digest_verified: false },
    codex: { discovered: true, enabled: true, version: "6.6.0", source_reported: false, source_digest_verified: false },
  },
  codex_agents: installRoleProof({ home, staged }),
  ...overrides,
});

const sourceFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-install-source-"));
  for (const relative of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify({ name: "super-outer", version: "6.6.0" })}\n`);
  }
  fs.mkdirSync(path.join(root, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, "hooks/hooks.json"), "{}\n");
  fs.mkdirSync(path.join(root, "commands"), { recursive: true });
  fs.writeFileSync(path.join(root, "commands/outer.md"), "Use the `super-outer` skill: $ARGUMENTS\n");
  fs.writeFileSync(path.join(root, "payload.txt"), "v4 payload\n");
  fs.mkdirSync(path.join(root, ".codex/agents"), { recursive: true });
  for (const role of ["benchmark-researcher", "design-prototyper", "experience-reviewer", "failure-scout", "independent-verifier"]) {
    fs.writeFileSync(path.join(root, ".codex/agents", `${role}.toml`), `name = "${role.replaceAll("-", "_")}"\n`);
  }
  fs.mkdirSync(path.join(root, "docs/plans"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/plans/private.md"), "/Users/private/plan\n");
  return root;
};

const homeWithV3 = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-home-fixture-"));
  for (const relative of [".claude/skills/plain-language-engineering-loop", ".agents/skills/plain-language-engineering-loop"]) {
    fs.mkdirSync(path.join(home, relative), { recursive: true });
    fs.writeFileSync(path.join(home, relative, "sentinel.txt"), `v3:${relative}\n`);
  }
  for (const relative of OUTER21_RELATIVES) {
    fs.mkdirSync(path.join(home, relative), { recursive: true });
    fs.writeFileSync(path.join(home, relative, "SKILL.md"), `# OUTER\n\nVersion 2.1 — retained fixture.\n\n${relative}\n`);
  }
  const settings = {
    theme: "keep-me",
    hooks: {
      PreToolUse: [{ hooks: [
        { type: "command", command: "node ~/.claude/skills/plain-language-engineering-loop/scripts/outer-pre-mutation-gate.mjs" },
        { type: "command", command: "node /keep/unrelated-hook.mjs" }
      ] }]
    }
  };
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude/settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
  const codexHooks = {
    hooks: {
      PreToolUse: [{ hooks: [
        { type: "command", command: "node ~/.agents/skills/plain-language-engineering-loop/scripts/outer-pre-mutation-gate.mjs" },
        { type: "command", command: "node /keep/codex-hook.mjs" }
      ] }]
    }
  };
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex/hooks.json"), `${JSON.stringify(codexHooks, null, 2)}\n`);
  const claudeGuidance = [
    "# Global Claude Instructions",
    "",
    "## OUTER v3 — senior-engineer control before material work",
    "",
    "Before mutation, print APPROVE OUTER-XXXXXXXX and wait.",
    "",
    "## OUTER v3 — senior-engineer control before material work",
    "",
    "A duplicate legacy Claude block must also be removed.",
    "",
    "## Keep This Claude Rule",
    "",
    "Unrelated Claude guidance."
  ].join("\n");
  const codexGuidance = [
    "<identity>",
    "Keep identity.",
    "</identity>",
    "",
    "<outer-v3>",
    "Before mutation, print APPROVE OUTER-XXXXXXXX and wait.",
    "</outer-v3>",
    "",
    "<outer-v3>",
    "A duplicate legacy Codex block must also be removed.",
    "</outer-v3>",
    "",
    "<keep-rule>",
    "Unrelated Codex guidance.",
    "</keep-rule>"
  ].join("\n");
  fs.writeFileSync(path.join(home, ".claude/CLAUDE.md"), claudeGuidance);
  fs.writeFileSync(path.join(home, ".codex/AGENTS.md"), codexGuidance);
  fs.mkdirSync(path.join(home, ".claude/commands"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude/commands/outer.md"), "v3 outer alias exact bytes\n");
  fs.writeFileSync(path.join(home, ".claude/commands/unrelated.md"), "keep unrelated command\n");
  return {
    home,
    settingsText: fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"),
    codexHooksText: fs.readFileSync(path.join(home, ".codex/hooks.json"), "utf8"),
    claudeGuidance,
    codexGuidance,
    aliasText: fs.readFileSync(path.join(home, ".claude/commands/outer.md"), "utf8")
  };
};

test("isolated install is idempotent, keeps v3 intact, and leaves v3 as sole enforcement owner", () => {
  const sourceRoot = sourceFixture();
  const { home, aliasText } = homeWithV3();
  const before = inventoryV3({ home });
  const first = installSuperOuter({ home, sourceRoot });
  assert.equal(first.activeOwner, "outer-v3");
  assert.equal(first.installed, false);
  assert.equal(first.source_staged, true);
  assert.equal(first.host_discovery, false);
  assert.equal(first.hook_execution, false);
  assert.equal(first.runtime_review, false);
  assert.equal(first.v3Intact, true);
  assert.equal(fs.existsSync(path.join(home, ".super-outer/versions/6.6.0/docs/plans/private.md")), false);
  assert.equal(first.migration_record.status, "ISOLATED");
  assert.equal(first.migration_record.active_enforcement_owner, "outer-v3");
  assert.equal(first.migration_record.v4_installed, false);
  assert.equal(first.migration_record.v4_isolated_verified, false);
  assert.equal(verifyInstallation({ home, sourceRoot }).valid, true);
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/outer.md"), "utf8"), aliasText);
  const second = installSuperOuter({ home, sourceRoot });
  assert.equal(second.idempotent, true);
  const after = inventoryV3({ home });
  assert.deepEqual(after.installations.map((entry) => entry.sha256), before.installations.map((entry) => entry.sha256));
});

test("promotion archives and deactivates OUTER 2.1 and v3 while exact rollback restores prior bytes", () => {
  const sourceRoot = sourceFixture();
  const { home, settingsText, codexHooksText, claudeGuidance, codexGuidance, aliasText } = homeWithV3();
  const hostAdapter = { transactionPaths: [".codex"], activate: ({ staged, activationId, sourceDigest }) => {
    assert.equal(fs.existsSync(path.join(staged.claude, ".claude-plugin/plugin.json")), true);
    assert.equal(fs.existsSync(path.join(staged.codex, ".codex-plugin/plugin.json")), true);
    return passingHostProof({ activationId, sourceDigest, home, staged }, { fixture: "isolated-adapter" });
  } };
  const installed = installSuperOuter({ home, sourceRoot, promote: true, hostAdapter });
  assert.equal(installed.activeOwner, "super-outer-v4");
  assert.equal(installed.outer21Detected, true);
  assert.equal(installed.legacyRetained, true);
  assert.deepEqual(installed.migration_record.legacy_versions_deactivated, ["outer-2.1", "outer-v3"]);
  assert.equal(inventoryOuter21({ home }).detected, false);
  assert.equal(inventoryV3({ home }).detected, false);
  assert.equal(verifyInstallation({ home, sourceRoot }).valid, true);
  assert.deepEqual(
    fs.readdirSync(path.join(home, ".codex/agents")).sort(),
    ["benchmark-researcher.toml", "design-prototyper.toml", "experience-reviewer.toml", "failure-scout.toml", "independent-verifier.toml"],
  );
  assert.equal(fs.existsSync(path.join(home, ".claude/skills/plain-language-engineering-loop")), false);
  for (const relative of OUTER21_RELATIVES) assert.equal(fs.existsSync(path.join(home, relative)), false);
  assert.equal(fs.existsSync(path.join(installed.legacyDeactivation.outerV3.archive, "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(installed.legacyDeactivation.outer21.archive, "manifest.json")), true);
  assert.equal(
    fs.readFileSync(path.join(installed.legacyDeactivation.outerV3.archive, "retained/.claude/skills/plain-language-engineering-loop/sentinel.txt"), "utf8"),
    "v3:.claude/skills/plain-language-engineering-loop\n",
  );
  assert.match(
    fs.readFileSync(path.join(installed.legacyDeactivation.outer21.archive, "retained", OUTER21_RELATIVES[0], "SKILL.md"), "utf8"),
    /Version 2\.1/,
  );
  const promotedSettings = fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8");
  assert.doesNotMatch(promotedSettings, /outer-pre-mutation-gate/);
  assert.match(promotedSettings, /unrelated-hook/);
  const promotedCodexHooks = fs.readFileSync(path.join(home, ".codex/hooks.json"), "utf8");
  assert.doesNotMatch(promotedCodexHooks, /outer-pre-mutation-gate/);
  assert.match(promotedCodexHooks, /codex-hook/);
  const promotedClaudeGuidance = fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8");
  assert.doesNotMatch(promotedClaudeGuidance, /OUTER v3|APPROVE OUTER-/);
  // Removing v3 leaves the managed block, which names the installed version.
  assert.match(promotedClaudeGuidance, /## Super-outer — installed guidance/);
  assert.doesNotMatch(promotedClaudeGuidance, /Super-outer v4\b/);
  assert.equal((promotedClaudeGuidance.match(/<!-- BEGIN SUPER-OUTER MANAGED GUIDANCE -->/g) || []).length, 1);
  assert.match(promotedClaudeGuidance, /Keep This Claude Rule|Unrelated Claude guidance/);
  const promotedCodexGuidance = fs.readFileSync(path.join(home, ".codex/AGENTS.md"), "utf8");
  assert.doesNotMatch(promotedCodexGuidance, /<outer-v3>|APPROVE OUTER-/);
  assert.match(promotedCodexGuidance, /## Super-outer — installed guidance/);
  assert.doesNotMatch(promotedCodexGuidance, /<super-outer-v4>/);
  assert.equal((promotedCodexGuidance.match(/<!-- BEGIN SUPER-OUTER MANAGED GUIDANCE -->/g) || []).length, 1);
  assert.match(promotedCodexGuidance, /<keep-rule>|Unrelated Codex guidance/);
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/outer.md"), "utf8"), fs.readFileSync(path.join(sourceRoot, "commands/outer.md"), "utf8"));
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/unrelated.md"), "utf8"), "keep unrelated command\n");
  const rolledBack = rollbackInstallation({ home });
  assert.equal(rolledBack.rolled_back, true);
  assert.equal(rolledBack.schema_version, "1.0.0");
  assert.equal(rolledBack.status, "ROLLED_BACK");
  assert.equal(rolledBack.migration_record.status, "ROLLED BACK");
  assert.equal(rolledBack.migration_record.active_enforcement_owner, "outer-v3");
  assert.equal(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"), settingsText);
  assert.equal(fs.readFileSync(path.join(home, ".codex/hooks.json"), "utf8"), codexHooksText);
  assert.equal(fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8"), claudeGuidance);
  assert.equal(fs.readFileSync(path.join(home, ".codex/AGENTS.md"), "utf8"), codexGuidance);
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/outer.md"), "utf8"), aliasText);
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/unrelated.md"), "utf8"), "keep unrelated command\n");
  assert.equal(fs.existsSync(path.join(home, ".super-outer/staged/claude/super-outer")), false);
  assert.equal(fs.existsSync(path.join(home, ".super-outer/staged/codex/super-outer")), false);
  assert.equal(fs.existsSync(path.join(home, ".codex")), true);
  assert.equal(fs.existsSync(path.join(home, ".codex/super-outer-agent-roles.json")), false);
  assert.equal(fs.existsSync(path.join(home, ".claude/skills/plain-language-engineering-loop/sentinel.txt")), true);
  for (const relative of OUTER21_RELATIVES) {
    assert.match(fs.readFileSync(path.join(home, relative, "SKILL.md"), "utf8"), /Version 2\.1/);
  }
  assert.equal(fs.existsSync(installed.legacyDeactivation.outer21.archive), true);
  assert.equal(fs.existsSync(installed.legacyDeactivation.outerV3.archive), true);
  assert.equal(rollbackInstallation({ home }).status, "ALREADY_ROLLED_BACK");
});

test("promotion can run again after rollback without overwriting retained legacy archives", () => {
  const sourceRoot = sourceFixture();
  const { home } = homeWithV3();
  const hostAdapter = { transactionPaths: [".codex"], activate: ({ activationId, sourceDigest, staged }) => (
    passingHostProof({ activationId, sourceDigest, home, staged })
  ) };
  const first = installSuperOuter({ home, sourceRoot, promote: true, hostAdapter });
  assert.equal(rollbackInstallation({ home }).status, "ROLLED_BACK");
  const second = installSuperOuter({ home, sourceRoot, promote: true, hostAdapter });
  assert.equal(second.activeOwner, "super-outer-v4");
  assert.equal(inventoryOuter21({ home }).detected, false);
  assert.equal(inventoryV3({ home }).detected, false);
  assert.equal(fs.existsSync(path.join(first.legacyDeactivation.outer21.archive, "retained-2", OUTER21_RELATIVES[0])), true);
  assert.equal(fs.existsSync(path.join(first.legacyDeactivation.outerV3.archive, "retained-2/.claude/skills/plain-language-engineering-loop")), true);
});

test("direct legacy deactivation rejects a symlink alias to the real user home", () => {
  const alias = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-home-alias-parent-")), "home-alias");
  fs.symlinkSync(os.homedir(), alias, "dir");
  assert.throws(() => deactivateLegacyOuter({ home: alias }), /cannot be a symbolic link/);
});

test("production promotion installs native Codex roles beside unrelated roles and rollback restores the prior config", () => {
  const sourceRoot = sourceFixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-native-agents-home-"));
  const unrelated = path.join(home, ".codex/agents/custom-reviewer.toml");
  fs.mkdirSync(path.dirname(unrelated), { recursive: true });
  fs.writeFileSync(unrelated, "name = \"custom_reviewer\"\n");
  const commandRunner = ({ executable, args, env }) => {
    if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
      fs.mkdirSync(path.dirname(env.SUPER_OUTER_HOOK_PROBE_FILE), { recursive: true });
      fs.writeFileSync(env.SUPER_OUTER_HOOK_PROBE_FILE, `${JSON.stringify({
        event: "UserPromptSubmit",
        client: env.SUPER_OUTER_CLIENT,
        activation_id: env.SUPER_OUTER_ACTIVATION_ID,
        source_digest: env.SUPER_OUTER_SOURCE_DIGEST,
        version: env.SUPER_OUTER_VERSION,
        phase: "completed",
      })}\n`);
    }
    if (args.includes("list")) {
      const source = executable === "claude-fixture"
        ? path.join(home, ".super-outer/host-marketplaces/claude/plugins/super-outer")
        : path.join(home, "plugins/super-outer");
      return { status: 0, stdout: JSON.stringify([{ name: "super-outer", version: "6.6.0", enabled: true, source }]), stderr: "" };
    }
    return { status: 0, stdout: "ok", stderr: "" };
  };
  const hostAdapter = createProductionHostAdapter({
    home,
    commandRunner,
    executables: { claude: "claude-fixture", codex: "codex-fixture" },
  });

  const installed = installSuperOuter({ home, sourceRoot, promote: true, hostAdapter });
  assert.equal(installed.verification.valid, true);
  assert.deepEqual(
    fs.readdirSync(path.join(home, ".codex/agents")).sort(),
    ["benchmark-researcher.toml", "custom-reviewer.toml", "design-prototyper.toml", "experience-reviewer.toml", "failure-scout.toml", "independent-verifier.toml"],
  );
  assert.equal(fs.readFileSync(unrelated, "utf8"), "name = \"custom_reviewer\"\n");
  fs.writeFileSync(path.join(home, ".codex/agents/failure-scout.toml"), "tampered\n");
  assert.match(verifyInstallation({ home, sourceRoot }).failures.join("\n"), /codex-agent-digest-mismatch/);

  assert.equal(rollbackInstallation({ home }).status, "ROLLED_BACK");
  assert.deepEqual(fs.readdirSync(path.join(home, ".codex/agents")), ["custom-reviewer.toml"]);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "name = \"custom_reviewer\"\n");
});

test("a promoted install fails verification if host proof disappears", () => {
  const sourceRoot = sourceFixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-proof-fixture-"));
  installSuperOuter({
    home,
    sourceRoot,
    promote: true,
    hostAdapter: { transactionPaths: [".codex"], activate: ({ activationId, sourceDigest, staged }) => passingHostProof({ activationId, sourceDigest, home, staged }) },
  });
  fs.unlinkSync(path.join(home, ".super-outer/host-discovery-proof.json"));
  const verification = verifyInstallation({ home, sourceRoot });
  assert.equal(verification.staged_source_valid, true);
  assert.equal(verification.valid, false);
  assert.match(verification.failures.join("\n"), /host-discovery-proof-missing|hook-execution-proof-missing/);
});

test("promotion restores v3 if an adapter changes a retained v3 installation", () => {
  const sourceRoot = sourceFixture();
  const { home } = homeWithV3();
  const sentinel = path.join(home, ".agents/skills/plain-language-engineering-loop/sentinel.txt");
  const original = fs.readFileSync(sentinel, "utf8");
  assert.throws(() => installSuperOuter({
    home,
    sourceRoot,
    promote: true,
    hostAdapter: { transactionPaths: [".codex"], activate: ({ activationId, sourceDigest, staged }) => {
      fs.writeFileSync(sentinel, "unexpected change\n");
      return passingHostProof({ activationId, sourceDigest, home, staged });
    } },
  }), /Legacy archive changed before deactivation/);
  assert.equal(fs.readFileSync(sentinel, "utf8"), original);
});

test("a failed install rolls every touched target back and never changes v3", () => {
  const sourceRoot = sourceFixture();
  const { home, settingsText, aliasText } = homeWithV3();
  const before = inventoryV3({ home });
  const prior = process.env.SUPER_OUTER_FAIL_STEP;
  process.env.SUPER_OUTER_FAIL_STEP = "copy-2";
  const hostAdapter = { transactionPaths: [".codex"], activate: ({ activationId, sourceDigest, staged }) => passingHostProof({ activationId, sourceDigest, home, staged }) };
  try { assert.throws(() => installSuperOuter({ home, sourceRoot, promote: true, hostAdapter }), /Injected install failure/); }
  finally {
    if (prior === undefined) delete process.env.SUPER_OUTER_FAIL_STEP;
    else process.env.SUPER_OUTER_FAIL_STEP = prior;
  }
  assert.equal(fs.existsSync(path.join(home, ".super-outer/versions/6.6.0")), false);
  assert.equal(fs.existsSync(path.join(home, ".super-outer/staged/claude/super-outer")), false);
  assert.equal(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"), settingsText);
  const after = inventoryV3({ home });
  assert.deepEqual(after.installations.map((entry) => entry.sha256), before.installations.map((entry) => entry.sha256));
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/outer.md"), "utf8"), aliasText);
});

test("default install chooses a disposable home instead of the real user home", () => {
  const result = installSuperOuter({ sourceRoot: sourceFixture() });
  assert.notEqual(path.resolve(result.home), path.resolve(os.homedir()));
  assert.match(result.home, new RegExp(`^${fs.realpathSync(os.tmpdir()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("promotion without a verified host adapter fails before staging or v3 mutation", () => {
  const sourceRoot = sourceFixture();
  const { home, settingsText, aliasText } = homeWithV3();
  assert.throws(() => installSuperOuter({ home, sourceRoot, promote: true }), /verified Claude and Codex host adapter/);
  assert.equal(fs.existsSync(path.join(home, ".super-outer/versions/6.6.0")), false);
  assert.equal(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"), settingsText);
  assert.equal(fs.readFileSync(path.join(home, ".claude/commands/outer.md"), "utf8"), aliasText);
});

test("installer rejects managed paths that cross a symbolic link outside the explicit home", () => {
  const sourceRoot = sourceFixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-symlink-home-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-symlink-outside-"));
  fs.symlinkSync(outside, path.join(home, ".super-outer"), "dir");
  assert.throws(
    () => installSuperOuter({ home, sourceRoot }),
    /symbolic link/i,
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("installation verification rejects a managed subtree replaced by an outside symbolic link", () => {
  const sourceRoot = sourceFixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-verify-symlink-home-"));
  assert.equal(installSuperOuter({ home, sourceRoot }).source_staged, true);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-verify-symlink-outside-"));
  const versions = path.join(home, ".super-outer/versions");
  fs.renameSync(versions, path.join(outside, "versions"));
  fs.symlinkSync(path.join(outside, "versions"), versions, "dir");
  const verification = verifyInstallation({ home, sourceRoot });
  assert.equal(verification.valid, false);
  assert.ok(verification.failures.includes("unsafe-install-path"));
});

test("an ACTIVE interrupted transaction blocks a new baseline until rollback", () => {
  const sourceRoot = sourceFixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-active-transaction-"));
  const transactionDirectory = path.join(home, ".super-outer/transactions/interrupted");
  const partialTarget = path.join(home, ".super-outer/versions/6.6.0");
  fs.mkdirSync(path.join(transactionDirectory, "backups"), { recursive: true });
  fs.mkdirSync(partialTarget, { recursive: true });
  fs.writeFileSync(path.join(partialTarget, "partial.txt"), "interrupted\n");
  const record = {
    schemaVersion: 1,
    id: "interrupted",
    status: "ACTIVE",
    directory: transactionDirectory,
    targets: [{ relative: ".super-outer/versions/6.6.0", existed: false, backup: "0" }],
  };
  fs.writeFileSync(path.join(transactionDirectory, "record.json"), `${JSON.stringify(record)}\n`);
  fs.writeFileSync(path.join(home, ".super-outer/active-transaction.json"), `${JSON.stringify(record)}\n`);

  assert.throws(
    () => installSuperOuter({ home, sourceRoot }),
    /interrupted installation transaction is still ACTIVE/i,
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, ".super-outer/active-transaction.json"), "utf8")).id, "interrupted");
  assert.equal(fs.existsSync(path.join(partialTarget, "partial.txt")), true);
  assert.equal(rollbackInstallation({ home }).status, "ROLLED_BACK");
  assert.equal(fs.existsSync(partialTarget), false);
});

test("promotion rejects stale, failed, or source-unbound host evidence and rolls back staging", () => {
  const variants = [
    (proof) => ({ ...proof, status: "BLOCKED" }),
    (proof) => ({ ...proof, probe_freshness: false }),
    (proof) => ({ ...proof, source_digest: "0".repeat(64) }),
    (proof) => ({ ...proof, commands: proof.commands.map((command, index) => index === 2 ? { ...command, exit_code: 1 } : command) }),
  ];
  for (const alter of variants) {
    const sourceRoot = sourceFixture();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-invalid-host-proof-"));
    const hostAdapter = {
      transactionPaths: [".codex"],
      activate: ({ activationId, sourceDigest, staged }) => alter(passingHostProof({ activationId, sourceDigest, home, staged })),
    };
    assert.throws(
      () => installSuperOuter({ home, sourceRoot, promote: true, hostAdapter }),
      /Host activation BLOCKED/,
    );
    assert.equal(fs.existsSync(path.join(home, ".super-outer/install-manifest.json")), false);
    assert.equal(fs.existsSync(path.join(home, ".super-outer/versions/6.6.0")), false);
  }
});
