#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { crc32, digestFiles, listOptionalPluginFiles, listPackageFiles } from "../scripts/build-package.mjs";
import { MARKETPLACE, OPTIONAL_PLUGINS, PAYLOAD_DIGEST, VERSION } from "./runtime/developer-upgrade.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(scriptDirectory);
export const DEVELOPER_PACKAGE_NAME = `Super-outer-Developer-Update-${VERSION}-macOS.zip`;
const BUNDLE_DIRECTORY = `Super-outer-Developer-Update-${VERSION}`;
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x21;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (filename) => sha256(fs.readFileSync(filename));

const payloadFiles = (root) => listPackageFiles(root)
  .filter((file) => !file.relative.startsWith("developer-update/"));

/**
 * The payload is the repository minus this packaging directory, so the digest
 * is stable across changes to the installer that carries it. Exported because
 * the digest must be computed exactly one way: `digestPackageTree` covers the
 * whole tree and would silently disagree.
 */
export const developerPayloadDigest = (root = defaultRoot) => payloadDigest(payloadFiles(fs.realpathSync(root)));

const payloadDigest = (files) => {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file.absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const jsonBuffer = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

/**
 * Assets carry a version token rather than a typed number. A package once
 * shipped as 5.4.1 while every line the reader saw said 4.0.3; substituting at
 * build time makes that class of drift impossible rather than merely unlikely.
 */
export const VERSION_TOKEN = "__SUPER_OUTER_VERSION__";
const stampVersion = (data) => Buffer.from(data.toString("utf8").split(VERSION_TOKEN).join(VERSION), "utf8");

const assetEntries = () => fs.readdirSync(path.join(scriptDirectory, "assets"), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((entry) => ({
    relative: entry.name,
    data: stampVersion(fs.readFileSync(path.join(scriptDirectory, "assets", entry.name))),
    mode: entry.name.endsWith(".command") ? 0o100755 : 0o100644,
  }));

/** The commit the payload was taken from, or "unknown" outside a checkout. */
const payloadCommit = (root) => {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  const head = result.status === 0 ? result.stdout.trim() : "";
  return /^[a-f0-9]{40}$/.test(head) ? head : "unknown";
};

/**
 * Each optional plugin's files, version and tree digest. The digest is written
 * into the package manifest so the installer can recognise an installed copy
 * as exactly this one, the same way the core payload is recognised.
 */
export const optionalPlugins = (root = defaultRoot) => Object.keys(OPTIONAL_PLUGINS).map((name) => {
  const files = listOptionalPluginFiles(root, name);
  const manifest = files.find((file) => file.relative === ".claude-plugin/plugin.json");
  if (!manifest) throw new Error(`The optional plugin ${name} has no .claude-plugin/plugin.json.`);
  const plugin = JSON.parse(fs.readFileSync(manifest.absolute, "utf8"));
  if (plugin.name !== name) throw new Error(`optional/${name}/.claude-plugin/plugin.json names ${plugin.name}.`);
  return { name, version: plugin.version, description: plugin.description, files, digest: digestFiles(files), hosts: OPTIONAL_PLUGINS[name].hosts };
});

const marketplaceEntries = (optional) => [
  {
    relative: "marketplace/.claude-plugin/marketplace.json",
    mode: 0o100644,
    data: jsonBuffer({
      name: MARKETPLACE,
      owner: { name: "Shiva Kakkar" },
      description: "Self-contained Super-outer developer update.",
      plugins: [{
        name: "super-outer",
        version: VERSION,
        source: "./plugins/super-outer",
        description: "Plain-English, balanced, repository-native engineering review.",
        category: "Development",
        tags: ["engineering-review", "repository-native-design", "progressive-disclosure"],
      }, ...optional.filter((plugin) => plugin.hosts.includes("claude")).map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        source: `./plugins/${plugin.name}`,
        description: plugin.description,
        category: "Development",
      }))],
    }),
  },
  {
    relative: "marketplace/.agents/plugins/marketplace.json",
    mode: 0o100644,
    data: jsonBuffer({
      name: MARKETPLACE,
      interface: { displayName: "Super-outer Developer Update" },
      plugins: [{
        name: "super-outer",
        source: { source: "local", path: "./plugins/super-outer" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      }, ...optional.filter((plugin) => plugin.hosts.includes("codex")).map((plugin) => ({
        name: plugin.name,
        source: { source: "local", path: `./plugins/${plugin.name}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      }))],
    }),
  },
];

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

const endRecord = ({ count, size, offset }) => {
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

const buildZip = (entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = `${BUNDLE_DIRECTORY}/${entry.relative}`;
    const crc = crc32(entry.data);
    const local = localHeader({ name, crc, size: entry.data.length });
    localParts.push(local, entry.data);
    centralParts.push(centralHeader({ name, crc, size: entry.data.length, offset, mode: entry.mode }));
    offset += local.length + entry.data.length;
  }
  const central = Buffer.concat(centralParts);
  return Buffer.concat([...localParts, central, endRecord({ count: centralParts.length, size: central.length, offset })]);
};

export const buildDeveloperPackage = ({ root = defaultRoot, outputDir } = {}) => {
  const absoluteRoot = fs.realpathSync(root);
  const payload = payloadFiles(absoluteRoot);
  const actualPayloadDigest = payloadDigest(payload);
  if (actualPayloadDigest !== PAYLOAD_DIGEST) {
    throw new Error(
      `The source has changed since the payload digest was pinned for v${VERSION}. ` +
      "Run `npm run sync:digest` and commit the updated digest alongside your change. " +
      `Expected ${PAYLOAD_DIGEST}, found ${actualPayloadDigest}.`,
    );
  }
  const optional = optionalPlugins(absoluteRoot);
  const entries = [
    ...assetEntries(),
    {
      relative: "runtime/developer-upgrade.mjs",
      data: fs.readFileSync(path.join(scriptDirectory, "runtime", "developer-upgrade.mjs")),
      mode: 0o100755,
    },
    ...marketplaceEntries(optional),
    ...payload.map((file) => ({
      relative: `marketplace/plugins/super-outer/${file.relative}`,
      data: fs.readFileSync(file.absolute),
      mode: file.stat.mode & 0o111 ? 0o100755 : 0o100644,
    })),
    ...optional.flatMap((plugin) => plugin.files.map((file) => ({
      relative: `marketplace/plugins/${plugin.name}/${file.relative}`,
      data: fs.readFileSync(file.absolute),
      mode: file.stat.mode & 0o111 ? 0o100755 : 0o100644,
    }))),
  ].sort((a, b) => a.relative.localeCompare(b.relative));
  const files = Object.fromEntries(entries.map((entry) => [entry.relative, sha256(entry.data)]));
  entries.push({
    relative: "PACKAGE-MANIFEST.json",
    mode: 0o100644,
    data: jsonBuffer({
      schema_version: "1.0.0",
      name: "super-outer-developer-update",
      version: VERSION,
      platform: "macOS",
      payload_commit: payloadCommit(absoluteRoot),
      payload_digest: PAYLOAD_DIGEST,
      optional_plugins: Object.fromEntries(optional.map((plugin) => [plugin.name, { version: plugin.version, digest: plugin.digest }])),
      design_system_authority: "repository-native",
      cursor_managed: false,
      files,
    }),
  });
  entries.sort((a, b) => a.relative.localeCompare(b.relative));
  const archive = buildZip(entries);
  const directory = path.resolve(outputDir || path.join(absoluteRoot, "dist", "developer-update"));
  const destination = path.join(directory, DEVELOPER_PACKAGE_NAME);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, archive, { mode: 0o644 });
  fs.renameSync(temporary, destination);
  const digest = sha256File(destination);
  const checksum = `${destination}.sha256`;
  fs.writeFileSync(checksum, `${digest}  ${path.basename(destination)}\n`, { mode: 0o644 });
  return {
    package: destination,
    checksum,
    sha256: digest,
    files: entries.length,
    bytes: archive.length,
    payloadDigest: actualPayloadDigest,
  };
};

const invokedPath = process.argv[1] ? fs.realpathSync(path.resolve(process.argv[1])) : null;
const buildScriptPath = fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedPath === buildScriptPath) {
  try { process.stdout.write(`${JSON.stringify(buildDeveloperPackage(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
