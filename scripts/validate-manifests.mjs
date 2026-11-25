import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const failures = [];
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const codex = readJson(".codex-plugin/plugin.json");
const claude = readJson(".claude-plugin/plugin.json");

for (const [host, manifest] of Object.entries({ codex, claude })) {
  if (manifest.name !== "super-outer") failures.push(`${host}: name mismatch`);
  if (!semver.test(manifest.version ?? "")) failures.push(`${host}: invalid semver`);
  if (!manifest.description?.trim()) failures.push(`${host}: missing description`);
  if (!manifest.author?.name?.trim()) failures.push(`${host}: missing author.name`);
}

if (Object.hasOwn(codex, "hooks")) {
  failures.push("codex: hooks must use default root discovery, not a manifest field");
}
if (codex.skills !== "./skills/") failures.push("codex: skills path must be ./skills/");
for (const field of [
  "displayName",
  "shortDescription",
  "longDescription",
  "developerName",
  "category",
  "capabilities",
  "defaultPrompt",
]) {
  if (codex.interface?.[field] === undefined) {
    failures.push(`codex: missing interface.${field}`);
  }
}
if (!existsSync(resolve(root, "skills/super-outer/SKILL.md"))) {
  failures.push("skill: missing skills/super-outer/SKILL.md");
}
if (!existsSync(resolve(root, "hooks/hooks.json"))) {
  failures.push("hooks: missing default hooks/hooks.json");
}

const skill = readFileSync(resolve(root, "skills/super-outer/SKILL.md"), "utf8");
const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
if (
  !frontmatter ||
  !/^name:\s*super-outer\s*$/m.test(frontmatter) ||
  !/^description:\s*\S.+$/m.test(frontmatter)
) {
  failures.push("skill: invalid or missing frontmatter");
}
if (skill.split("\n").length > 500) failures.push("skill: SKILL.md exceeds 500 lines");

for (const manifestPath of [
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
]) {
  const content = readFileSync(resolve(root, manifestPath), "utf8");
  if (content.includes("[TODO:")) failures.push(`${manifestPath}: TODO placeholder`);
}

// Every skill folder in the core plugin follows the Agent Skills format: its
// name matches the folder, and the description fits the 1,024-character limit.
for (const entry of readdirSync(resolve(root, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const path = `skills/${entry.name}/SKILL.md`;
  if (!existsSync(resolve(root, path))) {
    failures.push(`skill: ${path} is missing`);
    continue;
  }
  const text = readFileSync(resolve(root, path), "utf8");
  const head = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
  const name = /^name:\s*(\S+)\s*$/m.exec(head)?.[1];
  const description = /^description:\s*(.+)$/m.exec(head)?.[1]?.trim() ?? "";
  if (name !== entry.name) failures.push(`skill ${entry.name}: frontmatter name must be ${entry.name}`);
  if (!/^[a-z0-9-]{1,64}$/.test(name ?? "")) failures.push(`skill ${entry.name}: name must be lowercase letters, digits and hyphens, at most 64`);
  if (!description || description.length > 1024 || /<[a-z/]/i.test(description)) failures.push(`skill ${entry.name}: description must be 1 to 1,024 characters with no XML tags`);
  if (text.split("\n").length > 500) failures.push(`skill ${entry.name}: SKILL.md exceeds 500 lines`);
}

// Optional plugins ship beside the core in the developer marketplace. Each needs
// a Claude Code manifest; the learning skills also need a Codex one.
const optionalPlugins = {
  "super-outer-learning": { codex: true, skills: ["brief-me", "meditate"] },
};
for (const [name, expected] of Object.entries(optionalPlugins)) {
  const base = `optional/${name}`;
  const manifests = { claude: `${base}/.claude-plugin/plugin.json`, ...(expected.codex ? { codex: `${base}/.codex-plugin/plugin.json` } : {}) };
  for (const [host, manifestPath] of Object.entries(manifests)) {
    if (!existsSync(resolve(root, manifestPath))) {
      failures.push(`${name}: missing ${manifestPath}`);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest.name !== name) failures.push(`${name} ${host}: name mismatch`);
    if (!semver.test(manifest.version ?? "")) failures.push(`${name} ${host}: invalid semver`);
    if (!manifest.description?.trim()) failures.push(`${name} ${host}: missing description`);
    if (host === "codex" && manifest.skills !== "./skills/") failures.push(`${name} codex: skills path must be ./skills/`);
  }
  for (const skillName of expected.skills ?? []) {
    const skillPath = resolve(root, `${base}/skills/${skillName}/SKILL.md`);
    if (!existsSync(skillPath)) {
      failures.push(`${name}: missing skills/${skillName}/SKILL.md`);
      continue;
    }
    const front = readFileSync(skillPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (!front || !new RegExp(`^name:\\s*${skillName}\\s*$`, "m").test(front) || !/^description:\s*\S.+$/m.test(front)) {
      failures.push(`${name}: skills/${skillName}/SKILL.md has invalid frontmatter`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Plugin manifests and skill entrypoint are valid.");
