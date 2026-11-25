#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyManagedGuidance } from "../src/managed-guidance.mjs";

export const V3_RELATIVE_PATHS = [
  ".claude/skills/plain-language-engineering-loop",
  ".agents/skills/plain-language-engineering-loop",
  ".codex/skills/plain-language-engineering-loop",
  ".claude/commands/outer.md"
];

const OUTER_21_SKILL_ROOTS = [
  ".claude/skills",
  ".agents/skills",
  ".codex/skills"
];

export const V3_SETTINGS_PATHS = [
  ".claude/settings.json",
  ".agents/settings.json",
  ".codex/settings.json",
  ".codex/hooks.json"
];

export const V3_GUIDANCE_PATHS = [
  ".claude/CLAUDE.md",
  ".codex/AGENTS.md"
];

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const hashPath = (target) => {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to snapshot symbolic link: ${target}`);
  if (stat.isFile()) return sha256(fs.readFileSync(target));
  if (!stat.isDirectory()) return sha256(Buffer.from(`${stat.mode}:${stat.size}`));
  const hash = crypto.createHash("sha256");
  for (const entry of fs.readdirSync(target).sort()) {
    hash.update(entry);
    hash.update(hashPath(path.join(target, entry)));
  }
  return hash.digest("hex");
};

const copyPath = (source, destination) => {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    for (const entry of fs.readdirSync(source)) copyPath(path.join(source, entry), path.join(destination, entry));
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  }
};

const parseSettings = (filename) => {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) { throw new Error(`Cannot parse settings JSON at ${filename}: ${error.message}`); }
};

const containsV3Hook = (value) => {
  try {
    const text = JSON.stringify(value).toLowerCase();
    return text.includes("plain-language-engineering-loop") || text.includes("outer-pre-mutation-gate") || text.includes("outer-interview-trigger") || text.includes("outer-confirmation-stop");
  } catch { return false; }
};

const stripV3Hooks = (value, removed) => {
  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) {
      if (item && typeof item === "object" && typeof item.command === "string" && containsV3Hook(item.command)) {
        removed.push(item);
        continue;
      }
      const filtered = stripV3Hooks(item, removed);
      if (filtered && typeof filtered === "object" && Array.isArray(filtered.hooks) && filtered.hooks.length === 0) continue;
      next.push(filtered);
    }
    return next;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stripV3Hooks(child, removed)]));
  }
  return value;
};

const atomicJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
};

const atomicText = (filename, value) => {
  const temporary = `${filename}.${process.pid}.tmp`;
  const mode = fs.statSync(filename).mode & 0o777;
  fs.writeFileSync(temporary, value, { mode });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, mode);
};

const replaceSection = (source, startMarker, endMarker, replacement) => {
  const start = source.indexOf(startMarker);
  if (start < 0) return { changed: false, text: source };
  const end = endMarker
    ? source.indexOf(endMarker, start + startMarker.length)
    : source.indexOf("\n## ", start + startMarker.length);
  const sectionEnd = endMarker
    ? (end < 0 ? -1 : end + endMarker.length)
    : (end < 0 ? source.length : end);
  if (sectionEnd < 0) throw new Error(`Cannot find the end of recognised v3 guidance: ${startMarker}`);
  const suffix = source.slice(sectionEnd);
  const separator = suffix && !suffix.startsWith("\n") ? "\n" : "";
  return { changed: true, text: `${source.slice(0, start)}${replacement}${separator}${suffix}` };
};

const replaceAllSections = (source, startMarker, endMarker, replacement) => {
  let text = source;
  let count = 0;
  while (text.includes(startMarker)) {
    const result = replaceSection(text, startMarker, endMarker, count === 0 ? replacement : "");
    if (!result.changed) break;
    text = result.text;
    count += 1;
  }
  return { changed: count > 0, text, count };
};

/**
 * Removes the v3 section and writes nothing in its place.
 *
 * This file used to carry its own copy of the replacement guidance, a third
 * copy beside the installer's and `src/managed-guidance.mjs`. They drifted, as
 * duplicated prose does. The installer's managed block runs immediately after
 * migration and owns that text; there is now exactly one copy of it.
 */
const replaceV3Guidance = (relative, source) => {
  if (relative === ".claude/CLAUDE.md") {
    return replaceAllSections(source, "## OUTER v3 — senior-engineer control before material work", null, "");
  }
  if (relative === ".codex/AGENTS.md") {
    return replaceAllSections(source, "<outer-v3>", "</outer-v3>", "");
  }
  return { changed: false, text: source };
};

const isV3Installation = ({ relative, path: filename }) => {
  if (relative !== ".claude/commands/outer.md") {
    return !isOuter21Skill(filename);
  }
  const source = fs.readFileSync(filename, "utf8");
  return /plain-language-engineering-loop|OUTER v3|APPROVE OUTER-/i.test(source);
};

const isOuter21Skill = (directory) => {
  const skill = path.join(directory, "SKILL.md");
  if (!fs.existsSync(skill) || !fs.lstatSync(skill).isFile()) return false;
  return /Version(?:\s*:\s*|\s+)`?2\.1(?:\.0)?\b/i.test(fs.readFileSync(skill, "utf8"));
};

export const inventoryOuter21 = ({ home }) => {
  if (!home) throw new Error("OUTER 2.1 inventory requires an explicit home");
  const absoluteHome = path.resolve(home);
  const installations = [];
  for (const rootRelative of OUTER_21_SKILL_ROOTS) {
    const root = path.join(absoluteHome, rootRelative);
    if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) continue;
    for (const name of fs.readdirSync(root).sort()) {
      if (name !== "plain-language-engineering-loop" && !name.startsWith("plain-language-engineering-loop.backup-")) continue;
      const filename = path.join(root, name);
      const stat = fs.lstatSync(filename);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !isOuter21Skill(filename)) continue;
      installations.push({
        relative: path.join(rootRelative, name),
        path: filename,
        exists: true,
        sha256: hashPath(filename)
      });
    }
  }
  return { schemaVersion: 1, detected: installations.length > 0, installations };
};

export const inventoryV3 = ({ home }) => {
  if (!home) throw new Error("v3 inventory requires an explicit home");
  const absoluteHome = path.resolve(home);
  const installations = V3_RELATIVE_PATHS.map((relative) => ({
    relative,
    path: path.join(absoluteHome, relative),
    exists: fs.existsSync(path.join(absoluteHome, relative))
  })).filter((entry) => entry.exists && isV3Installation(entry)).map((entry) => ({ ...entry, sha256: hashPath(entry.path) }));
  const settings = V3_SETTINGS_PATHS.map((relative) => ({ relative, path: path.join(absoluteHome, relative) }))
    .filter((entry) => fs.existsSync(entry.path))
    .map((entry) => {
      const content = parseSettings(entry.path);
      return { ...entry, sha256: hashPath(entry.path), hasV3Hooks: containsV3Hook(content) };
    });
  const guidance = V3_GUIDANCE_PATHS.map((relative) => ({ relative, path: path.join(absoluteHome, relative) }))
    .filter((entry) => fs.existsSync(entry.path))
    .map((entry) => {
      const content = fs.readFileSync(entry.path, "utf8");
      const hasV3Guidance = replaceV3Guidance(entry.relative, content).changed;
      return { ...entry, sha256: hashPath(entry.path), hasV3Guidance };
    });
  return {
    schemaVersion: 1,
    detected: installations.length > 0 || settings.some((entry) => entry.hasV3Hooks) || guidance.some((entry) => entry.hasV3Guidance),
    installations,
    settings,
    guidance
  };
};

const snapshotInventory = ({ home, label, inventory, entries, destination }) => {
  const absoluteHome = path.resolve(home);
  const identity = sha256(Buffer.from(JSON.stringify(entries.map(({ relative, sha256: digest }) => ({ relative, sha256: digest }))))).slice(0, 16);
  const target = path.resolve(destination || path.join(absoluteHome, ".super-outer", "legacy-archives", label, identity));
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    for (const entry of entries) copyPath(entry.path, path.join(target, "files", entry.relative));
    atomicJson(path.join(target, "manifest.json"), {
      schemaVersion: 1,
      legacyVersion: label,
      identity,
      active: false,
      files: entries.map(({ relative, sha256: digest }) => ({ relative, sha256: digest }))
    });
  }
  const verified = entries.every((entry) => {
    const archived = path.join(target, "files", entry.relative);
    return fs.existsSync(archived) && hashPath(archived) === entry.sha256;
  });
  if (!verified) throw new Error(`${label} archive verification failed`);
  return { ...inventory, snapshot: target, identity, verified };
};

export const snapshotV3 = ({ home, destination }) => {
  const inventory = inventoryV3({ home });
  const entries = [...inventory.installations, ...inventory.settings, ...inventory.guidance];
  return snapshotInventory({ home, label: "outer-v3", inventory, entries, destination });
};

export const snapshotOuter21 = ({ home, destination }) => {
  const inventory = inventoryOuter21({ home });
  return snapshotInventory({ home, label: "outer-2.1", inventory, entries: inventory.installations, destination });
};

export const disableV3Hooks = ({ home }) => {
  const absoluteHome = path.resolve(home);
  const changes = [];
  for (const relative of V3_SETTINGS_PATHS) {
    const filename = path.join(absoluteHome, relative);
    if (!fs.existsSync(filename)) continue;
    const settings = parseSettings(filename);
    const removed = [];
    const filtered = stripV3Hooks(settings, removed);
    if (removed.length) {
      atomicJson(filename, filtered);
      changes.push({ relative, removed: removed.length, removedHash: sha256(Buffer.from(JSON.stringify(removed))) });
    }
  }
  for (const relative of V3_GUIDANCE_PATHS) {
    const filename = path.join(absoluteHome, relative);
    if (!fs.existsSync(filename)) continue;
    const source = fs.readFileSync(filename, "utf8");
    const replacement = replaceV3Guidance(relative, source);
    if (!replacement.changed) continue;
    atomicText(filename, replacement.text);
    // Removing v3 must not leave a host with no guidance at all. The managed
    // block is the single owner of that text and is safe to apply twice.
    applyManagedGuidance(filename);
    changes.push({ relative, removed: replacement.count, removedHash: sha256(Buffer.from(source)) });
  }
  return { changed: changes.length > 0, files: changes };
};

const retainOutsideDiscovery = ({ snapshot, entries }) => {
  const moved = [];
  for (const entry of entries) {
    if (!fs.existsSync(entry.path)) continue;
    if (fs.lstatSync(entry.path).isSymbolicLink()) throw new Error(`Refusing to deactivate symbolic link: ${entry.path}`);
    let generation = 1;
    let destination = path.join(snapshot.snapshot, "retained", entry.relative);
    while (fs.existsSync(destination)) {
      if (hashPath(destination) !== entry.sha256) {
        throw new Error(`Legacy retained destination has unexpected content: ${destination}`);
      }
      generation += 1;
      destination = path.join(snapshot.snapshot, `retained-${generation}`, entry.relative);
    }
    const archived = path.join(snapshot.snapshot, "files", entry.relative);
    if (!fs.existsSync(archived) || hashPath(archived) !== entry.sha256) {
      throw new Error(`Legacy archive changed before deactivation: ${entry.relative}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.renameSync(entry.path, destination);
    if (hashPath(destination) !== entry.sha256) throw new Error(`Legacy retained copy changed during deactivation: ${entry.relative}`);
    moved.push({ relative: entry.relative, retained: destination, sha256: entry.sha256 });
  }
  return moved;
};

export const deactivateLegacyOuter = ({ home, v3Snapshot, outer21Snapshot } = {}) => {
  if (!home) throw new Error("Legacy OUTER deactivation requires an explicit home");
  const selectedHome = path.resolve(home);
  if (!fs.existsSync(selectedHome)) throw new Error("Legacy OUTER deactivation home does not exist");
  if (fs.lstatSync(selectedHome).isSymbolicLink()) throw new Error("Legacy OUTER deactivation home cannot be a symbolic link");
  const canonicalHome = fs.realpathSync(selectedHome);
  const canonicalUserHome = fs.realpathSync(os.homedir());
  if (canonicalHome === canonicalUserHome && process.env.SUPER_OUTER_ALLOW_USER_HOME !== "1") {
    throw new Error("Refusing to deactivate legacy OUTER in the real user home without SUPER_OUTER_ALLOW_USER_HOME=1");
  }
  const v3 = inventoryV3({ home: canonicalHome });
  const outer21 = inventoryOuter21({ home: canonicalHome });
  const archivedV3 = v3Snapshot || (v3.detected ? snapshotV3({ home: canonicalHome }) : null);
  const archived21 = outer21Snapshot || (outer21.detected ? snapshotOuter21({ home: canonicalHome }) : null);
  const disabled = disableV3Hooks({ home: canonicalHome });
  const retiredV3 = archivedV3 ? retainOutsideDiscovery({ snapshot: archivedV3, entries: v3.installations }) : [];
  const retired21 = archived21 ? retainOutsideDiscovery({ snapshot: archived21, entries: outer21.installations }) : [];
  const afterV3 = inventoryV3({ home: canonicalHome });
  const after21 = inventoryOuter21({ home: canonicalHome });
  if (afterV3.detected || after21.detected) throw new Error("A legacy OUTER version remains active or discoverable after deactivation");
  return {
    changed: disabled.changed || retiredV3.length > 0 || retired21.length > 0,
    activeOwner: "super-outer-v4",
    outer21: { detected: outer21.detected, archive: archived21?.snapshot || null, retained: retired21 },
    outerV3: { detected: v3.detected, archive: archivedV3?.snapshot || null, retained: retiredV3, disabled: disabled.files },
    cursorChanged: false
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const home = process.argv[2];
    const result = process.argv.includes("--deactivate-legacy")
      ? deactivateLegacyOuter({ home })
      : process.argv.includes("--snapshot-2.1")
        ? snapshotOuter21({ home })
        : process.argv.includes("--snapshot")
          ? snapshotV3({ home })
          : { outer21: inventoryOuter21({ home }), outerV3: inventoryV3({ home }) };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
