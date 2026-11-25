import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProductionHostAdapter } from "../scripts/host-adapter.mjs";
import { digestPackageTree } from "../scripts/build-package.mjs";

const staged = (home, host) => {
  const root = path.join(home, "staged", host);
  for (const manifest of [".claude-plugin", ".codex-plugin"]) {
    fs.mkdirSync(path.join(root, manifest), { recursive: true });
    fs.writeFileSync(path.join(root, manifest, "plugin.json"), `${JSON.stringify({ name: "super-outer", version: "6.6.0" })}\n`);
  }
  fs.mkdirSync(path.join(root, "hooks"), { recursive: true }); fs.writeFileSync(path.join(root, "hooks/hooks.json"), "{}\n");
  fs.mkdirSync(path.join(root, ".codex/agents"), { recursive: true });
  for (const role of ["benchmark-researcher", "design-prototyper", "experience-reviewer", "failure-scout", "independent-verifier"]) {
    fs.writeFileSync(path.join(root, ".codex/agents", `${role}.toml`), `name = "${role.replaceAll("-", "_")}"\n`);
  }
  return root;
};

const activation = (home, id) => {
  const sources = { claude: staged(home, "claude"), codex: staged(home, "codex") };
  const sourceDigest = digestPackageTree(sources.claude);
  assert.equal(digestPackageTree(sources.codex), sourceDigest);
  return { home, staged: sources, activationId: id, sourceDigest };
};

const writeCompletedProbe = (filename, env, event = "UserPromptSubmit", overrides = {}) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify({
    event,
    client: env.SUPER_OUTER_CLIENT,
    activation_id: env.SUPER_OUTER_ACTIVATION_ID,
    source_digest: env.SUPER_OUTER_SOURCE_DIGEST,
    version: env.SUPER_OUTER_VERSION,
    phase: "completed",
    ...overrides,
  })}\n`);
};

const listOutput = (home, executable, args) => {
  if (!args.includes("list")) return "ok\n";
  const source = executable.includes("claude")
    ? path.join(home, ".super-outer/host-marketplaces/claude/plugins/super-outer")
    : path.join(home, "plugins/super-outer");
  return `${JSON.stringify([{ name: "super-outer", version: "6.6.0", enabled: true, source }])}\n`;
};

test("production adapter records official command evidence and requires both discovery and host hook probes", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-adapter-"));
  fs.mkdirSync(path.join(home, ".codex/agents"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex/agents/custom-reviewer.toml"), "name = \"custom_reviewer\"\n");
  fs.mkdirSync(path.join(home, ".agents/plugins"), { recursive: true });
  fs.writeFileSync(path.join(home, ".agents/plugins/marketplace.json"), `${JSON.stringify({
    name: "personal", interface: { displayName: "Existing personal" }, plugins: [{ name: "keep-plugin", source: { source: "local", path: "./plugins/keep-plugin" }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }]
  })}\n`);
  const calls = [];
  const commandRunner = ({ executable, args, env }) => {
    calls.push({ executable, args });
    // The host probe starts a real session, so Jev is off for every command
    // and installing never sends a prompt (5.8.0).
    assert.equal(env.SUPER_OUTER_JEV, "off", `${executable} ${args.join(" ")}`);
    assert.equal(fs.existsSync(executable === "claude-fixture" ? env.CLAUDE_CONFIG_DIR : env.CODEX_HOME), true);
    if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
      writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env);
    }
    return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
  };
  const transactionDirectory = path.join(home, ".super-outer/transactions/test");
  const adapter = createProductionHostAdapter({ home, commandRunner, executables: { claude: "claude-fixture", codex: "codex-fixture" } });
  const proof = adapter.activate({ ...activation(home, "activation-test-one"), transactionDirectory });
  assert.equal(proof.status, "PASS");
  assert.equal(proof.activation_id, "activation-test-one");
  assert.equal(proof.source_digest, proof.staged_source_digests.claude);
  assert.equal(proof.probe_freshness, true);
  assert.equal(proof.claude_discovered, true);
  assert.equal(proof.codex_discovered, true);
  assert.equal(proof.hook_executed, true);
  assert.equal(proof.runtime_activation, "HOOK_COMPLETED");
  assert.equal(proof.model_response_completed, true);
  assert.deepEqual(proof.model_outcomes, { claude: "completed", codex: "completed" });
  assert.equal(proof.proof_limit, null);
  assert.equal(calls.length, 7);
  assert.deepEqual(calls[0].args.slice(0, 3), ["plugin", "marketplace", "add"]);
  assert.deepEqual(calls[1].args.slice(0, 2), ["plugin", "install"]);
  assert.deepEqual(calls[4].args.slice(0, 2), ["plugin", "add"]);
  assert.ok(calls[6].args.includes("--dangerously-bypass-hook-trust"));
  assert.ok(calls[6].args.includes("--ephemeral"));
  const codexMarketplace = JSON.parse(fs.readFileSync(path.join(home, ".agents/plugins/marketplace.json"), "utf8"));
  assert.equal(codexMarketplace.interface.displayName, "Existing personal");
  assert.deepEqual(codexMarketplace.plugins.map((plugin) => plugin.name), ["keep-plugin", "super-outer"]);
  assert.equal(fs.existsSync(path.join(home, "plugins/super-outer/.codex-plugin/plugin.json")), true);
  assert.deepEqual(
    fs.readdirSync(path.join(home, ".codex/agents")).sort(),
    ["benchmark-researcher.toml", "custom-reviewer.toml", "design-prototyper.toml", "experience-reviewer.toml", "failure-scout.toml", "independent-verifier.toml"],
  );
  assert.equal(proof.codex_agents.roles.length, 5);
  assert.equal(proof.discovery.claude.source_digest_verified, true);
  assert.equal(proof.discovery.codex.source_digest_verified, true);
  const persisted = JSON.parse(fs.readFileSync(path.join(transactionDirectory, "host-adapter-evidence.json"), "utf8"));
  assert.equal(persisted.commands.length, 7);
  assert.ok(persisted.commands.every((command) => !Object.hasOwn(command, "env")));
});

test("missing executable or partial hook proof returns BLOCKED without claiming activation", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-blocked-"));
  const missing = createProductionHostAdapter({
    home,
    commandRunner: () => ({ status: 1, stdout: "", stderr: "not found", error: "ENOENT" }),
    executables: { claude: "missing-claude", codex: "missing-codex" }
  }).activate(activation(home, "activation-missing-hosts"));
  assert.equal(missing.status, "BLOCKED");
  assert.equal(missing.hook_executed, false);
  assert.match(missing.blocked_reason, /exited 1/);
  assert.equal(missing.commands.length, 7);
  assert.ok(missing.commands.some((command) => command.id === "codex-probe"));

  const partialHome = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-partial-"));
  const partial = createProductionHostAdapter({
    home: partialHome,
    commandRunner: ({ executable, args, env }) => {
      if (env.SUPER_OUTER_HOOK_PROBE_FILE && env.SUPER_OUTER_CLIENT === "claude") {
        writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env, "Stop");
      }
      return { status: 0, stdout: listOutput(partialHome, executable, args), stderr: "" };
    }
  }).activate(activation(partialHome, "activation-partial-hosts"));
  assert.equal(partial.status, "BLOCKED");
  assert.equal(partial.claude_hook_executed, true);
  assert.equal(partial.codex_hook_executed, false);
  assert.match(partial.blocked_reason, /Both hosts did not execute/);
  assert.equal(partial.commands.length, 7);
});

test("each activation clears and nonce-binds probes so stale hook files cannot pass", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-stale-probe-"));
  const firstAdapter = createProductionHostAdapter({
    home,
    commandRunner: ({ executable, args, env }) => {
      if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
        writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env, "Stop");
      }
      return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
    },
  });
  assert.equal(firstAdapter.activate(activation(home, "activation-stale-first")).status, "PASS");

  const secondAdapter = createProductionHostAdapter({
    home,
    commandRunner: ({ executable, args }) => ({ status: 0, stdout: listOutput(home, executable, args), stderr: "" }),
  });
  const second = secondAdapter.activate(activation(home, "activation-stale-second"));
  assert.equal(second.status, "BLOCKED");
  assert.equal(second.claude_hook_executed, false);
  assert.equal(second.codex_hook_executed, false);
  assert.equal(second.probe_freshness, false);
});

test("host proof is blocked when either staged source differs from the activation digest", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-source-drift-"));
  const input = activation(home, "activation-source-drift");
  fs.writeFileSync(path.join(input.staged.codex, "drift.txt"), "different source\n");
  const proof = createProductionHostAdapter({
    home,
    commandRunner: ({ executable, args, env }) => {
      if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
        writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env, "Stop");
      }
      return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
    },
  }).activate(input);
  assert.equal(proof.status, "BLOCKED");
  assert.match(proof.blocked_reason, /do not match the current activation source/);
});

test("known missing-account responses limit model proof but do not erase completed hook activation", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-no-account-"));
  const proof = createProductionHostAdapter({
    home,
    commandRunner: ({ executable, args, env }) => {
      if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
        writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env);
        return env.SUPER_OUTER_CLIENT === "claude"
          ? { status: 1, stdout: "Not logged in · Please run /login", stderr: "" }
          : { status: 1, stdout: "", stderr: "401 Unauthorized: Missing bearer or basic authentication in header" };
      }
      return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
    }
  }).activate(activation(home, "activation-no-account"));
  assert.equal(proof.status, "PASS");
  assert.equal(proof.runtime_activation, "HOOK_COMPLETED");
  assert.equal(proof.model_response_completed, false);
  assert.deepEqual(proof.account_session, { claude: false, codex: false });
  assert.deepEqual(proof.model_outcomes, { claude: "account-unavailable", codex: "account-unavailable" });
  assert.match(proof.proof_limit, /no host account session/);
  assert.deepEqual(proof.commands.filter((entry) => entry.id.endsWith("-probe")).map((entry) => entry.outcome), ["account-unavailable", "account-unavailable"]);
});

test("a hook start record without a nonce-bound completion cannot prove runtime activation", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-start-only-"));
  const proof = createProductionHostAdapter({
    home,
    commandRunner: ({ executable, args, env }) => {
      if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
        fs.mkdirSync(path.dirname(env.SUPER_OUTER_HOOK_PROBE_FILE), { recursive: true });
        fs.writeFileSync(env.SUPER_OUTER_HOOK_PROBE_FILE, `${JSON.stringify({
          event: "UserPromptSubmit",
          client: env.SUPER_OUTER_CLIENT,
          activation_id: env.SUPER_OUTER_ACTIVATION_ID,
          source_digest: env.SUPER_OUTER_SOURCE_DIGEST,
          version: env.SUPER_OUTER_VERSION,
          phase: "started"
        })}\n`);
      }
      return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
    }
  }).activate(activation(home, "activation-start-only"));
  assert.equal(proof.status, "BLOCKED");
  assert.equal(proof.runtime_activation, "INCOMPLETE");
  assert.equal(proof.hook_executed, false);
});

test("discovery rejects disabled, stale-version, and source-mismatched plugin listings", () => {
  const variants = [
    { name: "super-outer", version: "6.6.0", enabled: false },
    { name: "super-outer", version: "3.0.0", enabled: true },
    { name: "super-outer", version: "6.6.0", enabled: true, source: "/tmp/not-the-installed-source" },
  ];
  for (const listed of variants) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-bad-discovery-"));
    const proof = createProductionHostAdapter({
      home,
      commandRunner: ({ args, env }) => {
        if (env.SUPER_OUTER_HOOK_PROBE_FILE) writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env);
        return { status: 0, stdout: args.includes("list") ? JSON.stringify([listed]) : "ok", stderr: "" };
      },
    }).activate(activation(home, `activation-bad-discovery-${variants.indexOf(listed)}`));
    assert.equal(proof.status, "BLOCKED");
    assert.equal(proof.claude_discovered, false);
    assert.equal(proof.codex_discovered, false);
  }
});

test("plain-text host discovery recognises the current 6.6.0 version", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-text-discovery-"));
  const proof = createProductionHostAdapter({
    home,
    commandRunner: ({ args, env }) => {
      if (env.SUPER_OUTER_HOOK_PROBE_FILE) writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env);
      return { status: 0, stdout: args.includes("list") ? "super-outer 6.6.0 enabled\n" : "ok\n", stderr: "" };
    },
  }).activate(activation(home, "activation-text-discovery"));
  assert.equal(proof.status, "PASS");
  assert.equal(proof.claude_discovered, true);
  assert.equal(proof.codex_discovered, true);
});

test("a completed probe must bind the activation, source digest, and plugin version", () => {
  for (const override of [
    { source_digest: "0".repeat(64) },
    { version: "3.0.0" },
    { phase: "started" },
  ]) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-bad-probe-"));
    const proof = createProductionHostAdapter({
      home,
      commandRunner: ({ executable, args, env }) => {
        if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
          writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env, "UserPromptSubmit", override);
        }
        return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
      },
    }).activate(activation(home, `activation-bad-probe-${Object.keys(override)[0]}`));
    assert.equal(proof.status, "BLOCKED");
    assert.equal(proof.hook_executed, false);
  }
});

test("probe outcomes distinguish transport, provider, executable, and spoofed account failures", () => {
  const cases = [
    ["transport-unavailable", { status: 1, stdout: "", stderr: "ETIMEDOUT while connecting" }],
    ["transport-unavailable", { status: 1, stdout: "", stderr: "failed to lookup address information: nodename nor servname provided, or not known" }],
    ["provider-failure", { status: 1, stdout: "", stderr: "503 provider temporarily unavailable" }],
    ["executable-failure", { status: null, stdout: "", stderr: "", error: "spawn ENOENT", errorCode: "ENOENT" }],
    ["executable-failure", { status: 1, stdout: "Not logged in · Please run /login extra text", stderr: "" }],
  ];
  for (const [expectedOutcome, failure] of cases) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-outcome-"));
    const proof = createProductionHostAdapter({
      home,
      commandRunner: ({ executable, args, env }) => {
        if (env.SUPER_OUTER_HOOK_PROBE_FILE) {
          writeCompletedProbe(env.SUPER_OUTER_HOOK_PROBE_FILE, env);
          return failure;
        }
        return { status: 0, stdout: listOutput(home, executable, args), stderr: "" };
      },
    }).activate(activation(home, `activation-outcome-${expectedOutcome}-${cases.indexOf(cases.find((entry) => entry[1] === failure))}`));
    assert.equal(proof.status, "BLOCKED");
    assert.deepEqual(proof.commands.filter((entry) => entry.id.endsWith("-probe")).map((entry) => entry.outcome), [expectedOutcome, expectedOutcome]);
  }
});

test("native Codex roles never overwrite an unmanaged same-name role", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-host-role-conflict-"));
  const conflict = path.join(home, ".codex/agents/failure-scout.toml");
  fs.mkdirSync(path.dirname(conflict), { recursive: true });
  fs.writeFileSync(conflict, "name = \"my_failure_scout\"\n");
  const adapter = createProductionHostAdapter({
    home,
    commandRunner: () => ({ status: 0, stdout: "", stderr: "" }),
  });
  assert.throws(
    () => adapter.activate(activation(home, "activation-role-conflict")),
    /Refusing to overwrite an unmanaged Codex reviewer role/,
  );
  assert.equal(fs.readFileSync(conflict, "utf8"), "name = \"my_failure_scout\"\n");
});
