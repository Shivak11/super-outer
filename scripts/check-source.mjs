import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", "node_modules", "dist", "coverage"]);
const checkedExtensions = new Set([".mjs", ".json", ".md", ".yaml", ".yml", ".toml"]);

const walk = (directory) =>
  readdirSync(directory)
    .flatMap((name) => {
      if (ignored.has(name)) return [];
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

const files = walk(root).filter((path) => checkedExtensions.has(extname(path)));
const failures = [];

for (const path of files) {
  const display = relative(root, path);
  const content = readFileSync(path, "utf8");
  if (!content.endsWith("\n") || content.endsWith("\n\n")) {
    failures.push(`${display}: expected exactly one final newline`);
  }
  if (extname(path) === ".json") {
    try {
      JSON.parse(content);
    } catch (error) {
      failures.push(`${display}: invalid JSON: ${error.message}`);
    }
  }
  if (extname(path) === ".mjs") {
    const result = spawnSync(process.execPath, ["--check", path], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      failures.push(`${display}: syntax check failed\n${result.stderr.trim()}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Source checks passed for ${files.length} files.`);
