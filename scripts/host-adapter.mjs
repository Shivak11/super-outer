#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { digestPackageTree } from "./build-package.mjs";

const CLAUDE_MARKETPLACE = "super-outer";
const CODEX_MARKETPLACE = "personal";
const SUPER_OUTER_VERSION = "6.6.0";
const CODEX_AGENT_FILES = Object.freeze([
  "benchmark-researcher.toml",
  "design-prototyper.toml",
  "experience-reviewer.toml",
  "failure-scout.toml",
  "independent-verifier.toml",
]);
const sha256 = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
const sha256File = (filename) => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

const defaultRunner = ({ executable, args, cwd, env }) => {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
    errorCode: result.error?.code || null,
  };
};

const copyTree = (source, destination) => {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Host marketplace refuses symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    for (const entry of fs.readdirSync(source).sort()) copyTree(path.join(source, entry), path.join(destination, entry));
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  }
};

const removeTree = (target) => {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(target)) removeTree(path.join(target, entry));
    fs.rmdirSync(target);
  } else fs.unlinkSync(target);
};

const atomicJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
};

const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const commandEvidence = ({ executable, args }, result) => ({
  executable,
  args,
  exit_code: Number(result.status ?? 1),
  stdout_sha256: sha256(result.stdout || ""),
  stderr_sha256: sha256(result.stderr || result.error || ""),
  error: result.error ? String(result.error).slice(0, 240) : null,
  error_code: result.errorCode ? String(result.errorCode).slice(0, 80) : null,
});

const pluginIdentity = (record) =>
  String(record?.name ?? record?.id ?? record?.plugin ?? record?.slug ?? "")
    .toLowerCase()
    .split("@")[0] === "super-outer";

const collectPluginRecords = (value, records = []) => {
  if (Array.isArray(value)) {
    for (const entry of value) collectPluginRecords(entry, records);
  } else if (value && typeof value === "object") {
    if (pluginIdentity(value)) records.push(value);
    for (const nested of Object.values(value)) collectPluginRecords(nested, records);
  }
  return records;
};

const sourcePathFromRecord = (record) => {
  for (const candidate of [
    record?.installPath,
    record?.install_path,
    record?.path,
    typeof record?.source === "string" ? record.source : record?.source?.path,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
};

const sourceMatches = (candidate, { home, expectedSourceDigest }) => {
  if (!candidate) return null;
  try {
    const absolute = path.isAbsolute(candidate)
      ? path.resolve(candidate)
      : path.resolve(home, candidate);
    if (!fs.existsSync(absolute)) return false;
    const canonical = fs.realpathSync(absolute);
    if (!inside(home, canonical)) return false;
    return digestPackageTree(canonical) === expectedSourceDigest;
  } catch {
    return false;
  }
};

const inspectDiscovery = (output, options) => {
  try {
    const records = collectPluginRecords(JSON.parse(output));
    for (const record of records) {
      const enabled = record.enabled === true || /^(?:enabled|active)$/i.test(String(record.status ?? record.state ?? ""));
      const version = String(record.version ?? record.manifest?.version ?? "");
      const reportedSource = sourcePathFromRecord(record);
      const sourceVerified = sourceMatches(reportedSource, options);
      if (enabled && version === SUPER_OUTER_VERSION && sourceVerified !== false) {
        return {
          discovered: true,
          enabled: true,
          version,
          source_reported: Boolean(reportedSource),
          source_digest_verified: sourceVerified === true,
        };
      }
    }
    return { discovered: false, enabled: false, version: null, source_reported: false, source_digest_verified: false };
  } catch {
    const line = String(output).split(/\r?\n/).find((candidate) =>
      /(?:^|\s)super-outer(?:@\S+)?(?:\s|$)/i.test(candidate),
    );
    const escapedVersion = SUPER_OUTER_VERSION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const discovered = Boolean(
      line && new RegExp(`(?:^|\\s)${escapedVersion}(?:\\s|$)`).test(line)
      && /(?:^|\s)(?:enabled|active)(?:\s|$)/i.test(line),
    );
    return {
      discovered,
      enabled: discovered,
      version: discovered ? SUPER_OUTER_VERSION : null,
      source_reported: false,
      source_digest_verified: false,
    };
  }
};

const probeObserved = (filename, client, activationId, sourceDigest, version, startedAt) => {
  if (!fs.existsSync(filename)) return false;
  if (fs.statSync(filename).mtimeMs < startedAt - 1_000) return false;
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).some((line) => {
    try {
      const value = JSON.parse(line);
      return value.client === client && value.activation_id === activationId &&
        value.source_digest === sourceDigest && value.version === version &&
        value.event !== "unknown" && value.phase === "completed";
    }
    catch { return false; }
  });
};

const commandOutcome = (commandId, result) => {
  if (Number(result.status) === 0 && !result.error) return "completed";
  if (result.error || result.errorCode || result.status === null) return "executable-failure";
  const message = `${result.stdout || ""}\n${result.stderr || ""}`
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim();
  if (
    commandId === "claude-probe" &&
    /^Not logged in(?:\s*[·-]\s*Please run \/login)?\.?$/i.test(message)
  ) return "account-unavailable";
  if (
    commandId === "codex-probe" &&
    /^401 Unauthorized:\s*Missing bearer or basic authentication in header\.?$/i.test(message)
  ) return "account-unavailable";
  if (/\b(?:ENETUNREACH|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|DNS lookup failed|failed to lookup address information|network is unreachable|could not connect|connection timed out)\b/i.test(message)) {
    return "transport-unavailable";
  }
  if (/\b(?:HTTP\s*)?(?:429|5\d\d)\b|\brate limit(?:ed)?\b|\bprovider (?:error|failure|unavailable)\b|\bmodel (?:error|unavailable)\b/i.test(message)) {
    return "provider-failure";
  }
  return "executable-failure";
};

const installCodexAgents = ({ stagedRoot, codexConfig, isolatedHome }) => {
  const sourceDirectory = path.join(stagedRoot, ".codex", "agents");
  const destinationDirectory = path.join(codexConfig, "agents");
  const indexFile = path.join(codexConfig, "super-outer-agent-roles.json");
  let previous = { roles: [] };
  if (fs.existsSync(indexFile)) {
    previous = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    if (!Array.isArray(previous.roles)) throw new Error("Existing Super-outer Codex role index is invalid");
  }
  const previousHashes = new Map(previous.roles.map((role) => [role.file, role.sha256]));
  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const roles = [];
  for (const file of CODEX_AGENT_FILES) {
    const source = path.join(sourceDirectory, file);
    if (!fs.existsSync(source) || !fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) {
      throw new Error(`Staged Codex reviewer role is missing or unsafe: ${file}`);
    }
    const expected = sha256File(source);
    const destination = path.join(destinationDirectory, file);
    if (fs.existsSync(destination)) {
      const stat = fs.lstatSync(destination);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Codex reviewer role target is unsafe: ${file}`);
      const current = sha256File(destination);
      if (current !== expected && previousHashes.get(file) !== current) {
        throw new Error(`Refusing to overwrite an unmanaged Codex reviewer role: ${file}`);
      }
    }
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.copyFileSync(source, temporary);
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, destination);
    roles.push({ file, sha256: expected });
  }
  atomicJson(indexFile, { schema_version: "1.0.0", plugin: "super-outer", version: SUPER_OUTER_VERSION, roles });
  return {
    config_root: path.relative(isolatedHome, codexConfig),
    index_sha256: sha256File(indexFile),
    roles,
  };
};

export const createProductionHostAdapter = ({
  home,
  claudeConfigRoot,
  codexConfigRoot,
  commandRunner = defaultRunner,
  executables = { claude: "claude", codex: "codex" }
} = {}) => {
  if (!home) throw new Error("Production host adapter requires an explicit isolated home");
  const requestedHome = path.resolve(home);
  const isolatedHome = fs.realpathSync(requestedHome);
  if (isolatedHome === path.resolve(os.homedir())) throw new Error("Production host adapter refuses the real user home");
  const canonicalConfigPath = (configured, fallback) => {
    if (!configured) return path.join(isolatedHome, fallback);
    const requested = path.resolve(configured);
    return inside(requestedHome, requested)
      ? path.resolve(isolatedHome, path.relative(requestedHome, requested))
      : requested;
  };
  const claudeConfig = canonicalConfigPath(claudeConfigRoot, ".claude");
  const codexConfig = canonicalConfigPath(codexConfigRoot, ".codex");
  if (!inside(isolatedHome, claudeConfig) || !inside(isolatedHome, codexConfig)) {
    throw new Error("Host config roots must remain inside the explicit isolated home");
  }
  return {
    transactionPaths: [claudeConfig, codexConfig].map((target) => path.relative(isolatedHome, target)),
    activate({ home: activationHome, staged, transactionDirectory, activationId, sourceDigest } = {}) {
      const canonicalActivationHome = activationHome && fs.existsSync(path.resolve(activationHome))
        ? fs.realpathSync(path.resolve(activationHome))
        : path.resolve(activationHome || "");
      if (canonicalActivationHome !== isolatedHome) throw new Error("Host adapter home does not match the staged transaction");
      if (!staged?.claude || !staged?.codex) throw new Error("Host adapter requires staged Claude and Codex plugin sources");
      const currentActivation = String(activationId || crypto.randomBytes(12).toString("hex"));
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/.test(currentActivation)) throw new Error("Host activation id is invalid");
      const activationStartedAt = Date.now();
      const stagedDigests = {
        claude: digestPackageTree(staged.claude),
        codex: digestPackageTree(staged.codex),
      };
      const expectedSourceDigest = String(sourceDigest || stagedDigests.claude);
      if (!/^[a-f0-9]{64}$/.test(expectedSourceDigest)) throw new Error("Host activation requires a valid staged source digest");
      const marketRoot = path.join(isolatedHome, ".super-outer", "host-marketplaces");
      const claudeMarket = path.join(marketRoot, "claude");
      removeTree(marketRoot);
      copyTree(staged.claude, path.join(claudeMarket, "plugins", "super-outer"));
      const codexSource = path.join(isolatedHome, "plugins", "super-outer");
      removeTree(codexSource);
      copyTree(staged.codex, codexSource);
      atomicJson(path.join(claudeMarket, ".claude-plugin", "marketplace.json"), {
        name: CLAUDE_MARKETPLACE,
        owner: { name: "Dr. Shiva Kakkar" },
        plugins: [{ name: "super-outer", version: SUPER_OUTER_VERSION, source: "./plugins/super-outer", description: "Balanced adaptive engineering review" }]
      });
      const codexMarketplaceFile = path.join(isolatedHome, ".agents", "plugins", "marketplace.json");
      let codexMarketplace = {
        name: CODEX_MARKETPLACE,
        interface: { displayName: "Personal" },
        plugins: []
      };
      if (fs.existsSync(codexMarketplaceFile)) {
        codexMarketplace = JSON.parse(fs.readFileSync(codexMarketplaceFile, "utf8"));
        if (codexMarketplace.name !== CODEX_MARKETPLACE || !Array.isArray(codexMarketplace.plugins)) {
          throw new Error("Existing Codex personal marketplace has an incompatible shape");
        }
      }
      codexMarketplace.plugins = codexMarketplace.plugins.filter((plugin) => plugin?.name !== "super-outer");
      codexMarketplace.plugins.push({
          name: "super-outer",
          source: { source: "local", path: "./plugins/super-outer" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Developer Tools"
      });
      atomicJson(codexMarketplaceFile, codexMarketplace);
      const codexAgents = installCodexAgents({
        stagedRoot: staged.codex,
        codexConfig,
        isolatedHome,
      });

      const probeRoot = path.join(isolatedHome, ".super-outer", "host-probes");
      removeTree(probeRoot);
      const activationProbeRoot = path.join(probeRoot, currentActivation);
      fs.mkdirSync(activationProbeRoot, { recursive: true, mode: 0o700 });
      const claudeProbe = path.join(activationProbeRoot, "claude.jsonl");
      const codexProbe = path.join(activationProbeRoot, "codex.jsonl");
      fs.mkdirSync(claudeConfig, { recursive: true, mode: 0o700 });
      fs.mkdirSync(codexConfig, { recursive: true, mode: 0o700 });
      // The probe proves that each host runs the hook. It must not send its
      // prompt to OpenRouter, so Jev is switched off for it whatever key the
      // person installing has in their environment.
      const commonEnv = {
        ...process.env,
        HOME: isolatedHome,
        SUPER_OUTER_ACTIVATION_ID: currentActivation,
        SUPER_OUTER_SOURCE_DIGEST: expectedSourceDigest,
        SUPER_OUTER_VERSION,
        SUPER_OUTER_JEV: "off",
      };
      const codexEnv = { ...commonEnv, CODEX_HOME: codexConfig };
      const commands = [
        { id: "claude-marketplace", executable: executables.claude, args: ["plugin", "marketplace", "add", claudeMarket, "--scope", "user"], env: { ...commonEnv, CLAUDE_CONFIG_DIR: claudeConfig } },
        { id: "claude-install", executable: executables.claude, args: ["plugin", "install", `super-outer@${CLAUDE_MARKETPLACE}`, "--scope", "user"], env: { ...commonEnv, CLAUDE_CONFIG_DIR: claudeConfig } },
        { id: "claude-list", executable: executables.claude, args: ["plugin", "list", "--json"], env: { ...commonEnv, CLAUDE_CONFIG_DIR: claudeConfig } },
        { id: "claude-probe", executable: executables.claude, args: ["-p", "Return exactly SUPER_OUTER_PROBE.", "--output-format", "text"], env: { ...commonEnv, CLAUDE_CONFIG_DIR: claudeConfig, SUPER_OUTER_HOOK_PROBE_FILE: claudeProbe, SUPER_OUTER_CLIENT: "claude", SUPER_OUTER_SESSION_ID: `host-probe-claude-${currentActivation}` } },
        { id: "codex-install", executable: executables.codex, args: ["plugin", "add", `super-outer@${CODEX_MARKETPLACE}`], env: codexEnv },
        { id: "codex-list", executable: executables.codex, args: ["plugin", "list"], env: codexEnv },
        { id: "codex-probe", executable: executables.codex, args: ["exec", "--dangerously-bypass-hook-trust", "--skip-git-repo-check", "--ephemeral", "Return exactly SUPER_OUTER_PROBE."], env: { ...codexEnv, SUPER_OUTER_HOOK_PROBE_FILE: codexProbe, SUPER_OUTER_CLIENT: "codex", SUPER_OUTER_SESSION_ID: `host-probe-codex-${currentActivation}` } }
      ];
      const evidence = [];
      const outputs = new Map();
      const blockedReasons = [];
      if (stagedDigests.claude !== expectedSourceDigest || stagedDigests.codex !== expectedSourceDigest) {
        blockedReasons.push("Staged Claude and Codex sources do not match the current activation source");
      }
      for (const command of commands) {
        const result = commandRunner({ executable: command.executable, args: command.args, cwd: isolatedHome, env: command.env });
        const exitCode = Number(result.status ?? 1);
        const outcome = commandOutcome(command.id, result);
        evidence.push({ id: command.id, ...commandEvidence(command, result), outcome });
        outputs.set(command.id, result.stdout || "");
        if (exitCode !== 0 && outcome !== "account-unavailable") blockedReasons.push(`${command.id} exited ${exitCode}`);
      }
      const claudeDiscovery = inspectDiscovery(outputs.get("claude-list") || "", {
        home: isolatedHome,
        expectedSourceDigest,
      });
      const codexDiscovery = inspectDiscovery(outputs.get("codex-list") || "", {
        home: isolatedHome,
        expectedSourceDigest,
      });
      const claudeDiscovered = claudeDiscovery.discovered;
      const codexDiscovered = codexDiscovery.discovered;
      const claudeHook = probeObserved(
        claudeProbe,
        "claude",
        currentActivation,
        expectedSourceDigest,
        SUPER_OUTER_VERSION,
        activationStartedAt,
      );
      const codexHook = probeObserved(
        codexProbe,
        "codex",
        currentActivation,
        expectedSourceDigest,
        SUPER_OUTER_VERSION,
        activationStartedAt,
      );
      const claudeProbeOutcome = evidence.find((entry) => entry.id === "claude-probe")?.outcome;
      const codexProbeOutcome = evidence.find((entry) => entry.id === "codex-probe")?.outcome;
      const modelResponseCompleted = claudeProbeOutcome === "completed" && codexProbeOutcome === "completed";
      const accountLimited = [claudeProbeOutcome, codexProbeOutcome].every((outcome) =>
        outcome === "completed" || outcome === "account-unavailable",
      );
      if (!claudeDiscovered) blockedReasons.push("Claude did not list super-outer after installation");
      if (!codexDiscovered) blockedReasons.push("Codex did not list super-outer after installation");
      if (!claudeHook || !codexHook) blockedReasons.push("Both hosts did not execute the Super-outer hook probe");
      const blockedReason = blockedReasons.join("; ");
      const proof = {
        schema_version: "1.0.0",
        status: blockedReason ? "BLOCKED" : "PASS",
        activation_id: currentActivation,
        activation_started_at: new Date(activationStartedAt).toISOString(),
        completed_at: new Date().toISOString(),
        source_digest: expectedSourceDigest,
        staged_source_digests: stagedDigests,
        claude_discovered: claudeDiscovered,
        codex_discovered: codexDiscovered,
        discovery: { claude: claudeDiscovery, codex: codexDiscovery },
        claude_hook_executed: claudeHook,
        codex_hook_executed: codexHook,
        hook_executed: claudeHook && codexHook,
        probe_freshness: claudeHook && codexHook,
        probe_binding: {
          activation_id: currentActivation,
          source_digest: expectedSourceDigest,
          version: SUPER_OUTER_VERSION,
          phase: claudeHook && codexHook ? "completed" : "incomplete",
        },
        runtime_activation: claudeHook && codexHook ? "HOOK_COMPLETED" : "INCOMPLETE",
        model_response_completed: modelResponseCompleted,
        model_outcomes: {
          claude: claudeProbeOutcome,
          codex: codexProbeOutcome,
        },
        account_session: {
          claude: claudeProbeOutcome === "completed",
          codex: codexProbeOutcome === "completed"
        },
        proof_limit: modelResponseCompleted
          ? null
          : accountLimited
            ? "At least one isolated host has no host account session, so every model response was not tested."
            : "At least one host probe failed before a model response completed.",
        blocked_reason: blockedReason || null,
        commands: evidence,
        codex_agents: codexAgents,
        config_roots: { claude_sha256: sha256(claudeConfig), codex_sha256: sha256(codexConfig) }
      };
      const evidenceFile = path.join(transactionDirectory || path.join(isolatedHome, ".super-outer"), "host-adapter-evidence.json");
      atomicJson(evidenceFile, proof);
      return proof;
    }
  };
};
