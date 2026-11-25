/**
 * The installed skills each host can load, read from disk, for the skill picker.
 *
 * This file serves the tool check, Codex and the offline evaluation. A skill is a folder holding SKILL.md; a plugin's
 * skills carry the plugin's name as a prefix, as Claude Code names them.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseSkillMd } from "./skill-picker.mjs";

/** Every SKILL.md one level below `root`, following symbolic links to folders. */
export function readSkillFolder(root, prefix = "") {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(root, entry.name, "SKILL.md");
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const skill = parseSkillMd(text, entry.name);
    if (!skill) continue;
    skills.push({ ...skill, name: prefix ? `${prefix}:${skill.name}` : skill.name, path: file });
  }
  return skills;
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/**
 * Claude Code's skills: the person's own folder and every enabled plugin's
 * skills folder, at the newest installed version. Synced plugins from
 * claude.ai are included when their folder holds skills.
 */
export function claudeCodeRoster(home = os.homedir()) {
  const claude = path.join(home, ".claude");
  const skills = [...readSkillFolder(path.join(claude, "skills"))];
  const enabled = readJson(path.join(claude, "settings.json"))?.enabledPlugins ?? {};
  const installed = readJson(path.join(claude, "plugins", "installed_plugins.json"))?.plugins ?? {};
  for (const [id, on] of Object.entries(enabled)) {
    if (!on) continue;
    const records = installed[id] ?? [];
    const record = records.find((one) => one.scope === "user") ?? records[0];
    if (!record?.installPath) continue;
    skills.push(...readSkillFolder(path.join(record.installPath, "skills"), id.split("@")[0]));
  }
  const synced = path.join(claude, "plugins", "synced");
  for (const account of safeList(synced)) {
    for (const plugin of safeList(path.join(synced, account))) {
      // A synced plugin's folder may be named by an id; its manifest holds the name Claude Code shows.
      const manifest = readJson(path.join(synced, account, plugin, ".claude-plugin", "plugin.json"));
      const name = typeof manifest?.name === "string" ? manifest.name : plugin.replace(/~.*$/, "");
      skills.push(...readSkillFolder(path.join(synced, account, plugin, "skills"), name));
    }
  }
  return unique(skills);
}

/** Codex reads the shared agent skills folder and its own. */
export function codexRoster(home = os.homedir()) {
  return unique([...readSkillFolder(path.join(home, ".agents", "skills")), ...readSkillFolder(path.join(home, ".codex", "skills"))]);
}

/** Hermes keeps its skills in one folder. */
export function hermesRoster(home = os.homedir()) {
  return unique(readSkillFolder(path.join(home, ".hermes", "skills")));
}

function safeList(folder) {
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function unique(skills) {
  const seen = new Set();
  return skills.filter((skill) => (seen.has(skill.name) ? false : (seen.add(skill.name), true)));
}
