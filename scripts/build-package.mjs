#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.dirname(SCRIPT_DIR);
export const PACKAGE_NAME = "super-outer-6.6.0.zip";
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x21;
const EXCLUDED_SEGMENTS = new Set([".git", ".engineering", "node_modules", "dist", "coverage", ".cache"]);
const SENSITIVE_BASENAMES = new Set([
  ".env",
  ".envrc",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "auth.json",
  "oauth.json",
  "token.json",
]);
const SENSITIVE_EXTENSIONS = new Set([".jks", ".key", ".keystore", ".p12", ".pfx", ".pem"]);
const CREDENTIAL_CONTENT_PATTERNS = Object.freeze([
  Object.freeze({
    label: "GitHub access token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/,
  }),
  Object.freeze({
    label: "Stripe live secret",
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
  }),
  Object.freeze({
    label: "AWS access-key id",
    pattern: /\b(?:A3T|AGPA|AIDA|AIPA|AKIA|ANPA|ANVA|AROA|ASIA)[A-Z0-9]{16}\b/,
  }),
  Object.freeze({
    label: "AWS secret access key",
    pattern: /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}\b/,
  }),
  Object.freeze({
    label: "Slack access token",
    pattern: /\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|xapp-\d-[A-Za-z0-9-]{10,})\b/,
  }),
]);
/**
 * Optional plugins that ship beside the core plugin. Each is packaged into the
 * developer marketplace on its own, so the core payload never carries them and
 * its pinned digest does not move when one of them changes.
 */
export const OPTIONAL_PLUGIN_DIRECTORY = "optional";

// The root plugin.json is the Agent Plugins manifest. It stays in the
// repository, but an installed copy must not carry it: Codex reads a plugin
// that has one through a loader that takes skills and MCP but no hooks, so
// Super-outer's hooks never ran in Codex (scripts/check-codex-hooks.mjs).
const repositoryOnly = (relative) =>
  relative === "plugin.json" ||
  relative === OPTIONAL_PLUGIN_DIRECTORY ||
  relative.startsWith(`${OPTIONAL_PLUGIN_DIRECTORY}/`) ||
  relative === "AGENTS.md" ||
  relative === "docs/v3-capability-ledger.md" ||
  relative === "docs/plans" ||
  relative.startsWith("docs/plans/");

const sensitivePackagePath = (relative) => {
  const basename = path.posix.basename(relative).toLowerCase();
  if (SENSITIVE_BASENAMES.has(basename) || basename.startsWith(".env.")) return true;
  if (SENSITIVE_EXTENSIONS.has(path.posix.extname(basename))) return true;
  return /(?:^|[-_.])(?:api[-_.]?key|credentials?|private[-_.]?key|secrets?|service[-_.]?account)(?:[-_.]|$)/i.test(basename);
};

const assertNonSensitiveBuffer = (buffer, relative) => {
  const content = buffer.toString("utf8");
  if (/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/.test(content)) {
    throw new Error(`Package source contains private-key material: ${relative}`);
  }
  for (const credential of CREDENTIAL_CONTENT_PATTERNS) {
    if (credential.pattern.test(content)) {
      throw new Error(`Package source contains ${credential.label}: ${relative}`);
    }
  }
};

const assertNonSensitiveContent = (filename, relative) =>
  assertNonSensitiveBuffer(fs.readFileSync(filename), relative);

/**
 * Files Claude Code writes into a plugin folder it has installed: the record of
 * which sessions use the plugin, and the type files and `tsconfig.json` it lays
 * beside a mod each time it loads one. They are not part of any package, so an
 * installed copy must digest to the same value with or without them.
 */
export const hostWrittenPath = (relative) =>
  relative === ".in_use" || relative.startsWith(".in_use/") ||
  relative === ".orphaned_at" ||
  relative === ".claude-plugin/types" || relative.startsWith(".claude-plugin/types/") ||
  relative === "tsconfig.json";

const excludedPackagePath = (relative) => {
  const segments = relative.split("/");
  return segments.some((segment) => EXCLUDED_SEGMENTS.has(segment)) || hostWrittenPath(relative) ||
    segments.includes(".DS_Store") || relative.endsWith(".tmp") ||
    repositoryOnly(relative) || sensitivePackagePath(relative);
};

const trackedFiles = (absoluteRoot) => {
  const marker = path.join(absoluteRoot, ".git");
  if (!fs.existsSync(marker)) return null;
  const topLevel = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: absoluteRoot,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
  });
  if (topLevel.status !== 0) {
    throw new Error(`Cannot establish tracked package files: ${(topLevel.stderr || topLevel.stdout || "git unavailable").trim()}`);
  }
  if (fs.realpathSync(topLevel.stdout.trim()) !== absoluteRoot) {
    throw new Error("Package root must be the Git worktree root");
  }
  const listed = spawnSync("git", ["ls-files", "--cached", "-z"], {
    cwd: absoluteRoot,
    encoding: "buffer",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
  });
  if (listed.status !== 0) {
    throw new Error(`Cannot list tracked package files: ${String(listed.stderr || listed.stdout || "git unavailable").trim()}`);
  }
  return listed.stdout.toString("utf8").split("\0").filter(Boolean).sort((a, b) => a.localeCompare(b));
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    table[value] = current >>> 0;
  }
  return table;
})();

export const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const sha256File = (filename) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filename));
  return hash.digest("hex");
};

const packageMode = (relative, stat) => {
  if (stat.mode & 0o111) return 0o100755;
  if (/^(?:bin|hooks|scripts)\//.test(relative) && relative.endsWith(".mjs")) return 0o100755;
  return 0o100644;
};

export const listPackageFiles = (root = DEFAULT_ROOT) => {
  const absoluteRoot = fs.realpathSync(root);
  const tracked = trackedFiles(absoluteRoot);
  if (tracked) {
    return tracked.filter((relative) => {
      if (sensitivePackagePath(relative)) throw new Error(`Tracked package source looks sensitive: ${relative}`);
      // A shipped file at a path Claude Code also writes would vanish from every digest.
      if (hostWrittenPath(relative)) throw new Error(`Tracked package source uses a path Claude Code writes into installed plugins: ${relative}`);
      return !excludedPackagePath(relative);
    }).map((relative) => {
      if (path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
        throw new Error(`Unsafe tracked package path: ${relative}`);
      }
      const absolute = path.join(absoluteRoot, ...relative.split("/"));
      if (!fs.existsSync(absolute)) throw new Error(`Tracked package source is missing: ${relative}`);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Package source cannot contain symbolic links: ${relative}`);
      if (!stat.isFile()) throw new Error(`Tracked package source is not a regular file: ${relative}`);
      assertNonSensitiveContent(absolute, relative);
      return { absolute, relative, stat };
    });
  }
  const files = [];
  const visit = (directory, relativeDirectory = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (excludedPackagePath(relative)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Package source cannot contain symbolic links: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) {
        assertNonSensitiveContent(absolute, relative);
        files.push({ absolute, relative, stat: fs.statSync(absolute) });
      }
    }
  };
  visit(absoluteRoot);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
};

/**
 * The files of one optional plugin, with paths relative to that plugin's own
 * folder. In a checkout only tracked files count, exactly as for the core
 * payload; elsewhere the folder is walked.
 */
export const listOptionalPluginFiles = (root = DEFAULT_ROOT, name) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name ?? ""))) throw new Error(`Unsafe optional plugin name: ${name}`);
  const absoluteRoot = fs.realpathSync(root);
  const pluginRoot = path.join(absoluteRoot, OPTIONAL_PLUGIN_DIRECTORY, name);
  if (!fs.existsSync(pluginRoot)) throw new Error(`Optional plugin is missing: ${OPTIONAL_PLUGIN_DIRECTORY}/${name}`);
  const tracked = trackedFiles(absoluteRoot);
  if (!tracked) return listPackageFiles(pluginRoot);
  const prefix = `${OPTIONAL_PLUGIN_DIRECTORY}/${name}/`;
  return tracked.filter((relative) => relative.startsWith(prefix)).map((full) => {
    const relative = full.slice(prefix.length);
    if (sensitivePackagePath(relative)) throw new Error(`Tracked package source looks sensitive: ${full}`);
    if (hostWrittenPath(relative)) throw new Error(`Tracked package source uses a path Claude Code writes into installed plugins: ${full}`);
    return relative;
  }).filter((relative) => !excludedPackagePath(relative)).map((relative) => {
    if (path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
      throw new Error(`Unsafe tracked package path: ${prefix}${relative}`);
    }
    const absolute = path.join(pluginRoot, ...relative.split("/"));
    if (!fs.existsSync(absolute)) throw new Error(`Tracked package source is missing: ${prefix}${relative}`);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Package source cannot contain symbolic links: ${prefix}${relative}`);
    if (!stat.isFile()) throw new Error(`Tracked package source is not a regular file: ${prefix}${relative}`);
    assertNonSensitiveContent(absolute, `${prefix}${relative}`);
    return { absolute, relative, stat };
  });
};

/** One digest formula for every tree, so a packaged and an installed copy compare equal. */
export const digestFiles = (files) => {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file.absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
};

export const digestPackageTree = (root = DEFAULT_ROOT) => digestFiles(listPackageFiles(root));

const localHeader = ({ name, crc, size }) => {
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30 + nameBytes.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(FIXED_DOS_TIME, 10);
  header.writeUInt16LE(FIXED_DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  nameBytes.copy(header, 30);
  return header;
};

const centralHeader = ({ name, crc, size, offset, mode }) => {
  const nameBytes = Buffer.from(name, "utf8");
  const header = Buffer.alloc(46 + nameBytes.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE((3 << 8) | 20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(FIXED_DOS_TIME, 12);
  header.writeUInt16LE(FIXED_DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(size, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(((mode & 0xffff) * 0x10000) >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  nameBytes.copy(header, 46);
  return header;
};

const endOfCentralDirectory = ({ count, size, offset }) => {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return end;
};

export const buildPackage = ({ root = DEFAULT_ROOT, outputDir, outputFile } = {}) => {
  const absoluteRoot = fs.realpathSync(root);
  const destinationDirectory = path.resolve(outputDir || path.join(absoluteRoot, "dist"));
  const destination = path.resolve(outputFile || path.join(destinationDirectory, PACKAGE_NAME));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of listPackageFiles(absoluteRoot)) {
    const name = `super-outer/${file.relative}`;
    const data = fs.readFileSync(file.absolute);
    const crc = crc32(data);
    const header = localHeader({ name, crc, size: data.length });
    localParts.push(header, data);
    centralParts.push(centralHeader({ name, crc, size: data.length, offset, mode: packageMode(file.relative, file.stat) }));
    offset += header.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const archive = Buffer.concat([...localParts, central, endOfCentralDirectory({ count: centralParts.length, size: central.length, offset })]);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, archive, { mode: 0o644 });
  fs.renameSync(temporary, destination);
  const digest = sha256File(destination);
  const checksumFile = `${destination}.sha256`;
  fs.writeFileSync(checksumFile, `${digest}  ${path.basename(destination)}\n`, { mode: 0o644 });
  return { package: destination, checksumFile, sha256: digest, files: centralParts.length, bytes: archive.length };
};

const findEnd = (archive) => {
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65557); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Package has no ZIP end record");
};

export const inspectPackage = (filename) => {
  const archive = fs.readFileSync(filename);
  const endOffset = findEnd(archive);
  const count = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (centralOffset + centralSize > endOffset) throw new Error("Package central directory is out of bounds");
  const entries = [];
  const names = new Set();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("Package central directory is corrupt");
    const method = archive.readUInt16LE(offset + 10);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (method !== 0 || compressedSize !== uncompressedSize) throw new Error(`Unsupported ZIP encoding for ${name}`);
    if (!name.startsWith("super-outer/") || name.includes("\\") || name.split("/").includes("..") || path.posix.isAbsolute(name)) {
      throw new Error(`Unsafe package entry: ${name}`);
    }
    const relative = name.slice("super-outer/".length);
    if (sensitivePackagePath(relative)) throw new Error(`Sensitive package entry: ${name}`);
    if (names.has(name)) throw new Error(`Duplicate package entry: ${name}`);
    names.add(name);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Missing local header for ${name}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataOffset, dataOffset + compressedSize);
    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) throw new Error(`Checksum mismatch for ${name}`);
    assertNonSensitiveBuffer(data, name);
    entries.push({ name, size: uncompressedSize, crc32: expectedCrc.toString(16).padStart(8, "0") });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, sha256: sha256File(filename), bytes: archive.length };
};

export const verifyPackage = ({ packageFile, checksumFile, required = [
  "super-outer/.codex-plugin/plugin.json",
  "super-outer/.claude-plugin/plugin.json",
  "super-outer/skills/super-outer/SKILL.md",
  "super-outer/hooks/hooks.json",
  "super-outer/commands/outer.md"
] } = {}) => {
  if (!packageFile) throw new Error("package verify requires a package path");
  const inspected = inspectPackage(packageFile);
  const names = new Set(inspected.entries.map((entry) => entry.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Package is missing required entries: ${missing.join(", ")}`);
  if (names.has("super-outer/plugin.json")) {
    throw new Error("Package carries the Agent Plugins root plugin.json, so Codex would load none of its hooks");
  }
  if (checksumFile) {
    const expected = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
    if (expected !== inspected.sha256) throw new Error("Package SHA256 does not match checksum file");
  }
  return { valid: true, ...inspected };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const valueAfter = (flag) => {
      const index = process.argv.indexOf(flag);
      return index >= 0 ? process.argv[index + 1] : undefined;
    };
    const positionalRoot = process.argv.slice(2).find((value) => !value.startsWith("--") && process.argv[process.argv.indexOf(value) - 1]?.startsWith("--") !== true);
    const result = process.argv.includes("--verify")
      ? verifyPackage({ packageFile: valueAfter("--verify"), checksumFile: valueAfter("--checksum") })
      : buildPackage({ root: valueAfter("--root") || positionalRoot || DEFAULT_ROOT, outputFile: valueAfter("--output"), outputDir: valueAfter("--output-dir") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
