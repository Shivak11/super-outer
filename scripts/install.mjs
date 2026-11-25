#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deactivateLegacyOuter,
  inventoryOuter21,
  inventoryV3,
  snapshotOuter21,
  snapshotV3,
  V3_GUIDANCE_PATHS,
  V3_SETTINGS_PATHS
} from "./migrate-v3.mjs";
import { rollbackInstallation } from "./rollback.mjs";
import { digestPackageTree, listPackageFiles } from "./build-package.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SOURCE_ROOT = path.dirname(SCRIPT_DIR);
export const SUPER_OUTER_VERSION = "6.6.0";
const OUTER_ALIAS_RELATIVE = ".claude/commands/outer.md";
const HOST_COMMAND_IDS = new Set([
  "claude-marketplace",
  "claude-install",
  "claude-list",
  "claude-probe",
  "codex-install",
  "codex-list",
  "codex-probe",
]);
const CODEX_AGENT_FILES = Object.freeze([
  "benchmark-researcher.toml",
  "design-prototyper.toml",
  "experience-reviewer.toml",
  "failure-scout.toml",
  "independent-verifier.toml",
]);

const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const assertManagedTarget = (home, relative, label = "Install target") => {
  const value = String(relative ?? "");
  if (!value || value === "." || path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} must be a relative path inside the explicit home: ${value || "<empty>"}`);
  }
  const target = path.resolve(home, value);
  if (!inside(home, target)) throw new Error(`${label} escapes the explicit home: ${value}`);
  let current = home;
  for (const segment of path.relative(home, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} crosses a symbolic link: ${path.relative(home, current)}`);
    }
  }
  return target;
};

const removePath = (target) => {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(target)) removePath(path.join(target, entry));
    fs.rmdirSync(target);
  } else fs.unlinkSync(target);
};

const copyPath = (source, destination, { filter = () => true } = {}) => {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to install symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    for (const entry of fs.readdirSync(source).sort()) {
      if (filter(entry, source)) copyPath(path.join(source, entry), path.join(destination, entry), { filter });
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  }
};

const atomicJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, 0o600);
};

const safeHome = (home, { promote = false } = {}) => {
  const selected = home ? path.resolve(home) : fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-home-"));
  fs.mkdirSync(selected, { recursive: true });
  if (fs.lstatSync(selected).isSymbolicLink()) throw new Error("Explicit install home cannot be a symbolic link");
  const canonical = fs.realpathSync(selected);
  const actual = fs.realpathSync(os.homedir());
  if (canonical === actual && (!promote || process.env.SUPER_OUTER_ALLOW_USER_HOME !== "1")) {
    throw new Error(
      "This command stages a copy for verification and does not switch Super-outer on. " +
      "Run `npm run setup` to install it for Claude Code and Codex. " +
      "Staged user-home promotion additionally requires --promote and SUPER_OUTER_ALLOW_USER_HOME=1.",
    );
  }
  return canonical;
};

const assertNoInterruptedTransaction = (home) => {
  const filename = assertManagedTarget(home, ".super-outer/active-transaction.json", "Active transaction record");
  if (!fs.existsSync(filename)) return;
  let record;
  try { record = JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) { throw new Error(`Cannot inspect the existing installation transaction: ${error.message}`); }
  if (record?.status === "ACTIVE") {
    throw new Error(`An interrupted installation transaction is still ACTIVE (${record.id || "unknown"}); roll it back before installing again`);
  }
};

const sha256File = (filename) => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

const validateCodexAgentProof = (proof, { home, sourceRoot }) => {
  const failures = [];
  const roleProof = proof?.codex_agents;
  if (!roleProof || typeof roleProof.config_root !== "string" || !Array.isArray(roleProof.roles)) {
    return ["codex-agent-proof-missing"];
  }
  if (
    roleProof.roles.length !== CODEX_AGENT_FILES.length ||
    new Set(roleProof.roles.map((role) => role?.file)).size !== CODEX_AGENT_FILES.length
  ) failures.push("codex-agent-proof-incomplete");
  let configRoot;
  try {
    configRoot = assertManagedTarget(home, roleProof.config_root, "Codex config root");
  } catch {
    return [...failures, "codex-agent-config-unsafe"];
  }
  const indexFile = path.join(configRoot, "super-outer-agent-roles.json");
  if (!/^[a-f0-9]{64}$/.test(roleProof.index_sha256 ?? "") ||
      !fs.existsSync(indexFile) || sha256File(indexFile) !== roleProof.index_sha256) {
    failures.push("codex-agent-index-invalid");
  }
  for (const file of CODEX_AGENT_FILES) {
    const evidence = roleProof.roles.find((role) => role?.file === file);
    const source = path.join(sourceRoot, ".codex", "agents", file);
    const installed = path.join(configRoot, "agents", file);
    if (!evidence || !/^[a-f0-9]{64}$/.test(evidence.sha256 ?? "")) {
      failures.push(`codex-agent-proof-invalid:${file}`);
      continue;
    }
    if (!fs.existsSync(source) || !fs.existsSync(installed)) {
      failures.push(`codex-agent-missing:${file}`);
      continue;
    }
    const expected = sha256File(source);
    if (evidence.sha256 !== expected || sha256File(installed) !== expected) {
      failures.push(`codex-agent-digest-mismatch:${file}`);
    }
  }
  return failures;
};

const validateHostProof = (proof, { activationId, sourceDigest, home, sourceRoot }) => {
  const failures = [];
  if (proof?.status !== "PASS") failures.push("host-proof-status-not-pass");
  if (!proof?.claude_discovered || !proof?.codex_discovered) failures.push("host-discovery-incomplete");
  if (!proof?.claude_hook_executed || !proof?.codex_hook_executed || !proof?.hook_executed) failures.push("host-hook-proof-incomplete");
  if (proof?.probe_freshness !== true) failures.push("host-hook-proof-not-fresh");
  if (proof?.activation_id !== activationId) failures.push("host-proof-activation-mismatch");
  if (proof?.source_digest !== sourceDigest || proof?.staged_source_digests?.claude !== sourceDigest || proof?.staged_source_digests?.codex !== sourceDigest) {
    failures.push("host-proof-source-mismatch");
  }
  for (const host of ["claude", "codex"]) {
    const discovery = proof?.discovery?.[host];
    if (!discovery?.discovered || !discovery?.enabled || discovery?.version !== SUPER_OUTER_VERSION) {
      failures.push(`${host}-discovery-version-or-state-unproved`);
    }
    if (discovery?.source_reported && discovery?.source_digest_verified !== true) {
      failures.push(`${host}-discovery-source-mismatch`);
    }
  }
  if (
    proof?.probe_binding?.activation_id !== activationId ||
    proof?.probe_binding?.source_digest !== sourceDigest ||
    proof?.probe_binding?.version !== SUPER_OUTER_VERSION ||
    proof?.probe_binding?.phase !== "completed"
  ) failures.push("host-probe-binding-incomplete");
  const commands = Array.isArray(proof?.commands) ? proof.commands : [];
  const commandIds = new Set(commands.map((command) => command?.id));
  if (commands.length !== HOST_COMMAND_IDS.size || commandIds.size !== HOST_COMMAND_IDS.size ||
      [...HOST_COMMAND_IDS].some((id) => !commandIds.has(id))) failures.push("host-command-evidence-incomplete");
  if (commands.some((command) => {
    if (["claude-probe", "codex-probe"].includes(command?.id)) {
      return !["completed", "account-unavailable"].includes(command?.outcome) ||
        (command?.outcome === "completed" && command?.exit_code !== 0) ||
        (command?.outcome === "account-unavailable" && command?.exit_code === 0);
    }
    return command?.outcome !== "completed" || command?.exit_code !== 0;
  })) failures.push("host-command-failed");
  const modelOutcomes = proof?.model_outcomes;
  if (!modelOutcomes || !["completed", "account-unavailable"].includes(modelOutcomes.claude) ||
      !["completed", "account-unavailable"].includes(modelOutcomes.codex)) {
    failures.push("host-model-outcome-blocked");
  } else {
    for (const host of ["claude", "codex"]) {
      if (commands.find((command) => command?.id === `${host}-probe`)?.outcome !== modelOutcomes[host]) {
        failures.push("host-model-outcome-inconsistent");
      }
      if (proof?.account_session?.[host] !== (modelOutcomes[host] === "completed")) {
        failures.push("host-account-session-inconsistent");
      }
    }
    const responsesCompleted = modelOutcomes.claude === "completed" && modelOutcomes.codex === "completed";
    if (proof?.model_response_completed !== responsesCompleted) failures.push("host-model-completion-inconsistent");
  }
  if (proof?.runtime_activation !== "HOOK_COMPLETED") failures.push("host-runtime-activation-incomplete");
  failures.push(...validateCodexAgentProof(proof, { home, sourceRoot }));
  return [...new Set(failures)];
};

const validateSource = (root) => {
  const required = [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "hooks/hooks.json",
    ...CODEX_AGENT_FILES.map((file) => `.codex/agents/${file}`),
  ];
  const missing = required.filter((relative) => !fs.existsSync(path.join(root, relative)));
  if (missing.length) throw new Error(`Install source is incomplete: ${missing.join(", ")}`);
  for (const relative of required.slice(0, 2)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    if (manifest.name !== "super-outer") throw new Error(`${relative} must describe super-outer`);
  }
};

const transactionTargets = ({ promote, outer21Inventory, v3Inventory, hostAdapter }) => {
  const targets = [
    `.super-outer/versions/${SUPER_OUTER_VERSION}`,
    ".super-outer/staged/claude/super-outer",
    ".super-outer/staged/codex/super-outer",
    ".super-outer/host-discovery-proof.json",
    ".super-outer/active-enforcement.json",
    ".super-outer/install-manifest.json",
    ".super-outer/migration-record.json"
  ];
  if (promote && v3Inventory.detected) {
    for (const relative of V3_SETTINGS_PATHS) if (v3Inventory.settings.some((entry) => entry.relative === relative)) targets.push(relative);
    for (const relative of V3_GUIDANCE_PATHS) if (v3Inventory.guidance.some((entry) => entry.relative === relative)) targets.push(relative);
    for (const entry of v3Inventory.installations) targets.push(entry.relative);
  }
  if (promote && outer21Inventory.detected) {
    for (const entry of outer21Inventory.installations) targets.push(entry.relative);
  }
  if (promote) targets.push(OUTER_ALIAS_RELATIVE);
  if (promote) targets.push(
    ".super-outer/host-marketplaces",
    ".super-outer/host-probes",
    ".agents/plugins/marketplace.json",
    "plugins/super-outer"
  );
  if (promote && Array.isArray(hostAdapter?.transactionPaths)) targets.push(...hostAdapter.transactionPaths);
  return [...new Set(targets)];
};

const prepareTransaction = ({ home, targets, id }) => {
  const directory = assertManagedTarget(home, path.join(".super-outer", "transactions", id), "Transaction directory");
  fs.mkdirSync(path.join(directory, "backups"), { recursive: true, mode: 0o700 });
  const recordedTargets = targets.map((relative, index) => {
    const target = assertManagedTarget(home, relative);
    const existed = fs.existsSync(target);
    const backup = String(index);
    if (existed) copyPath(target, path.join(directory, "backups", backup));
    return { relative, existed, backup };
  });
  const record = { schemaVersion: 1, id, status: "ACTIVE", directory, targets: recordedTargets };
  atomicJson(path.join(directory, "record.json"), record);
  atomicJson(path.join(home, ".super-outer", "active-transaction.json"), record);
  return record;
};

const stageTree = (sourceRoot, destination) => {
  removePath(destination);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of listPackageFiles(sourceRoot)) {
    const target = path.join(destination, ...file.relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.absolute, target);
    fs.chmodSync(target, file.stat.mode & 0o777);
  }
};

const replaceWithStage = (stage, target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  removePath(target);
  fs.renameSync(stage, target);
};

const maybeFail = (step) => {
  if (process.env.SUPER_OUTER_FAIL_STEP === step) throw new Error(`Injected install failure at ${step}`);
};

export const verifyInstallation = ({ home, sourceRoot = DEFAULT_SOURCE_ROOT } = {}) => {
  if (!home) throw new Error("verify requires an explicit home");
  const selectedHome = path.resolve(home);
  if (!fs.existsSync(selectedHome) || fs.lstatSync(selectedHome).isSymbolicLink()) {
    return { valid: false, staged_source_valid: false, host_discovery: false, hook_execution: false, runtime_review: false, failures: ["unsafe-install-home"] };
  }
  const absoluteHome = fs.realpathSync(selectedHome);
  const root = fs.realpathSync(sourceRoot);
  let manifestFile;
  try { manifestFile = assertManagedTarget(absoluteHome, ".super-outer/install-manifest.json", "Install manifest"); }
  catch { return { valid: false, staged_source_valid: false, host_discovery: false, hook_execution: false, runtime_review: false, failures: ["unsafe-install-path"] }; }
  if (!fs.existsSync(manifestFile)) return { valid: false, failures: ["install-manifest-missing"] };
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const expected = digestPackageTree(root);
  let targets;
  try {
    targets = [
      `.super-outer/versions/${SUPER_OUTER_VERSION}`,
      ".super-outer/staged/claude/super-outer",
      ".super-outer/staged/codex/super-outer"
    ].map((relative) => assertManagedTarget(absoluteHome, relative, "Installed source"));
  } catch {
    return { valid: false, staged_source_valid: false, host_discovery: false, hook_execution: false, runtime_review: false, failures: ["unsafe-install-path"] };
  }
  const sourceFailures = [];
  const failures = [];
  if (manifest.version !== SUPER_OUTER_VERSION) sourceFailures.push("version-mismatch");
  if (manifest.sourceDigest !== expected) sourceFailures.push("source-drift");
  for (const target of targets) {
    if (!fs.existsSync(target)) sourceFailures.push(`missing:${path.relative(absoluteHome, target)}`);
    else if (digestPackageTree(target) !== expected) sourceFailures.push(`digest:${path.relative(absoluteHome, target)}`);
  }
  failures.push(...sourceFailures);
  const ownerFile = path.join(absoluteHome, ".super-outer", "active-enforcement.json");
  if (!fs.existsSync(ownerFile)) failures.push("enforcement-owner-missing");
  else {
    const owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
    if (manifest.promoted && owner.activeOwner !== "super-outer-v4") failures.push("enforcement-owner-not-v4");
    if (owner.exactlyOneOwner !== (owner.activeOwner !== "none")) failures.push("enforcement-owner-count-invalid");
  }
  const proofFile = path.join(absoluteHome, ".super-outer", "host-discovery-proof.json");
  let proof = null;
  if (fs.existsSync(proofFile)) proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
  let hostEvidence = null;
  const evidenceFile = manifest.transaction
    ? path.join(absoluteHome, ".super-outer", "transactions", manifest.transaction, "host-adapter-evidence.json")
    : null;
  if (evidenceFile && fs.existsSync(evidenceFile)) hostEvidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));
  const hostProofFailures = manifest.promoted
    ? validateHostProof(hostEvidence, {
        activationId: manifest.transaction,
        sourceDigest: expected,
        home: absoluteHome,
        sourceRoot: root,
      })
    : [];
  if (manifest.promoted && (!proof || proof.status !== "PASS" || proof.activation_id !== manifest.transaction || proof.source_digest !== expected)) {
    hostProofFailures.push("host-discovery-proof-invalid");
  }
  if (manifest.promoted && hostEvidence && proof?.proof_digest !== crypto.createHash("sha256").update(JSON.stringify(hostEvidence)).digest("hex")) {
    hostProofFailures.push("host-proof-digest-mismatch");
  }
  const hostDiscovery = Boolean(proof?.claude_discovered && proof?.codex_discovered && hostProofFailures.length === 0);
  const hookExecution = Boolean(proof?.claude_hook_executed && proof?.codex_hook_executed && proof?.hook_executed && hostProofFailures.length === 0);
  if (manifest.promoted && !hostDiscovery) failures.push("host-discovery-proof-missing");
  if (manifest.promoted && !hookExecution) failures.push("hook-execution-proof-missing");
  failures.push(...hostProofFailures);
  return {
    valid: failures.length === 0,
    staged_source_valid: sourceFailures.length === 0,
    host_discovery: hostDiscovery,
    hook_execution: hookExecution,
    runtime_review: false,
    failures,
    version: manifest.version,
    sourceDigest: expected
  };
};

export const installSuperOuter = ({ home, sourceRoot = DEFAULT_SOURCE_ROOT, promote = false, upgrade = false, hostAdapter } = {}) => {
  const absoluteHome = safeHome(home, { promote });
  const root = fs.realpathSync(sourceRoot);
  validateSource(root);
  assertNoInterruptedTransaction(absoluteHome);
  const sourceDigest = digestPackageTree(root);
  const priorManifestFile = path.join(absoluteHome, ".super-outer", "install-manifest.json");
  if (fs.existsSync(priorManifestFile)) {
    const prior = JSON.parse(fs.readFileSync(priorManifestFile, "utf8"));
    if (prior.sourceDigest === sourceDigest && prior.promoted === Boolean(promote)) {
      const verification = verifyInstallation({ home: absoluteHome, sourceRoot: root });
      if (verification.valid) return {
        installed: verification.host_discovery,
        source_staged: true,
        host_discovery: verification.host_discovery,
        hook_execution: verification.hook_execution,
        runtime_review: false,
        idempotent: true,
        home: absoluteHome,
        verification
      };
    }
  }

  if (promote && typeof hostAdapter?.activate !== "function") {
    throw new Error("Promotion requires a verified Claude and Codex host adapter; source staging alone is not host installation");
  }

  const v3 = inventoryV3({ home: absoluteHome });
  const outer21 = inventoryOuter21({ home: absoluteHome });
  const v3Snapshot = v3.detected ? snapshotV3({ home: absoluteHome }) : null;
  const outer21Snapshot = outer21.detected ? snapshotOuter21({ home: absoluteHome }) : null;
  const transactionId = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
  const targets = transactionTargets({ promote, outer21Inventory: outer21, v3Inventory: v3, hostAdapter });
  const transaction = prepareTransaction({ home: absoluteHome, targets, id: transactionId });
  const stageRoot = path.join(transaction.directory, "stage");
  try {
    const destinations = [
      path.join(absoluteHome, `.super-outer/versions/${SUPER_OUTER_VERSION}`),
      path.join(absoluteHome, ".super-outer/staged/claude/super-outer"),
      path.join(absoluteHome, ".super-outer/staged/codex/super-outer")
    ];
    destinations.forEach((destination, index) => {
      const stage = path.join(stageRoot, String(index));
      stageTree(root, stage);
      replaceWithStage(stage, destination);
      maybeFail(`copy-${index + 1}`);
    });
    let hostProof = { claude_discovered: false, codex_discovered: false, hook_executed: false };
    if (promote) {
      hostProof = hostAdapter.activate({
        home: absoluteHome,
        staged: { claude: destinations[1], codex: destinations[2] },
        transactionDirectory: transaction.directory,
        activationId: transactionId,
        sourceDigest,
      });
      const hostFailures = validateHostProof(hostProof, {
        activationId: transactionId,
        sourceDigest,
        home: absoluteHome,
        sourceRoot: root,
      });
      if (hostFailures.length) {
        const error = new Error(`Host activation BLOCKED: ${hostProof?.blocked_reason || hostFailures.join(", ")}`);
        error.hostEvidence = hostProof;
        throw error;
      }
      atomicJson(path.join(transaction.directory, "host-adapter-evidence.json"), hostProof);
      atomicJson(path.join(absoluteHome, ".super-outer", "host-discovery-proof.json"), {
        schema_version: "1.0.0",
        status: "PASS",
        activation_id: transactionId,
        source_digest: sourceDigest,
        claude_discovered: true,
        codex_discovered: true,
        claude_hook_executed: true,
        codex_hook_executed: true,
        hook_executed: true,
        proof_digest: crypto.createHash("sha256").update(JSON.stringify(hostProof)).digest("hex")
      });
      const aliasSource = path.join(root, "commands", "outer.md");
      if (!fs.existsSync(aliasSource)) throw new Error("Promotion source is missing commands/outer.md compatibility alias");
      const aliasTarget = path.join(absoluteHome, OUTER_ALIAS_RELATIVE);
      fs.mkdirSync(path.dirname(aliasTarget), { recursive: true });
      fs.copyFileSync(aliasSource, aliasTarget);
    }
    let legacyDeactivation = {
      changed: false,
      outer21: { detected: outer21.detected, archive: outer21Snapshot?.snapshot || null, retained: [] },
      outerV3: { detected: v3.detected, archive: v3Snapshot?.snapshot || null, retained: [], disabled: [] }
    };
    if (promote && (v3.detected || outer21.detected)) {
      legacyDeactivation = deactivateLegacyOuter({
        home: absoluteHome,
        v3Snapshot,
        outer21Snapshot
      });
    }
    const afterV3 = inventoryV3({ home: absoluteHome });
    const after21 = inventoryOuter21({ home: absoluteHome });
    const legacyRetained = (!v3.detected || v3Snapshot?.verified === true) && (!outer21.detected || outer21Snapshot?.verified === true);
    if (!legacyRetained) throw new Error("A legacy OUTER archive failed exact verification");
    if (promote && (afterV3.detected || after21.detected)) throw new Error("A legacy OUTER version remains active after promotion");
    maybeFail("v3-hooks");
    const activeOwner = promote ? "super-outer-v4" : (v3.detected ? "outer-v3" : "none");
    atomicJson(path.join(absoluteHome, ".super-outer", "active-enforcement.json"), {
      schemaVersion: 1,
      activeOwner,
      exactlyOneOwner: activeOwner !== "none",
      sideBySide: v3.detected && !promote
    });
    atomicJson(priorManifestFile, {
      schemaVersion: 1,
      name: "super-outer",
      version: SUPER_OUTER_VERSION,
      sourceDigest,
      promoted: Boolean(promote),
      upgrade: Boolean(upgrade),
      transaction: transactionId,
      v3Detected: v3.detected,
      v3Snapshot: v3Snapshot?.snapshot || null,
      outer21Detected: outer21.detected,
      outer21Snapshot: outer21Snapshot?.snapshot || null,
      legacyRetained,
      disabledV3HookFiles: legacyDeactivation.outerV3.disabled.length
    });
    const migrationRecord = {
      schema_version: "1.0.0",
      v3_detected: v3.detected,
      v3_snapshot: v3Snapshot?.snapshot || null,
      outer_21_detected: outer21.detected,
      outer_21_snapshot: outer21Snapshot?.snapshot || null,
      legacy_versions_deactivated: promote
        ? [outer21.detected ? "outer-2.1" : null, v3.detected ? "outer-v3" : null].filter(Boolean)
        : [],
      legacy_versions_retained: legacyRetained,
      v4_isolated_verified: Boolean(promote),
      v4_installed: Boolean(promote),
      promoted: Boolean(promote),
      active_enforcement_owner: activeOwner,
      rollback_snapshot: transaction.directory,
      status: promote ? "PROMOTED" : "ISOLATED"
    };
    atomicJson(path.join(absoluteHome, ".super-outer", "migration-record.json"), migrationRecord);
    maybeFail("manifest");
    const completed = { ...transaction, status: "COMPLETED", completedAt: new Date().toISOString() };
    atomicJson(path.join(transaction.directory, "record.json"), completed);
    atomicJson(path.join(absoluteHome, ".super-outer", "active-transaction.json"), completed);
    const verification = verifyInstallation({ home: absoluteHome, sourceRoot: root });
    if (!verification.valid) throw new Error(`Installation verification failed: ${verification.failures.join(", ")}`);
    return {
      installed: Boolean(promote),
      source_staged: true,
      host_discovery: Boolean(promote),
      hook_execution: Boolean(promote),
      runtime_review: false,
      idempotent: false,
      home: absoluteHome,
      transaction: transactionId,
      activeOwner,
      v3Detected: v3.detected,
      v3Intact: legacyRetained,
      outer21Detected: outer21.detected,
      legacyRetained,
      legacyDeactivation,
      migration_record: migrationRecord,
      verification
    };
  } catch (error) {
    rollbackInstallation({ home: absoluteHome });
    throw error;
  }
};

export const upgradeSuperOuter = (options = {}) => installSuperOuter({ ...options, upgrade: true });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const homeIndex = process.argv.indexOf("--home");
    const sourceIndex = process.argv.indexOf("--source");
    const result = installSuperOuter({
      home: homeIndex >= 0 ? process.argv[homeIndex + 1] : undefined,
      sourceRoot: sourceIndex >= 0 ? process.argv[sourceIndex + 1] : DEFAULT_SOURCE_ROOT,
      promote: process.argv.includes("--promote"),
      upgrade: process.argv.includes("--upgrade")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
