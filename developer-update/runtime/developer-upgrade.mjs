#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const VERSION = "6.6.0";
export const MARKETPLACE = "super-outer-developer-update";
export const PAYLOAD_DIGEST = "41dd783e59fda8ada94bcc3cdefb7b46be850f1aeed68849c294f7653b924072";
const MINIMUM_NODE_MAJOR = 22;
/**
 * The optional plugins that ship beside the core, keyed by plugin name. The
 * person installing chooses components; a component names the plugins it
 * brings and the hosts each one runs on.
 */
export const OPTIONAL_PLUGINS = Object.freeze({
  "super-outer-learning": Object.freeze({ component: "skills", hosts: Object.freeze(["claude", "codex"]) }),
});
export const COMPONENTS = Object.freeze(["skills"]);
export const DEFAULT_COMPONENTS = COMPONENTS;
const COMPONENTS_FILE = ".super-outer/components.json";
const CORE_PLUGIN = "super-outer";
const MANAGED_PLUGINS = Object.freeze([CORE_PLUGIN, ...Object.keys(OPTIONAL_PLUGINS)]);
const SUPPORTED_PLATFORMS = Object.freeze(["darwin", "linux"]);
const ROLE_FILES = Object.freeze([
  "benchmark-researcher.toml",
  "design-prototyper.toml",
  "experience-reviewer.toml",
  "failure-scout.toml",
  "independent-verifier.toml",
]);
const DESIGN_FILES = Object.freeze([
  "skills/super-outer/SKILL.md",
  "skills/super-outer/modules/product-ui-ux-motion.md",
  "skills/super-outer/modules/product-ui-ux-motion/subplaybooks/company-native-system.md",
  "skills/super-outer/references/source-authority.md",
]);
/**
 * The guidance text itself lives in `src/managed-guidance.mjs` inside the
 * payload, so the block a host reads always states the version that is
 * actually installed. These two constants exist only to clean up the frozen
 * v4-era section written by earlier installers, which would otherwise look
 * like a hand-written section and be refused rather than replaced.
 */
const LEGACY_CLAUDE_HEADING = "## Super-outer v4 — warn first, approve only super-critical work";
/**
 * Matched as exact bytes, never by scanning forward to the next heading.
 * Scanning deletes whatever follows when nothing follows with a `##`, and what
 * follows is the reader's own prose: earlier installers always appended this
 * block last, so anything added afterwards sits directly beneath it.
 */
export const LEGACY_CLAUDE_BLOCK = `## Super-outer v4 — warn first, approve only super-critical work

Before material engineering work, apply the installed Super-outer v4 guidance.

- Ordinary analysis, code changes, tests, builds, Git/CI work, review gaps, and
  stale context continue without an approval phrase.
- Show a prominent \`BEWARE\` warning when a risk or proof gap needs attention;
  use bright orange where terminal colour is available and say clearly that
  work may continue.
- Ask for one exact \`APPROVE SUPER-OUTER <token>\` phrase only when the next
  live action has a concrete super-critical consequence involving protected
  data, secrets or authority, production delivery or infrastructure, a
  consequential external transaction, protected history, or defeated recovery.
- Follow the repository's own design system, components, tokens, content,
  accessibility, motion, and journey contracts before external style.
- Missing, stale, branch-mismatched, or multiple OUTER task records are
  bookkeeping warnings only. They never block ordinary tools, code changes,
  commits, integration merges, or CI.
- Do not repeat approval for unchanged scope. Keep source, CI, installation,
  runtime, and direct journey proof separate.`;
const LEGACY_CODEX_BLOCK = /<super-outer-v4>[\s\S]*?<\/super-outer-v4>\s*/g;

const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultBundleRoot = path.dirname(runtimeDirectory);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (filename) => sha256(fs.readFileSync(filename));

/**
 * Accepts "skills", "both", "none" or an array, and
 * returns the chosen components sorted, so a saved choice compares exactly.
 */
export const normalizeComponents = (value) => {
  if (value === undefined || value === null) return null;
  const parts = Array.isArray(value)
    ? value.map(String)
    : String(value).split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  // A saved choice of none is an empty list; typed text must name something.
  if (!Array.isArray(value) && parts.length === 0) throw new Error("Give --components a value: skills or none.");
  const chosen = new Set();
  for (const part of parts) {
    if (part === "none") continue;
    if (part === "both" || part === "all") COMPONENTS.forEach((component) => chosen.add(component));
    else if (COMPONENTS.includes(part)) chosen.add(part);
    else throw new Error(`Unknown component: ${part}. Use skills or none.`);
  }
  return [...chosen].sort();
};

const parseArguments = (values) => {
  const args = { command: values[0] || "verify", yes: false, json: false };
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--yes") args.yes = true;
    else if (value === "--json") args.json = true;
    else if (value === "--components") {
      const choice = values[++index];
      if (choice === undefined || choice.trim() === "" || choice.startsWith("--")) throw new Error("Give --components a value: skills or none.");
      args.components = normalizeComponents(choice);
    }
    else if (["--home", "--bundle"].includes(value)) args[value.slice(2)] = values[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!["install", "verify", "rollback"].includes(args.command)) {
    throw new Error("Use install, verify, or rollback.");
  }
  return args;
};

const assertRuntime = () => {
  if (!SUPPORTED_PLATFORMS.includes(process.platform) && process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM !== "1") {
    throw new Error("Super-outer installs on macOS and Linux. Windows is not supported.");
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(`Super-outer requires Node ${MINIMUM_NODE_MAJOR} or newer.`);
  }
};

const resolveHome = ({ home, yes, mutation }) => {
  const selected = path.resolve(home || os.homedir());
  if (!fs.existsSync(selected)) throw new Error(`Home directory does not exist: ${selected}`);
  if (fs.lstatSync(selected).isSymbolicLink()) throw new Error("The selected home directory cannot be a symbolic link.");
  const canonical = fs.realpathSync(selected);
  const actual = fs.realpathSync(os.homedir());
  if (mutation && canonical === actual && !yes) {
    throw new Error("Run the installer from the .command file, or pass --yes after reading READ ME FIRST.md.");
  }
  return canonical;
};

const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const targetPath = (home, relative) => {
  if (!relative || relative === "." || path.isAbsolute(relative) || relative.split(/[\\/]+/).includes("..")) {
    throw new Error(`Unsafe managed path: ${relative || "<empty>"}`);
  }
  const target = path.resolve(home, relative);
  if (!inside(home, target)) throw new Error(`Managed path escaped the selected home: ${relative}`);
  let current = home;
  for (const segment of path.relative(home, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Managed path crosses a symbolic link: ${path.relative(home, current)}`);
    }
  }
  return target;
};

const copyPath = (source, destination) => {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    for (const entry of fs.readdirSync(source).sort()) copyPath(path.join(source, entry), path.join(destination, entry));
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  } else throw new Error(`Unsupported file type: ${source}`);
};

const removePath = (target) => {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(target)) removePath(path.join(target, entry));
    fs.rmdirSync(target);
  } else fs.unlinkSync(target);
};

const atomicJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, 0o600);
};

const atomicText = (filename, value, defaultMode = 0o600) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const mode = fs.existsSync(filename) ? fs.statSync(filename).mode & 0o777 : defaultMode;
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, value, { mode, flag: "wx" });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, mode);
};

const safeManifestRelative = (relative) => {
  if (!relative || path.posix.isAbsolute(relative) || relative.includes("\\") || relative.split("/").includes("..")) {
    throw new Error(`Unsafe package-manifest path: ${relative || "<empty>"}`);
  }
  return relative;
};

const importFrom = async (filename) => import(`${pathToFileURL(filename).href}?developer_update=${Date.now()}`);

export const loadBundle = async (bundleRoot = defaultBundleRoot) => {
  const root = fs.realpathSync(path.resolve(bundleRoot));
  const manifestFile = path.join(root, "PACKAGE-MANIFEST.json");
  if (!fs.existsSync(manifestFile)) throw new Error("PACKAGE-MANIFEST.json is missing.");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.schema_version !== "1.0.0" || manifest.version !== VERSION || manifest.payload_digest !== PAYLOAD_DIGEST) {
    throw new Error("The developer update package identity is invalid.");
  }
  if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
    throw new Error("The developer update package file list is invalid.");
  }
  for (const [relativeValue, expected] of Object.entries(manifest.files)) {
    const relative = safeManifestRelative(relativeValue);
    const filename = path.join(root, ...relative.split("/"));
    if (!fs.existsSync(filename) || !fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink()) {
      throw new Error(`Package file is missing or unsafe: ${relative}`);
    }
    if (!/^[a-f0-9]{64}$/.test(String(expected)) || sha256File(filename) !== expected) {
      throw new Error(`Package file checksum failed: ${relative}`);
    }
  }
  const payloadRoot = path.join(root, "marketplace", "plugins", "super-outer");
  const packageTools = await importFrom(path.join(payloadRoot, "scripts", "build-package.mjs"));
  const migration = await importFrom(path.join(payloadRoot, "scripts", "migrate-v3.mjs"));
  const guidance = await importFrom(path.join(payloadRoot, "src", "managed-guidance.mjs"));
  if (packageTools.digestPackageTree(payloadRoot) !== PAYLOAD_DIGEST) {
    throw new Error(`The packaged Super-outer payload does not match the reviewed v${VERSION} release.`);
  }
  for (const relative of DESIGN_FILES) {
    const filename = path.join(payloadRoot, ...relative.split("/"));
    if (!fs.existsSync(filename)) throw new Error(`The company-native design-system playbook is incomplete: ${relative}`);
  }
  const nativeDesign = fs.readFileSync(path.join(payloadRoot, DESIGN_FILES[2]), "utf8");
  const sourceAuthority = fs.readFileSync(path.join(payloadRoot, DESIGN_FILES[3]), "utf8");
  if (!nativeDesign.includes("Never copy another") ||
      !nativeDesign.includes("company's system") ||
      !nativeDesign.includes("Inventory existing primitives") ||
      !sourceAuthority.includes("Explicit company and repository contracts")) {
    throw new Error("The repository-native design-system authority contract changed unexpectedly.");
  }
  for (const relative of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const plugin = JSON.parse(fs.readFileSync(path.join(payloadRoot, relative), "utf8"));
    if (plugin.name !== "super-outer" || plugin.version !== VERSION) throw new Error(`${relative} is not Super-outer v${VERSION}.`);
  }
  const optional = {};
  const declared = manifest.optional_plugins ?? {};
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) throw new Error("The optional plugin list is invalid.");
  for (const [name, definition] of Object.entries(OPTIONAL_PLUGINS)) {
    const entry = declared[name];
    if (!entry || !/^\d+\.\d+\.\d+$/.test(String(entry.version)) || !/^[a-f0-9]{64}$/.test(String(entry.digest))) {
      throw new Error(`The optional plugin ${name} is missing from the package.`);
    }
    const pluginRoot = path.join(root, "marketplace", "plugins", name);
    if (packageTools.digestPackageTree(pluginRoot) !== entry.digest) {
      throw new Error(`The packaged ${name} plugin does not match the reviewed v${VERSION} release.`);
    }
    for (const host of definition.hosts) {
      const relative = host === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json";
      const plugin = JSON.parse(fs.readFileSync(path.join(pluginRoot, relative), "utf8"));
      if (plugin.name !== name || plugin.version !== entry.version) throw new Error(`${name}/${relative} does not match the package.`);
    }
    optional[name] = { ...definition, version: entry.version, digest: entry.digest };
  }
  for (const name of Object.keys(declared)) {
    if (!OPTIONAL_PLUGINS[name]) throw new Error(`The package lists an unknown optional plugin: ${name}.`);
  }
  return { root, manifest, payloadRoot, packageTools, migration, guidance, optional };
};

const executableFor = (host) => process.env[`SUPER_OUTER_${host.toUpperCase()}_BIN`] || host;

/**
 * Whether a host can be reached at all. Exported so callers ask this exactly
 * one way: a plain PATH lookup ignores the documented per-host override, and
 * would refuse to install for someone whose host is not on PATH even though
 * the installer could have reached it.
 */
export const hostAvailable = (host) => commandExists(executableFor(host));
const commandExists = (executable) => {
  if (path.isAbsolute(executable)) return fs.existsSync(executable) && fs.statSync(executable).isFile();
  // Minimal Linux images do not always ship /usr/bin/which; resolve through PATH first.
  for (const finder of ["which", "/usr/bin/which"]) {
    const result = spawnSync(finder, [executable], { encoding: "utf8" });
    if (result.error) continue;
    return result.status === 0;
  }
  return false;
};
const hostEnvironment = (home, host) => ({
  ...process.env,
  ...(host === "claude" ? { CLAUDE_CONFIG_DIR: path.join(home, ".claude") } : { CODEX_HOME: path.join(home, ".codex") }),
});
const hostConfigRelative = (host) => host === "claude" ? ".claude" : ".codex";
const run = ({ executable, args, home, host, allowFailure = false }) => {
  const result = spawnSync(executable, args, {
    cwd: home,
    env: hostEnvironment(home, host),
    encoding: "utf8",
  });
  if (!allowFailure && (result.status !== 0 || result.error)) {
    const message = `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 1_200);
    throw new Error(`${host} could not complete: ${message || result.error?.message || "unknown error"}`);
  }
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "", error: result.error?.message || null };
};

const pluginIdentity = (record) => String(record?.name ?? record?.id ?? record?.pluginId ?? "").toLowerCase().split("@")[0];
const collectPluginRecords = (value, records = []) => {
  if (Array.isArray(value)) value.forEach((entry) => collectPluginRecords(entry, records));
  else if (value && typeof value === "object") {
    if (MANAGED_PLUGINS.includes(pluginIdentity(value))) records.push(value);
    Object.values(value).forEach((entry) => collectPluginRecords(entry, records));
  }
  return records;
};
const recordId = (record) => record?.id || record?.pluginId ||
  (record?.name && record?.marketplaceName ? `${record.name}@${record.marketplaceName}` : null);
const recordMarketplace = (record) => record?.marketplaceName || record?.marketplace ||
  String(recordId(record) ?? "").split("@")[1] || null;
const recordActive = (record) => record?.installed !== false && record?.enabled !== false &&
  (record?.installed === true || record?.enabled === true || /^(?:active|enabled)$/i.test(String(record?.status ?? record?.state ?? "")));
const recordSource = (record) => record?.installPath || record?.install_path || record?.path ||
  (typeof record?.source === "string" ? record.source : record?.source?.path) || null;

const listHostPlugins = ({ host, home }) => {
  const executable = executableFor(host);
  if (!commandExists(executable)) return { host, present: false, executable, records: [] };
  const configRoot = targetPath(home, hostConfigRelative(host));
  if (!fs.existsSync(configRoot)) {
    return { host, present: true, executable, configRoot, configRootExisted: false, records: [] };
  }
  if (!fs.lstatSync(configRoot).isDirectory()) throw new Error(`${host} configuration root is not a directory.`);
  const result = run({ executable, args: ["plugin", "list", "--json"], home, host });
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { throw new Error(`${host} returned an unreadable plugin list.`); }
  const seen = new Set();
  const records = collectPluginRecords(parsed).filter((record) => {
    const identity = `${recordId(record)}|${record.version}|${recordSource(record)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return { host, present: true, executable, configRoot, configRootExisted: true, records };
};

const sourceDigest = ({ record, home, bundle }) => {
  const reported = recordSource(record);
  if (!reported) return null;
  try {
    const absolute = path.isAbsolute(reported) ? path.resolve(reported) : path.resolve(home, reported);
    if (!fs.existsSync(absolute)) return null;
    return bundle.packageTools.digestPackageTree(fs.realpathSync(absolute));
  } catch { return null; }
};

/** The optional plugins a host should carry for the chosen components. */
const wantedOptional = ({ host, components }) => Object.entries(OPTIONAL_PLUGINS)
  .filter(([, definition]) => components.includes(definition.component) && definition.hosts.includes(host))
  .map(([name]) => name);

/**
 * A host is valid when the core plugin is active exactly once from the
 * reviewed payload, each chosen optional plugin is active exactly once from
 * this package, and no unchosen optional plugin from this package is active.
 * A same-named plugin from another marketplace counts against a chosen one,
 * because two active copies of one plugin would both run.
 */
const inspectHost = ({ host, home, bundle, components = [] }) => {
  const listing = listHostPlugins({ host, home });
  const records = listing.records.filter((record) => pluginIdentity(record) === CORE_PLUGIN);
  const active = records.filter(recordActive);
  const exact = active.filter((record) => record.version === VERSION && sourceDigest({ record, home, bundle }) === PAYLOAD_DIGEST);
  const wanted = wantedOptional({ host, components });
  const optional = {};
  for (const [name, packaged] of Object.entries(bundle.optional ?? {})) {
    const named = listing.records.filter((record) => pluginIdentity(record) === name);
    const live = named.filter(recordActive);
    const matching = live.filter((record) => recordMarketplace(record) === MARKETPLACE && record.version === packaged.version &&
      sourceDigest({ record, home, bundle }) === packaged.digest);
    const ours = live.filter((record) => recordMarketplace(record) === MARKETPLACE);
    const chosen = wanted.includes(name);
    optional[name] = {
      chosen,
      active: live.length,
      exact: matching.length,
      valid: chosen ? live.length === 1 && matching.length === 1 : ours.length === 0,
      records: named,
    };
  }
  const optionalValid = Object.values(optional).every((entry) => entry.valid);
  return {
    ...listing,
    records,
    active,
    exact,
    optional,
    coreValid: active.length === 1 && exact.length === 1,
    valid: !listing.present || (active.length === 1 && exact.length === 1 && optionalValid),
  };
};

const ignoreMissing = (result) => result.status === 0 ||
  /not found|not installed|not configured or installed|unknown marketplace|does not exist/i.test(`${result.stdout}\n${result.stderr}`);
const removePlugin = ({ host, home, executable, id, scope = "user" }) => {
  if (!id) throw new Error(`${host} reported a Super-outer plugin without an id.`);
  const args = host === "claude"
    ? ["plugin", "uninstall", id, "--scope", scope, "--keep-data", "--yes"]
    : ["plugin", "remove", id, "--json"];
  run({ executable, args, home, host });
};

const installHost = ({ host, home, marketplaceRoot, bundle, components }) => {
  const before = inspectHost({ host, home, bundle, components });
  if (!before.present) return { host, present: false, installed: false, idempotent: true, plugins: [], replaced: [] };
  const wanted = wantedOptional({ host, components });
  if (before.valid) {
    return { host, present: true, installed: true, idempotent: true, plugin: recordId(before.exact[0]), plugins: [CORE_PLUGIN, ...wanted], replaced: [] };
  }
  const replaced = [];
  const removals = [...before.records];
  for (const [name, entry] of Object.entries(before.optional)) {
    for (const record of entry.records) {
      const ours = recordMarketplace(record) === MARKETPLACE;
      // A chosen plugin replaces every same-named copy, so only one strip draws.
      // An unchosen one loses only this package's copy; another source's stays.
      if (entry.chosen || ours) {
        removals.push(record);
        if (!ours) replaced.push(recordId(record));
      }
    }
  }
  for (const record of removals) {
    removePlugin({
      host,
      home,
      executable: before.executable,
      id: recordId(record),
      scope: record.scope || "user",
    });
  }
  const removeMarketplaceArgs = host === "claude"
    ? ["plugin", "marketplace", "remove", MARKETPLACE, "--scope", "user"]
    : ["plugin", "marketplace", "remove", MARKETPLACE, "--json"];
  const removed = run({ executable: before.executable, args: removeMarketplaceArgs, home, host, allowFailure: true });
  if (!ignoreMissing(removed)) throw new Error(`${host} could not refresh the packaged marketplace: ${(removed.stderr || removed.stdout).trim()}`);
  const addArgs = host === "claude"
    ? ["plugin", "marketplace", "add", marketplaceRoot, "--scope", "user"]
    : ["plugin", "marketplace", "add", marketplaceRoot, "--json"];
  run({ executable: before.executable, args: addArgs, home, host });
  for (const name of [CORE_PLUGIN, ...wanted]) {
    const installArgs = host === "claude"
      ? ["plugin", "install", `${name}@${MARKETPLACE}`, "--scope", "user"]
      : ["plugin", "add", `${name}@${MARKETPLACE}`, "--json"];
    run({ executable: before.executable, args: installArgs, home, host });
  }
  const after = inspectHost({ host, home, bundle, components });
  if (!after.coreValid) throw new Error(`${host} did not finish with exactly one verified Super-outer v${VERSION} plugin.`);
  if (!after.valid) {
    const failed = Object.entries(after.optional).filter(([, entry]) => !entry.valid).map(([name]) => name);
    throw new Error(`${host} did not finish with the chosen optional plugins verified: ${failed.join(", ")}.`);
  }
  return { host, present: true, installed: true, idempotent: false, plugin: recordId(after.exact[0]), plugins: [CORE_PLUGIN, ...wanted], replaced };
};

/**
 * The saved component choice, or null when none was saved. A saved file that
 * cannot be read throws: guessing would override a choice such as "none".
 */
export const readComponents = (home) => {
  const filename = targetPath(home, COMPONENTS_FILE);
  if (!fs.existsSync(filename)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(filename, "utf8")).components;
    if (!Array.isArray(saved)) throw new Error("components is not a list");
    return normalizeComponents(saved);
  } catch {
    throw new Error(`The saved choice in ~/${COMPONENTS_FILE} cannot be read. Choose again with --components skills or none.`);
  }
};

/**
 * A copy of a chosen plugin from another marketplace is removed during the
 * install; its installed folder is recorded so rollback can put it back.
 */
const foreignInstallTargets = ({ home, hostBefore }) => {
  const targets = [];
  for (const inspected of Object.values(hostBefore)) {
    for (const entry of Object.values(inspected.optional ?? {})) {
      if (!entry.chosen) continue;
      for (const record of entry.records) {
        if (recordMarketplace(record) === MARKETPLACE) continue;
        const source = recordSource(record);
        // Only a plain folder in Claude Code's plugin cache is backed up. A path
        // with ".." segments could resolve to any folder in the home directory.
        if (!source || !path.isAbsolute(source) || source.split(/[\\/]+/).includes("..")) continue;
        const relative = path.relative(home, source).split(path.sep).join("/");
        if (!relative.startsWith(".claude/plugins/cache/")) continue;
        targets.push(relative);
      }
    }
  }
  return targets;
};

// Other plugins call Super-outer through this path, which never changes
// between versions. Each install points it at the version it installed.
export const LAUNCHER = ".super-outer/bin/super-outer";
const writeLauncher = (home) => {
  const entry = targetPath(home, `.super-outer/developer-marketplace/${VERSION}/plugins/super-outer/bin/super-outer.mjs`);
  const quoted = `'${entry.replace(/'/g, "'\\''")}'`;
  const fallback = `'${process.execPath.replace(/'/g, "'\\''")}'`;
  const script = [
    "#!/bin/sh",
    `# Super-outer v${VERSION}. Setup rewrites this file on every install.`,
    `if command -v node >/dev/null 2>&1; then exec node ${quoted} "$@"; fi`,
    `exec ${fallback} ${quoted} "$@"`,
    "",
  ].join("\n");
  const filename = targetPath(home, LAUNCHER);
  atomicText(filename, script, 0o755);
  fs.chmodSync(filename, 0o755);
};

const managedTargets = ({ legacy, extra = [] }) => {
  const fixed = [
    ".claude/settings.json",
    ".claude/CLAUDE.md",
    ".claude/commands/outer.md",
    ".claude/plugins/installed_plugins.json",
    ".claude/plugins/known_marketplaces.json",
    ".claude/plugins/config.json",
    `.claude/plugins/marketplaces/${MARKETPLACE}`,
    `.claude/plugins/cache/${MARKETPLACE}`,
    ".agents/settings.json",
    ".codex/settings.json",
    ".codex/hooks.json",
    ".codex/AGENTS.md",
    ".codex/config.toml",
    `.codex/plugins/marketplaces/${MARKETPLACE}`,
    `.codex/plugins/cache/${MARKETPLACE}`,
    ".codex/super-outer-agent-roles.json",
    ...ROLE_FILES.map((file) => `.codex/agents/${file}`),
    `.super-outer/developer-marketplace/${VERSION}`,
    LAUNCHER,
    ".super-outer/active-enforcement.json",
    COMPONENTS_FILE,
    ".super-outer/developer-upgrade-receipt.json",
    ".super-outer/developer-upgrade-receipt.txt",
    ".super-outer/latest-developer-upgrade.json",
  ];
  const legacyTargets = [
    ...(legacy.outerV3.installations || []).map((entry) => entry.relative),
    ...(legacy.outerV3.settings || []).filter((entry) => entry.hasV3Hooks).map((entry) => entry.relative),
    ...(legacy.outerV3.guidance || []).filter((entry) => entry.hasV3Guidance).map((entry) => entry.relative),
    ...(legacy.outer21.installations || []).map((entry) => entry.relative),
  ];
  return [...new Set([...fixed, ...legacyTargets, ...extra])].filter((relative) => !relative.startsWith(".cursor/")).sort();
};

const prepareTransaction = ({ home, targets, configRoots }) => {
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}`;
  const directory = targetPath(home, `.super-outer/developer-upgrades/${id}`);
  fs.mkdirSync(path.join(directory, "backups"), { recursive: true, mode: 0o700 });
  const recorded = targets.map((relative, index) => {
    const target = targetPath(home, relative);
    const existed = fs.existsSync(target);
    if (existed) copyPath(target, path.join(directory, "backups", String(index)));
    return { relative, existed, backup: String(index) };
  });
  const hostConfigRoots = configRoots.map((relative) => {
    const target = targetPath(home, relative);
    return { relative, existed: fs.existsSync(target) };
  });
  const record = {
    schema_version: "1.0.0",
    id,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    directory,
    targets: recorded,
    host_config_roots: hostConfigRoots,
  };
  atomicJson(path.join(directory, "record.json"), record);
  return record;
};

const createMissingHostConfigRoots = ({ home, record }) => {
  for (const entry of record.host_config_roots || []) {
    if (!entry.existed) fs.mkdirSync(targetPath(home, entry.relative), { recursive: true, mode: 0o700 });
  }
};

const restoreTransaction = ({ home, record, status }) => {
  for (const entry of [...record.targets].reverse()) {
    const target = targetPath(home, entry.relative);
    removePath(target);
    if (entry.existed) copyPath(path.join(record.directory, "backups", entry.backup), target);
  }
  for (const entry of record.host_config_roots || []) {
    if (!entry.existed) removePath(targetPath(home, entry.relative));
  }
  const updated = { ...record, status, restored_at: new Date().toISOString() };
  atomicJson(path.join(record.directory, "record.json"), updated);
  return updated;
};

/**
 * Earlier installers wrote a frozen "Super-outer v4" section with no ownership
 * markers. Left in place it reads as a hand-written section, and the managed
 * block refuses to overwrite hand-written work — correctly. Removing it first
 * is what lets the same file be taken over cleanly instead of refused.
 */
const stripLegacyClaudeGuidance = (source) => {
  let text = source;
  while (text.includes(LEGACY_CLAUDE_BLOCK)) text = text.split(LEGACY_CLAUDE_BLOCK).join("");
  return text.replace(/\n{3,}/g, "\n\n").trimEnd();
};

const stripLegacyCodexGuidance = (source) => source.replace(LEGACY_CODEX_BLOCK, "").trimEnd();

const ensureGuidance = ({ home, claudePresent, codexPresent, guidance }) => {
  const applied = [];
  const write = (relative, strip) => {
    const filename = targetPath(home, relative);
    const exists = fs.existsSync(filename);
    const existing = exists ? fs.readFileSync(filename, "utf8") : "";
    const cleaned = strip(existing);
    // Only rewrite when a legacy section was actually removed. Touching a file
    // that needs no cleanup would reformat lines this installer does not own.
    if (!exists || cleaned !== existing.trimEnd()) {
      atomicText(filename, cleaned ? `${cleaned}\n` : "", 0o600);
    }
    const plan = guidance.applyManagedGuidance(filename, VERSION);
    // A file reported as left alone keeps its own permissions too.
    if (plan.changed && fs.existsSync(filename)) fs.chmodSync(filename, 0o600);
    // A hand-written Super-outer section is the author's, and is never
    // overwritten. Switching the plugin on still succeeds; the person is told
    // in the receipt which line to move by hand.
    applied.push({
      file: relative,
      action: plan.action,
      reason: plan.reason ?? null,
      version: guidance.managedGuidanceVersion(filename),
    });
  };
  if (claudePresent) write(".claude/CLAUDE.md", stripLegacyClaudeGuidance);
  if (codexPresent) write(".codex/AGENTS.md", stripLegacyCodexGuidance);
  return applied;
};

const installCodexRoles = ({ home, payloadRoot }) => {
  const destinationDirectory = targetPath(home, ".codex/agents");
  const indexFile = targetPath(home, ".codex/super-outer-agent-roles.json");
  let previous = { roles: [] };
  if (fs.existsSync(indexFile)) previous = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  if (!Array.isArray(previous.roles)) throw new Error("The existing Super-outer Codex role record is invalid.");
  const managed = new Map(previous.roles.map((role) => [role.file, role.sha256]));
  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const roles = [];
  for (const file of ROLE_FILES) {
    const source = path.join(payloadRoot, ".codex", "agents", file);
    const expected = sha256File(source);
    const destination = path.join(destinationDirectory, file);
    if (fs.existsSync(destination)) {
      const current = sha256File(destination);
      if (current !== expected && managed.get(file) !== current) {
        throw new Error(`A different unmanaged Codex role already uses ${file}; it was left unchanged.`);
      }
    }
    atomicText(destination, fs.readFileSync(source, "utf8"), 0o600);
    roles.push({ file, sha256: expected });
  }
  atomicJson(indexFile, { schema_version: "1.0.0", plugin: "super-outer", version: VERSION, roles });
  return roles;
};

const count = (source, marker) => source.split(marker).length - 1;
const readIfPresent = (filename) => fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";

/**
 * The guidance block states the installed version to the host. A hand-written
 * Super-outer section is left alone, so its absence there is a visible note
 * rather than a failed installation.
 */
const checkGuidance = ({ filename, host, legacyMarker, guidance, failures, notes }) => {
  const guide = readIfPresent(filename);
  // An edited copy of the old section is not removed, because its boundaries
  // can no longer be known exactly. Saying so beats guessing where it ends.
  if (guide.includes(legacyMarker)) notes.push(`${host}-legacy-guidance-left-to-author`);
  const markers = count(guide, guidance.BEGIN_MARKER) === 1 && count(guide, guidance.END_MARKER) === 1;
  if (markers) {
    if (guidance.managedGuidanceVersion(filename) !== VERSION) failures.push(`${host}-guidance-version-mismatch`);
    return;
  }
  if (guidance.planManagedGuidance(filename, VERSION).action === "refuse") {
    notes.push(`${host}-guidance-left-to-author`);
    return;
  }
  failures.push(`${host}-guidance-block-count-invalid`);
};

export const verifyDeveloperUpgrade = async ({ home: requestedHome, bundleRoot = defaultBundleRoot, components: requestedComponents } = {}) => {
  assertRuntime();
  const home = resolveHome({ home: requestedHome, yes: true, mutation: false });
  const bundle = await loadBundle(bundleRoot);
  const failures = [];
  const notes = [];
  let saved = null;
  try { saved = readComponents(home); }
  catch { failures.push("component-choice-unreadable"); }
  const components = normalizeComponents(requestedComponents) ?? saved ?? [];
  const hosts = {};
  for (const host of ["claude", "codex"]) {
    const inspected = inspectHost({ host, home, bundle, components });
    hosts[host] = {
      present: inspected.present,
      active: inspected.active.length,
      exact: inspected.exact.length,
      valid: inspected.valid,
      optional: Object.fromEntries(Object.entries(inspected.optional).map(([name, entry]) =>
        [name, { chosen: entry.chosen, active: entry.active, exact: entry.exact, valid: entry.valid }])),
    };
    if (inspected.present && !inspected.coreValid) failures.push(`${host}-not-exactly-one-verified-v4`);
    for (const [name, entry] of Object.entries(inspected.optional)) {
      if (inspected.present && !entry.valid) failures.push(`${host}-${name}-${entry.chosen ? "not-exactly-one-verified" : "still-active"}`);
    }
  }
  if (components.length > 0 && JSON.stringify(saved) !== JSON.stringify(components)) failures.push("component-choice-not-recorded");
  if (!hosts.claude.present && !hosts.codex.present) failures.push("no-supported-host-found");
  const outer21 = bundle.migration.inventoryOuter21({ home });
  const outerV3 = bundle.migration.inventoryV3({ home });
  if (outer21.detected) failures.push("outer-2.1-still-discoverable");
  if (outerV3.detected) failures.push("outer-v3-still-active");
  const ownerFile = targetPath(home, ".super-outer/active-enforcement.json");
  let owner = null;
  if (!fs.existsSync(ownerFile)) failures.push("active-owner-record-missing");
  else {
    owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
    if (owner.activeOwner !== "super-outer-v4" || owner.version !== VERSION || owner.exactlyOneOwner !== true || owner.sideBySide !== false) {
      failures.push("active-owner-record-invalid");
    }
  }
  if (hosts.claude.present) {
    checkGuidance({
      filename: targetPath(home, ".claude/CLAUDE.md"),
      host: "claude",
      legacyMarker: LEGACY_CLAUDE_HEADING,
      guidance: bundle.guidance,
      failures,
      notes,
    });
    const alias = targetPath(home, ".claude/commands/outer.md");
    if (!fs.existsSync(alias) || sha256File(alias) !== sha256File(path.join(bundle.payloadRoot, "commands", "outer.md"))) failures.push("claude-outer-alias-invalid");
  }
  if (hosts.codex.present) {
    checkGuidance({
      filename: targetPath(home, ".codex/AGENTS.md"),
      host: "codex",
      legacyMarker: "<super-outer-v4>",
      guidance: bundle.guidance,
      failures,
      notes,
    });
    const roleIndex = targetPath(home, ".codex/super-outer-agent-roles.json");
    if (!fs.existsSync(roleIndex)) failures.push("codex-reviewer-role-record-missing");
    else {
      const roles = JSON.parse(fs.readFileSync(roleIndex, "utf8"));
      if (roles.version !== VERSION || !Array.isArray(roles.roles) || roles.roles.length !== ROLE_FILES.length) failures.push("codex-reviewer-role-record-invalid");
      for (const role of roles.roles || []) {
        const filename = targetPath(home, `.codex/agents/${role.file}`);
        if (!fs.existsSync(filename) || sha256File(filename) !== role.sha256) failures.push(`codex-reviewer-role-invalid:${role.file}`);
      }
    }
  }
  const latestFile = targetPath(home, ".super-outer/latest-developer-upgrade.json");
  let cursorManaged = false;
  if (fs.existsSync(latestFile)) {
    const latest = JSON.parse(fs.readFileSync(latestFile, "utf8"));
    const record = JSON.parse(fs.readFileSync(path.join(latest.directory, "record.json"), "utf8"));
    cursorManaged = record.targets.some((entry) => entry.relative === ".cursor" || entry.relative.startsWith(".cursor/"));
    if (cursorManaged) failures.push("cursor-was-in-managed-targets");
  }
  return {
    valid: failures.length === 0,
    version: VERSION,
    home,
    components,
    hosts,
    legacy: { outer21Active: outer21.detected, outerV3Active: outerV3.detected },
    owner,
    designSystemAuthority: "repository-native",
    cursorTouched: cursorManaged,
    failures,
    notes,
  };
};

export const installDeveloperUpgrade = async ({ home: requestedHome, bundleRoot = defaultBundleRoot, yes = false, components: requestedComponents } = {}) => {
  assertRuntime();
  const home = resolveHome({ home: requestedHome, yes, mutation: true });
  const bundle = await loadBundle(bundleRoot);
  // An explicit choice wins; an update keeps the saved one; a first install gets both.
  const components = normalizeComponents(requestedComponents) ?? readComponents(home) ?? [...DEFAULT_COMPONENTS];
  const hostBefore = Object.fromEntries(["claude", "codex"].map((host) => [host, inspectHost({ host, home, bundle, components })]));
  if (!hostBefore.claude.present && !hostBefore.codex.present) throw new Error("Neither Claude Code nor Codex is installed on this machine.");
  const legacy = {
    outer21: bundle.migration.inventoryOuter21({ home }),
    outerV3: bundle.migration.inventoryV3({ home }),
  };
  const already = await verifyDeveloperUpgrade({ home, bundleRoot, components }).catch(() => ({ valid: false }));
  const savedNow = (() => { try { return readComponents(home); } catch { return null; } })();
  if (already.valid && JSON.stringify(savedNow) === JSON.stringify(components)) {
    writeLauncher(home);
    return { ...already, installed: true, idempotent: true, transaction: null };
  }
  const targets = managedTargets({ legacy, extra: foreignInstallTargets({ home, hostBefore }) });
  const configRoots = ["claude", "codex"]
    .filter((host) => hostBefore[host].present)
    .map(hostConfigRelative);
  const transaction = prepareTransaction({ home, targets, configRoots });
  try {
    createMissingHostConfigRoots({ home, record: transaction });
    const persistentMarketplace = targetPath(home, `.super-outer/developer-marketplace/${VERSION}`);
    removePath(persistentMarketplace);
    copyPath(path.join(bundle.root, "marketplace"), persistentMarketplace);
    writeLauncher(home);
    const hostResults = [];
    for (const host of ["claude", "codex"]) {
      hostResults.push(installHost({ host, home, marketplaceRoot: persistentMarketplace, bundle, components }));
    }
    const previousAllow = process.env.SUPER_OUTER_ALLOW_USER_HOME;
    process.env.SUPER_OUTER_ALLOW_USER_HOME = "1";
    let legacyResult;
    try { legacyResult = bundle.migration.deactivateLegacyOuter({ home }); }
    finally {
      if (previousAllow === undefined) delete process.env.SUPER_OUTER_ALLOW_USER_HOME;
      else process.env.SUPER_OUTER_ALLOW_USER_HOME = previousAllow;
    }
    const guidanceApplied = ensureGuidance({
      home,
      claudePresent: hostBefore.claude.present,
      codexPresent: hostBefore.codex.present,
      guidance: bundle.guidance,
    });
    if (hostBefore.claude.present) {
      atomicText(targetPath(home, ".claude/commands/outer.md"), fs.readFileSync(path.join(bundle.payloadRoot, "commands", "outer.md"), "utf8"), 0o600);
    }
    const roles = hostBefore.codex.present ? installCodexRoles({ home, payloadRoot: bundle.payloadRoot }) : [];
    const owner = {
      schemaVersion: 1,
      activeOwner: "super-outer-v4",
      exactlyOneOwner: true,
      sideBySide: false,
      version: VERSION,
      outer21Archive: legacyResult.outer21.archive,
      outerV3Archive: legacyResult.outerV3.archive,
    };
    atomicJson(targetPath(home, ".super-outer/active-enforcement.json"), owner);
    atomicJson(targetPath(home, COMPONENTS_FILE), { schema_version: "1.0.0", version: VERSION, components });
    const receipt = {
      schema_version: "1.0.0",
      status: "INSTALLED",
      version: VERSION,
      installed_at: new Date().toISOString(),
      transaction_id: transaction.id,
      transaction_directory: transaction.directory,
      hosts: hostResults,
      components,
      legacy: legacyResult,
      codex_roles: roles,
      design_system_authority: "repository-native",
      guidance: guidanceApplied,
      cursor_touched: false,
      rollback: "Run Roll Back Super-outer.command from the same unzipped package.",
    };
    atomicJson(targetPath(home, ".super-outer/developer-upgrade-receipt.json"), receipt);
    atomicText(targetPath(home, ".super-outer/developer-upgrade-receipt.txt"), [
      `Super-outer v${VERSION} is installed.`,
      `Optional parts: ${describeComponents(components)}.`,
      "OUTER 2.1 and v3 are inactive and retained in separate recovery archives.",
      "The repository's own design system remains authoritative.",
      "Cursor was not read or changed.",
      `Recovery transaction: ${transaction.directory}`,
      "Restart Claude Code and Codex before the next task.",
      "",
    ].join("\n"), 0o600);
    const completed = { ...transaction, status: "COMPLETED", completed_at: new Date().toISOString() };
    atomicJson(path.join(transaction.directory, "record.json"), completed);
    atomicJson(targetPath(home, ".super-outer/latest-developer-upgrade.json"), {
      schema_version: "1.0.0", id: transaction.id, directory: transaction.directory, status: "COMPLETED",
    });
    const verification = await verifyDeveloperUpgrade({ home, bundleRoot, components });
    if (!verification.valid) throw new Error(`Final verification failed: ${verification.failures.join(", ")}`);
    return { ...verification, installed: true, idempotent: false, transaction: transaction.id, receipt };
  } catch (error) {
    restoreTransaction({ home, record: transaction, status: "FAILED_ROLLED_BACK" });
    throw error;
  }
};

export const rollbackDeveloperUpgrade = async ({ home: requestedHome, bundleRoot = defaultBundleRoot, yes = false } = {}) => {
  assertRuntime();
  await loadBundle(bundleRoot);
  const home = resolveHome({ home: requestedHome, yes, mutation: true });
  const latestFile = targetPath(home, ".super-outer/latest-developer-upgrade.json");
  if (!fs.existsSync(latestFile)) return { rolledBack: false, idempotent: true, reason: "No developer upgrade transaction was found." };
  const latest = JSON.parse(fs.readFileSync(latestFile, "utf8"));
  const recordFile = path.join(latest.directory, "record.json");
  if (!fs.existsSync(recordFile)) throw new Error("The developer upgrade recovery record is missing.");
  const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  if (["ROLLED_BACK", "FAILED_ROLLED_BACK"].includes(record.status)) {
    return { rolledBack: record.status === "ROLLED_BACK", idempotent: true, transaction: record.id };
  }
  if (record.status !== "COMPLETED") throw new Error(`The latest developer upgrade is not recoverable from status ${record.status}.`);
  restoreTransaction({ home, record, status: "ROLLED_BACK" });
  atomicJson(targetPath(home, ".super-outer/last-developer-rollback.json"), {
    schema_version: "1.0.0", status: "ROLLED_BACK", transaction: record.id, rolled_back_at: new Date().toISOString(),
    legacy_archives_retained: true,
  });
  return { rolledBack: true, idempotent: false, transaction: record.id, restoredTargets: record.targets.length, legacyArchivesRetained: true };
};

/** The chosen components in words a person reads in the receipt. */
export const describeComponents = (components = []) => (components.includes("skills") ? "the learning skills" : "none");

const plainResult = (command, result) => {
  if (command === "install") {
    return result.idempotent
      ? `Super-outer v${VERSION} was already the only active version. Nothing needed changing.`
      : [
          `Super-outer v${VERSION} is installed globally.`,
          `Optional parts installed: ${describeComponents(result.components)}.`,
          "OUTER 2.1 and v3 are inactive but safely retained.",
          "The repository's own design system remains authoritative.",
          "Cursor was not touched.",
          "Restart Claude Code and Codex before the next task.",
        ].join("\n");
  }
  if (command === "verify") return result.valid
    ? `PASS — Super-outer v${VERSION} is the only active OUTER version. Repository-native design rules remain enforced.`
    : `NEEDS ATTENTION — ${result.failures.join(", ")}`;
  return result.rolledBack
    ? "The previous global agent configuration was restored. Retained OUTER archives were kept."
    : result.reason || "Nothing needed rolling back.";
};

const invokedPath = process.argv[1] ? fs.realpathSync(path.resolve(process.argv[1])) : null;
const runtimePath = fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedPath === runtimePath) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const options = { home: args.home, bundleRoot: args.bundle || defaultBundleRoot, yes: args.yes, components: args.components };
    const result = args.command === "install"
      ? await installDeveloperUpgrade(options)
      : args.command === "rollback"
        ? await rollbackDeveloperUpgrade(options)
        : await verifyDeveloperUpgrade(options);
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${plainResult(args.command, result)}\n`);
    if (args.command === "verify" && !result.valid) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`STOP — ${error.message}\n`);
    process.exitCode = 1;
  }
}
