/**
 * What a project depends on, read from its manifests, for the tool check in
 * skills/super-outer/references/tool-check.md.
 *
 * Every direct dependency with the version the project pins, grouped by the
 * manifest that names it, plus the platform config files present. A
 * framework whose packages always move together (`@angular/*` under
 * `@angular/core`) marks them from
 * skills/super-outer/references/catalogue/vendor-aliases.json. Expo is not
 * marked here: `super-outer tool-check run` reads Expo's own version table
 * for the pinned SDK, because a name pattern such as `react-native-*` also
 * catches packages Expo does not manage. Nothing here knows any vendor in
 * advance: an unknown dependency is listed like any other.
 *
 * Local reads of small files only. No network, no shell, never throws: a
 * manifest that is missing, too large or unparsable is listed as unread.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 512 * 1024;
const MAX_DEPTH = 3;
const MAX_PER_MANIFEST = 300;
const SKIP_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".expo", ".venv", "venv",
  "__pycache__", ".turbo", "coverage", ".worktrees", ".cache", "Pods", "vendor", "target",
]);
// Folders that hold sample or test projects, not the product. Their manifests are listed as skipped.
const SAMPLE_DIRECTORIES = new Set(["fixtures", "__fixtures__", "__mocks__", "testdata", "test-fixtures", "examples", "example", "samples"]);

export const MANIFESTS = Object.freeze(["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "Podfile"]);
export const CONFIG_FILES = Object.freeze([
  "wrangler.toml", "wrangler.json", "wrangler.jsonc", "eas.json", "app.json", "app.config.js", "app.config.ts",
  "vercel.json", "netlify.toml", "fly.toml", "render.yaml", "firebase.json", "supabase/config.toml", "Dockerfile",
]);
export const TOOL_CHECK_PATH = ".engineering/super-outer/tool-check.json";

const ALIASES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "super-outer", "references", "catalogue", "vendor-aliases.json");

const readSmall = (file) => {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

const unquote = (value) => String(value ?? "").trim().replace(/^["']|["']$/g, "");

/** `[section]` bodies of a TOML file, keyed by section name. Enough for dependency tables. */
function tomlSections(text) {
  const sections = new Map();
  let current = "";
  sections.set(current, []);
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*$/);
    if (header) {
      current = header[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current).push(line);
  }
  return sections;
}

// A Python dependency taken from a Git address, a local path, a URL or a named
// private source. Its version is written in braces so `tool-check run` never
// looks it up on PyPI.
const PY_SOURCE_KEYS = /\b(git|path|url|file|source|index|workspace|editable)\s*=/;

/** `name = "1.2"` or `name = { version = "1.2", ... }` lines of one TOML table. */
function tomlTable(lines = []) {
  const entries = [];
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_.\-]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const value = match[2];
    const source = value.startsWith("{") ? value.match(PY_SOURCE_KEYS)?.[1] : null;
    const inline = value.match(/version\s*=\s*["']([^"']+)["']/);
    entries.push([match[1], source ? `{${source}}` : inline ? inline[1] : value.startsWith("{") ? "" : unquote(value)]);
  }
  return entries;
}

/** One PEP 508 requirement line as [name, version spec], `{direct}` for `name @ address`, or null for a path or anything unreadable. */
function pythonRequirement(line) {
  const text = line.replace(/\s+#.*$/, "").trim();
  if (!text || /^[.~/\\]|^[A-Za-z]:\\|:\/\//.test(text) && !/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[^\]]*\])?\s*@/.test(text)) return null;
  const direct = text.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*@\s*\S/);
  if (direct) return [direct[1], "{direct}"];
  const match = text.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*((?:(?:===|==|!=|~=|<=|>=|<|>)\s*[^,;\s]+\s*,?\s*)*)\s*(?:;.*)?$/);
  return match ? [match[1], match[2].trim().replace(/,\s*$/, "")] : null;
}

/** Quoted strings of a TOML array that starts right after `start` in `text`, so "pydantic[email]" stays whole. */
function tomlStrings(text, from) {
  const items = [];
  let quote = null;
  let current = "";
  for (const ch of text.slice(from)) {
    if (quote) {
      if (ch === quote) { items.push(current); current = ""; quote = null; } else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "]") break;
  }
  return items;
}

const PARSERS = {
  "package.json": (text) => {
    const pkg = JSON.parse(text);
    return [
      ...Object.entries(pkg.dependencies ?? {}).map(([name, version]) => [name, String(version)]),
      ...Object.entries(pkg.optionalDependencies ?? {}).map(([name, version]) => [name, String(version)]),
      ...Object.entries(pkg.devDependencies ?? {}).map(([name, version]) => [name, String(version), true]),
    ];
  },
  // pip-compile output continues a requirement with a backslash and adds --hash options; both are joined and dropped first.
  "requirements.txt": (text) => text.replace(/\\\r?\n[ \t]*/g, " ").split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)#.*/, "").replace(/\s--hash[= ]\S+/g, "").trim())
    .filter((line) => line && !line.startsWith("-"))
    .map(pythonRequirement)
    .filter(Boolean),
  "pyproject.toml": (text) => {
    const sections = tomlSections(text);
    const listed = [];
    const project = (sections.get("project") ?? []).join("\n");
    const start = project.match(/^\s*dependencies\s*=\s*\[/m);
    if (start) for (const item of tomlStrings(project, start.index + start[0].length)) {
      const requirement = pythonRequirement(item);
      if (requirement) listed.push(requirement);
    }
    // Optional extras are part of what the project can install; dependency groups are for its developers.
    for (const [header, dev] of [["project.optional-dependencies", false], ["dependency-groups", true]]) {
      const body = (sections.get(header) ?? []).join("\n");
      for (const array of body.matchAll(/^\s*[A-Za-z0-9_.\-"']+\s*=\s*\[/gm)) {
        for (const item of tomlStrings(body, array.index + array[0].length)) {
          const requirement = pythonRequirement(item);
          if (requirement) listed.push(dev ? [...requirement, true] : requirement);
        }
      }
    }
    for (const [name, version] of tomlTable(sections.get("tool.poetry.dependencies"))) {
      if (name !== "python") listed.push([name, version]);
    }
    for (const [header, lines] of sections) {
      if (/^tool\.poetry\.(dev-dependencies|group\.[^.]+\.dependencies)$/.test(header)) for (const [name, version] of tomlTable(lines)) listed.push([name, version, true]);
    }
    // A package with an entry in [tool.uv.sources] comes from Git, a path or a named index.
    const uvSources = new Set(tomlTable(sections.get("tool.uv.sources")).map(([name]) => name.toLowerCase()));
    return listed.map((entry) => (uvSources.has(entry[0].toLowerCase()) ? [entry[0], "{uv source}", ...entry.slice(2)] : entry));
  },
  "Cargo.toml": (text) => {
    const sections = tomlSections(text);
    return [...tomlTable(sections.get("dependencies")), ...tomlTable(sections.get("dev-dependencies"))];
  },
  "go.mod": (text) => {
    const listed = [];
    const block = text.match(/^require\s*\(([\s\S]*?)^\)/m);
    const lines = [...(block ? block[1].split(/\r?\n/) : []), ...[...text.matchAll(/^require\s+([^\s(]+\s+\S+)/gm)].map((m) => m[1])];
    for (const line of lines) {
      const match = line.trim().match(/^([^\s/]+\/\S+)\s+(v\S+)/);
      if (match && !line.includes("// indirect")) listed.push([match[1], match[2]]);
    }
    return listed;
  },
  Gemfile: (text) => [...text.matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)].map((m) => [m[1], m[2] ?? ""]),
  Podfile: (text) => [...text.matchAll(/^\s*pod\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)].map((m) => [m[1], m[2] ?? ""]),
};

/** Whether `dir` or a folder up to `depth` levels below it holds a manifest. */
function holdsManifest(dir, depth) {
  if (MANIFESTS.some((name) => fs.existsSync(path.join(dir, name)))) return true;
  if (depth <= 0) return false;
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".") && holdsManifest(path.join(dir, entry.name), depth - 1));
  } catch {
    return false;
  }
}

function findFiles(root, names, skipped = []) {
  const wanted = new Set(names);
  const found = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SAMPLE_DIRECTORIES.has(entry.name.toLowerCase())) {
          if (holdsManifest(absolute, 2)) skipped.push(path.relative(root, absolute));
        }
        else if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".") && depth < MAX_DEPTH) stack.push({ dir: absolute, depth: depth + 1 });
      } else if (entry.isFile() && wanted.has(entry.name)) {
        found.push(path.relative(root, absolute));
      }
    }
  }
  return found.sort();
}

/** The framework-managed packages and other corrections from vendor-aliases.json. */
export function readAliases(file = ALIASES_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const matchesPattern = (name, pattern) => pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;

/** The framework that manages `name` in a manifest that also depends on that framework, or null. */
export function managingFramework(name, present, aliases = readAliases()) {
  for (const [framework, entry] of Object.entries(aliases.frameworks ?? {})) {
    if (name === framework || !present.has(framework) || !Array.isArray(entry.manages)) continue;
    if ((entry.manages ?? []).some((pattern) => matchesPattern(name, pattern))) return framework;
  }
  return null;
}

/**
 * The stack facts for `root`: every manifest within two folders of it, each
 * with its direct dependencies, and the platform config files present.
 */
export function readStack(root, { aliases = readAliases() } = {}) {
  const facts = { manifests: {}, unread: [], config: [], deeper: [], samples: [] };
  if (typeof root !== "string" || !root || !fs.existsSync(root)) return facts;
  const samples = [];
  for (const relative of findFiles(root, MANIFESTS, samples)) {
    const text = readSmall(path.join(root, relative));
    const parse = PARSERS[path.basename(relative)];
    let entries = null;
    try {
      entries = text === null ? null : parse(text);
    } catch {
      entries = null;
    }
    if (!Array.isArray(entries)) {
      facts.unread.push(relative);
      continue;
    }
    const present = new Set(entries.map(([name]) => name));
    // A package listed twice in one manifest (say in dependencies and devDependencies) is kept once, as a runtime one when either says so.
    const once = new Map();
    for (const entry of entries) {
      const key = entry[0].toLowerCase();
      if (!once.has(key) || (once.get(key)[2] && !entry[2])) once.set(key, entry);
    }
    facts.manifests[relative] = [...once.values()].slice(0, MAX_PER_MANIFEST).map(([name, version, dev]) => {
      const managedBy = managingFramework(name, present, aliases);
      return { name, version, ...(dev ? { dev: true } : {}), ...(managedBy ? { managedBy } : {}) };
    });
  }
  facts.config = CONFIG_FILES.filter((name) => fs.existsSync(path.join(root, name)));
  facts.deeper = deeperManifests(root);
  facts.samples = [...new Set(samples)].sort();
  return facts;
}

/** Manifests deeper than the folders `readStack` reads, so a summary can say they were skipped. */
export function deeperManifests(root) {
  const found = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && found.length < 50) {
    const { dir, depth } = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRECTORIES.has(entry.name) || SAMPLE_DIRECTORIES.has(entry.name.toLowerCase()) || entry.name.startsWith(".")) continue;
      const absolute = path.join(dir, entry.name);
      if (depth + 1 > MAX_DEPTH && MANIFESTS.some((name) => fs.existsSync(path.join(absolute, name)))) found.push(path.relative(root, absolute));
      if (depth < MAX_DEPTH + 3) stack.push({ dir: absolute, depth: depth + 1 });
    }
  }
  return found.sort();
}

/** Whether `root` has any dependency manifest, without parsing one. */
export function hasManifest(root) {
  try {
    return findFiles(root, MANIFESTS).length > 0;
  } catch {
    return false;
  }
}

/** One line per manifest, as `super-outer inventory` prints it. */
export function summariseStack(facts) {
  const lines = Object.entries(facts.manifests).map(([file, deps]) => {
    const own = deps.filter((dep) => !dep.managedBy).map(({ name, version }) => (version ? `${name}@${version}` : name));
    const managed = deps.filter((dep) => dep.managedBy);
    const tail = managed.length ? `; managed by ${managed[0].managedBy}: ${managed.map((dep) => dep.name).join(", ")}` : "";
    return `${file}: ${own.join(", ") || "no direct dependencies"}${tail}`;
  });
  if (facts.unread.length) lines.push(`Seen, not read: ${facts.unread.join(", ")}`);
  if (facts.deeper?.length) lines.push(`Too deep, not read: ${facts.deeper.join(", ")}`);
  if (facts.samples?.length) lines.push(`Sample and test folders, not read: ${facts.samples.join(", ")}`);
  lines.push(`Platform config: ${facts.config.join(", ") || "none"}`);
  return lines;
}

/**
 * Whether `dir`, or the nearest part of it that exists, resolves inside `root`
 * once linked folders are followed. A linked .engineering folder that points
 * elsewhere on the machine fails this.
 */
export function insideProject(root, dir) {
  try {
    const top = fs.realpathSync(root);
    let probe = path.resolve(dir);
    while (!fs.existsSync(probe) && probe !== path.dirname(probe)) probe = path.dirname(probe);
    const real = fs.realpathSync(probe);
    return real === top || real.startsWith(`${top}${path.sep}`);
  } catch {
    return false;
  }
}

/** The recorded tool check, or null when absent, unreadable, a symbolic link or reached through a linked folder outside the project (the record lives in the repository). */
export function readToolCheck(root) {
  try {
    if (fs.lstatSync(path.join(root, TOOL_CHECK_PATH)).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  if (!insideProject(root, path.dirname(path.join(root, TOOL_CHECK_PATH)))) return null;
  const text = readSmall(path.join(root, TOOL_CHECK_PATH));
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Versions the lock file installed for the package.json in `dir`, by package
 * name: package-lock.json (v1 to v3), yarn.lock (classic and Berry) and
 * pnpm-lock.yaml (v5 to v9). When `dir` has no lock file, the nearest one in a
 * parent folder up to `top` is read, as workspaces keep one lock at their root.
 * The map's `bySpec` gives a yarn version by "name@range", and `all` lists
 * every version a lock holds for a name, so a lock with two copies of one
 * package is read by the range the manifest asks for. Unreadable or missing
 * locks give an empty map.
 */
export function readLock(dir, top = dir) {
  const locked = new Map();
  locked.bySpec = new Map();
  locked.all = new Map();
  const note = (name, version) => {
    if (!locked.all.has(name)) locked.all.set(name, new Set());
    locked.all.get(name).add(version);
  };
  let lockDir = path.resolve(dir);
  const stop = path.resolve(top);
  const has = (folder) => ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"].some((name) => fs.existsSync(path.join(folder, name)));
  while (!has(lockDir) && lockDir !== stop && lockDir.startsWith(`${stop}${path.sep}`)) lockDir = path.dirname(lockDir);
  const relative = path.relative(lockDir, path.resolve(dir)).split(path.sep).join("/");
  locked.from = relative && has(lockDir) ? path.relative(stop, lockDir) || "." : null;
  // Elena N1: a package the lock downloads from a host other than npm's public registry is private, whatever config pointed there.
  locked.privateNames = new Set();
  const fromPrivateHost = (url) => typeof url === "string" && /^https?:\/\//i.test(url) && !/^https?:\/\/(registry\.npmjs\.org|registry\.yarnpkg\.com)(\/|$)/i.test(url);

  const pkgLock = readSmallLock(path.join(lockDir, "package-lock.json"));
  if (pkgLock) {
    try {
      const parsed = JSON.parse(pkgLock);
      const packages = parsed.packages ?? {};
      for (const [key, meta] of Object.entries(packages)) {
        const match = key.match(/^(?:.*\/)?node_modules\/((?:@[^/]+\/)?[^/]+)$/);
        if (match && typeof meta?.version === "string") note(match[1], meta.version);
        if (match && fromPrivateHost(meta?.resolved)) locked.privateNames.add(match[1]);
      }
      // A workspace package's own copy sits under its folder; otherwise the hoisted root copy is the one it uses.
      const prefixes = relative ? [`${relative}/node_modules/`, "node_modules/"] : ["node_modules/"];
      for (const prefix of [...prefixes].reverse()) {
        for (const [key, meta] of Object.entries(packages)) {
          if (!key.startsWith(prefix)) continue;
          const name = key.slice(prefix.length);
          if (/^(?:@[^/]+\/)?[^/]+$/.test(name) && typeof meta?.version === "string") locked.set(name, meta.version);
        }
      }
      for (const [name, meta] of Object.entries(parsed.dependencies ?? {})) {
        if (!locked.has(name) && typeof meta?.version === "string") locked.set(name, meta.version);
      }
    } catch {}
    return locked;
  }
  const yarn = readSmallLock(path.join(lockDir, "yarn.lock"));
  if (yarn) {
    for (const block of yarn.replace(/\r\n?/g, "\n").split(/\n(?=\S)/)) {
      const headerLine = block.split("\n")[0];
      const version = block.match(/^\s+version:?\s+"?([^"\s]+)"?/m)?.[1];
      const resolved = block.match(/^\s+resolved:?\s+"?([^"\s#]+)/m)?.[1];
      if (!version || !headerLine.endsWith(":")) continue;
      // A header lists every range that resolved to this copy: "pkg@^1.0.0", "pkg@npm:^1.2.0":
      for (const raw of headerLine.slice(0, -1).split(/,\s*/)) {
        const spec = raw.trim().replace(/^"|"$/g, "");
        const at = spec.indexOf("@", 1);
        if (at < 1) continue;
        const name = spec.slice(0, at);
        const range = spec.slice(at + 1).replace(/^npm:/, "");
        locked.bySpec.set(`${name}@${range}`, version);
        if (fromPrivateHost(resolved)) locked.privateNames.add(name);
        note(name, version);
      }
    }
    for (const [name, list] of locked.all) if (list.size === 1) locked.set(name, [...list][0]);
    return locked;
  }
  const pnpm = readSmallLock(path.join(lockDir, "pnpm-lock.yaml"));
  if (pnpm) {
    const text = pnpm.replace(/\r\n?/g, "\n");
    const importer = relative || ".";
    const escaped = importer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = text.match(new RegExp(`^importers:\\n(?:[\\s\\S]*?\\n)?  '?${escaped}'?:\\n([\\s\\S]*?)(?=^  \\S|^\\S|(?![\\s\\S]))`, "m"))?.[1];
    if (block) {
      // v6 to v9: name, then specifier and version lines.
      for (const match of block.matchAll(/^ {6}'?((?:@[^/\s']+\/)?[^:\s']+)'?:\n {8}specifier:[^\n]*\n {8}version:\s*'?([0-9][^(\s'_]*)/gm)) locked.set(match[1], match[2]);
      // v5 workspaces: "name: version" under dependencies.
      for (const match of block.matchAll(/^ {6}'?((?:@[^/\s']+\/)?[^:\s']+)'?:\s*'?([0-9][^(\s'_]*)/gm)) if (!locked.has(match[1])) locked.set(match[1], match[2]);
    } else if (!relative) {
      // v5 single project: top-level dependencies and devDependencies, "name: version".
      for (const section of text.matchAll(/^(?:dependencies|devDependencies|optionalDependencies):\n((?: {2}.*\n?)*)/gm)) {
        for (const match of section[1].matchAll(/^ {2}'?((?:@[^/\s']+\/)?[^:\s']+)'?:\s*'?([0-9][^(\s'_]*)/gm)) locked.set(match[1], match[2]);
      }
    }
  }
  return locked;
}

/** Versions in poetry.lock or uv.lock next to a pyproject.toml, by lower-case package name. */
export function readPythonLock(dir) {
  const locked = new Map();
  for (const name of ["uv.lock", "poetry.lock"]) {
    const text = readSmallLock(path.join(dir, name));
    if (!text) continue;
    for (const match of text.replace(/\r\n?/g, "\n").matchAll(/^\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/gm)) locked.set(match[1].toLowerCase().replace(/[-_.]+/g, "-"), match[2]);
    if (locked.size) locked.from = name;
    return locked;
  }
  return locked;
}

const LOCK_BYTES = 8 * 1024 * 1024;
function readSmallLock(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > LOCK_BYTES) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** A short hash of every manifest's path and bytes, so a later session can tell the dependencies changed. */
export function manifestHash(root) {
  try {
    const hash = createHash("sha256");
    for (const relative of findFiles(root, MANIFESTS)) {
      hash.update(relative);
      hash.update(readSmall(path.join(root, relative)) ?? "");
    }
    return hash.digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}
