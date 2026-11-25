/**
 * `super-outer tool-check run`: the mechanical half of the tool check in
 * skills/super-outer/references/tool-check.md. It reads the project's
 * dependencies and lock files, looks each public one up on its registry,
 * checks Expo-style version tables, finds skills and MCP servers for the
 * project's packages, confirms those skills still exist in their
 * repositories, reads their safety scans, scans their SKILL.md text for
 * hidden instructions, and prints findings and candidates. The agent then
 * judges fit and writes the Tools block.
 *
 * Network: read-only GET requests to public registries (npm, PyPI, skills.sh,
 * the MCP Registry, GitHub, unpkg), made only when the agent runs this
 * command. The prompt hook never runs it. Requests carry public package and
 * publisher names only; private, local, workspace and git dependencies, and
 * every package behind a private registry or index, are never looked up.
 * Each request has a time limit, the run has a request and time budget, and
 * whatever was not checked is reported as not checked. The owner approved moving
 * these steps into one command on 25 October 2026.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareVersions, maxSatisfying, parseRange, parseVersion, pythonSpec, pythonVersion, satisfies, specKind } from "./semver-lite.mjs";
import { TOOL_CHECK_PATH, insideProject, manifestHash, readAliases, readLock, readPythonLock, readStack, readToolCheck } from "./stack-facts.mjs";
import { claudeCodeRoster, readSkillFolder } from "./jev/skill-roster.mjs";

export const LIMITS = Object.freeze({ timeoutMs: 10000, maxRequests: 500, deadlineMs: 90000, concurrency: 6, maxQueries: 10, vetPerQuery: 5, keepPerQuery: 3, mcpPerPublisher: 3 });
export const ANSWERS = Object.freeze(["accepted", "declined", "later"]);
export const LATER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "super-outer-tool-check";
const NPM = "https://registry.npmjs.org";
const ABBREVIATED = "application/vnd.npm.install-v1+json";

// Control characters, zero-width and direction marks, Unicode tag characters and the
// supplementary variation selectors, all of which can hide text from a reader.
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]|[\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;
const HIDDEN_TEST = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]|[\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;
// Owners, repositories and skill names are used inside URLs and the printed install line.
// A leading dash would turn a name into an option on the install line, so names start with a letter, digit or underscore.
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;

// ---------------------------------------------------------------- fetching

/**
 * GET with a time limit, a request budget, a run deadline and a concurrency
 * cap. In tests, `fixturesDir` replays recorded responses keyed by URL, and
 * `recordDir` saves live responses in the same shape.
 */
export function createFetcher({ fixturesDir, recordDir, limits = LIMITS, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const started = now();
  const stats = { requests: 0, failed: 0, refused: 0, failures: {} };
  let active = 0;
  const waiting = [];
  const key = (url) => `${createHash("sha256").update(url).digest("hex").slice(0, 20)}.json`;
  const acquire = () => new Promise((resolve) => {
    if (active < limits.concurrency) { active += 1; resolve(); } else waiting.push(resolve);
  });
  const release = () => {
    const next = waiting.shift();
    if (next) next(); else active -= 1;
  };
  const fail = (url, why) => {
    stats.failed += 1;
    let host = "other";
    try { host = new URL(url).hostname; } catch {}
    stats.failures[`${host} ${why}`] = (stats.failures[`${host} ${why}`] ?? 0) + 1;
  };

  async function get(url, { accept = "application/json", json = true, reduce = null } = {}) {
    if (stats.requests >= limits.maxRequests || now() - started > limits.deadlineMs) {
      stats.refused += 1;
      return { status: 0, error: "budget", url };
    }
    stats.requests += 1;
    if (fixturesDir) {
      try {
        const saved = JSON.parse(fs.readFileSync(path.join(fixturesDir, key(url)), "utf8"));
        return finish(url, saved.status, saved.body, json);
      } catch {
        fail(url, "no fixture");
        return { status: 0, error: "no fixture", url };
      }
    }
    await acquire();
    try {
      const headers = { accept, "user-agent": USER_AGENT };
      // A token already set in the environment raises GitHub's limit from 60 to 5,000 requests an hour. It goes to api.github.com only.
      if (url.startsWith("https://api.github.com/") && process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(limits.timeoutMs) });
      let body = await response.text();
      // Keep only what the check reads, so a 2 MB npm record becomes a few KB in memory and in recordings.
      if (reduce && response.status === 200) {
        try { body = JSON.stringify(reduce(JSON.parse(body))); } catch {}
      }
      if (recordDir) {
        fs.mkdirSync(recordDir, { recursive: true });
        fs.writeFileSync(path.join(recordDir, key(url)), `${JSON.stringify({ url, status: response.status, body })}\n`);
      }
      return finish(url, response.status, body, json);
    } catch (error) {
      const why = error?.name === "TimeoutError" ? "timeout" : "network";
      fail(url, why);
      return { status: 0, error: why, url };
    } finally {
      release();
    }
  }

  function finish(url, status, body, json) {
    if (status !== 200) {
      const error = status === 403 || status === 429 ? "rate limited" : status === 404 ? null : `status ${status}`;
      if (error) fail(url, error);
      return { status, url, ...(error ? { error } : {}) };
    }
    if (!json) return { status, text: body, url };
    try {
      return { status, json: JSON.parse(body), url };
    } catch {
      fail(url, "not json");
      return { status: 0, error: "not json", url };
    }
  }

  return { get, stats, key };
}

// ---------------------------------------------------------------- helpers

/** Hidden characters and newlines removed, and length capped, for any text that came from outside. */
export const clean = (text, max = 160) => String(text ?? "").replace(HIDDEN, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** The GitHub owner and repository of a repository field, only for github.com itself. */
export function ownerOf(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(?:git\+)?(?:https?:\/\/|git:\/\/|ssh:\/\/git@)?(?:www\.)?github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[#/?].*)?$/i)
    ?? text.match(/^(?:github:)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:#.*)?$/);
  if (!match || !SAFE_NAME.test(match[2])) return null;
  return { owner: match[1].toLowerCase(), repo: match[2].toLowerCase() };
}

const scopeOf = (name) => (name.startsWith("@") ? name.slice(1).split("/")[0].toLowerCase() : null);

const matchesPattern = (name, pattern) => (pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern);

/** The publisher Super-outer's own table names for a package, or null. */
export function knownPublisher(name, aliases) {
  for (const [pattern, owner] of Object.entries(aliases.publishers ?? {})) if (matchesPattern(name, pattern)) return owner;
  return null;
}

const npmUrl = (name) => `${NPM}/${encodeURIComponent(name).replace(/^%40/, "@")}`;

const readText = (file) => {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
};

/** Whether a registry address is npm's own public registry: the address must start with it, not merely contain it. */
export const isPublicNpm = (url) => /^https?:\/\/(registry\.npmjs\.org|registry\.yarnpkg\.com)(\/|$)/i.test(String(url ?? "").trim().replace(/^["']|["']$/g, ""));

const PYTHON_INDEX_ENV = /^(PIP_(EXTRA_)?INDEX_URL|PIP_FIND_LINKS|UV_(EXTRA_)?INDEX_URL|UV_INDEX|UV_DEFAULT_INDEX|UV_FIND_LINKS|POETRY_REPOSITORIES_.+|PDM_PYPI_URL)$/i;

/** Requirement files a requirements file includes with -r or -c, inside the project only. */
function includedRequirements(root, file, seen = new Set()) {
  if (seen.has(file) || seen.size > 20) return seen;
  seen.add(file);
  for (const match of readText(file).replace(/\r\n?/g, "\n").matchAll(/^\s*(?:-r|--requirement|-c|--constraint)\s*=?\s*(\S+)/gm)) {
    const next = path.resolve(path.dirname(file), match[1]);
    if (next.startsWith(`${path.resolve(root)}${path.sep}`)) includedRequirements(root, next, seen);
  }
  return seen;
}

/**
 * What must never be looked up on a public registry: scopes and whole
 * registries pointed elsewhere by .npmrc, .yarnrc, .yarnrc.yml, bunfig.toml
 * (in the project, in each package folder and in the home folder) or by npm
 * and Yarn environment variables; the repository's own package names and
 * scopes; and every Python package when a private index or extra package
 * source is configured in a requirements file (or one it includes), pyproject,
 * uv.toml, pip.conf or the environment.
 */
export function privateNames(root, facts, home = os.homedir(), env = process.env) {
  const scopes = new Set();
  const names = new Set();
  let npmAll = false;
  let pypiAll = false;
  const read = (file) => readText(file).replace(/\r\n?/g, "\n");
  const folders = [...new Set([".", ...Object.keys(facts.manifests).map((file) => path.dirname(file))])].map((dir) => path.join(root, dir));
  const places = [...folders, home];
  for (const dir of places) {
    const npmrc = read(path.join(dir, ".npmrc"));
    for (const match of npmrc.matchAll(/^\s*@([\w.-]+):registry\s*=\s*(\S+)/gm)) if (!isPublicNpm(match[2])) scopes.add(match[1].toLowerCase());
    for (const match of npmrc.matchAll(/^\s*registry\s*=\s*(\S+)/gm)) if (!isPublicNpm(match[1])) npmAll = true;
    // Yarn 1: registry "https://..." and "@scope:registry" "https://...".
    const yarnrc = read(path.join(dir, ".yarnrc"));
    for (const match of yarnrc.matchAll(/^\s*"?@([\w.-]+):registry"?\s+"?([^"\s]+)/gm)) if (!isPublicNpm(match[2])) scopes.add(match[1].toLowerCase());
    for (const match of yarnrc.matchAll(/^\s*"?registry"?\s+"?([^"\s]+)/gm)) if (!isPublicNpm(match[1])) npmAll = true;
    // Yarn 2 and later.
    const yarnYml = read(path.join(dir, ".yarnrc.yml"));
    const server = yarnYml.match(/^npmRegistryServer:\s*["']?([^"'\s]+)/m);
    if (server && !isPublicNpm(server[1])) npmAll = true;
    const yarnScopes = yarnYml.match(/^npmScopes:\n((?:[ \t]+.*\n?)*)/m)?.[1] ?? "";
    for (const match of yarnScopes.matchAll(/^ {2}["']?([\w.-]+)["']?:/gm)) scopes.add(match[1].toLowerCase());
    // Bun: [install] registry, and every scope under [install.scopes].
    const bunfig = read(path.join(dir, dir === home ? ".bunfig.toml" : "bunfig.toml"));
    let section = "";
    for (const line of bunfig.split("\n")) {
      const header = line.match(/^\s*\[\s*([^\]]+?)\s*\]/);
      if (header) { section = header[1]; continue; }
      const entry = line.match(/^\s*["']?([@\w.-]+)["']?\s*=\s*(.+)$/);
      if (!entry) continue;
      const address = entry[2].match(/(?:url\s*=\s*)?["']([^"']+)["']/)?.[1] ?? entry[2];
      if (section === "install" && entry[1] === "registry" && !isPublicNpm(address)) npmAll = true;
      if (section === "install.scopes") scopes.add(entry[1].replace(/^@/, "").toLowerCase());
    }
  }
  for (const [key, value] of Object.entries(env ?? {})) {
    const scoped = key.match(/^npm_config_@([\w.-]+):registry$/i);
    if (scoped && !isPublicNpm(value)) scopes.add(scoped[1].toLowerCase());
    if (/^(npm_config_registry|YARN_REGISTRY|YARN_NPM_REGISTRY_SERVER|BUN_CONFIG_REGISTRY)$/i.test(key) && value && !isPublicNpm(value)) npmAll = true;
    if (/^YARN_NPM_SCOPES$/i.test(key) && value) npmAll = true;
    if (PYTHON_INDEX_ENV.test(key) && value) pypiAll = true;
  }
  for (const relative of Object.keys(facts.manifests)) {
    const base = path.basename(relative);
    const file = path.join(root, relative);
    if (base === "package.json") {
      try {
        const own = JSON.parse(readText(file)).name;
        if (typeof own === "string" && own) {
          names.add(own);
          const scope = scopeOf(own);
          if (scope) scopes.add(scope);
        }
      } catch {}
    }
    if (base === "requirements.txt") {
      for (const included of includedRequirements(root, file)) {
        if (/^\s*(-i|--index-url|--extra-index-url|-f|--find-links)\b/m.test(read(included))) pypiAll = true;
      }
    }
    if (base === "pyproject.toml") {
      const text = read(file);
      if (/^\[\[?tool\.(poetry\.source|uv\.index|pdm\.source)\]?\]/m.test(text)) pypiAll = true;
      const uv = text.match(/^\[tool\.uv\]\n([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1] ?? "";
      if (/^\s*(extra-index-url|index-url|index|find-links)\s*=/m.test(uv)) pypiAll = true;
    }
  }
  for (const dir of folders) {
    if (/^\s*(extra-index-url|index-url|find-links|\[\[index\]\])/m.test(read(path.join(dir, "uv.toml")))) pypiAll = true;
  }
  for (const file of [
    path.join(home, ".config", "pip", "pip.conf"), path.join(home, ".pip", "pip.conf"), path.join(home, "Library", "Application Support", "pip", "pip.conf"),
    path.join(root, "pip.conf"), path.join(home, ".config", "uv", "uv.toml"),
  ]) {
    if (/^\s*((extra-)?index-url|find-links|\[\[index\]\])/m.test(read(file))) pypiAll = true;
  }
  return { scopes, names, npmAll, pypiAll };
}

const NEED_WORDS = 5;
const COMMON_NAMES = new Set(["mobile", "server", "client", "frontend", "backend", "docs", "site", "website", "core", "shared", "common", "utils", "app", "apps", "packages", "src"]);

/** The project's own names: its package names and scopes, its folder name and its Git repository name. Need words must not contain them. */
function ownNames(root, priv) {
  const names = new Set([path.basename(path.resolve(root)).toLowerCase()]);
  for (const name of priv.names) {
    names.add(name.toLowerCase());
    names.add(name.toLowerCase().split("/").at(-1));
  }
  for (const scope of priv.scopes) names.add(scope);
  const remote = readText(path.join(root, ".git", "config")).match(/url\s*=\s*\S*?([^/:\s]+?)(?:\.git)?\s*$/m)?.[1];
  if (remote) names.add(remote.toLowerCase());
  // Short or everyday package names such as "web" or "api" would refuse ordinary need words.
  return new Set([...names].filter((name) => name.length >= 4 && !COMMON_NAMES.has(name)));
}

/**
 * Why a `--need` phrase cannot be sent to skills.sh, or null. A need is a
 * generic category such as "realtime collaboration": at most five plain words,
 * and none of them the project's own name.
 */
export function needProblem(need, own = new Set()) {
  const text = String(need ?? "").trim();
  if (!text) return "empty";
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(text)) return "use plain words only, with no slashes, dots, @ or quotes";
  const words = text.toLowerCase().split(/\s+/);
  if (words.length > NEED_WORDS) return `use at most ${NEED_WORDS} words`;
  if (words.some((word) => word.length > 24)) return "a word is longer than 24 letters";
  if (words.some((word) => own.has(word)) || own.has(words.join("-"))) return "it contains the project's own name";
  return null;
}

const isPrivateNpm = (name, priv) => priv.npmAll || priv.names.has(name) || (scopeOf(name) !== null && priv.scopes.has(scopeOf(name)));

/** The parts of npm's compact record the check reads: the tags, the version list and each version's deprecation notice. */
const reduceNpm = (doc) => ({
  name: doc.name,
  "dist-tags": doc["dist-tags"],
  versions: Object.fromEntries(Object.entries(doc.versions ?? {}).map(([version, meta]) => [version, meta?.deprecated ? { deprecated: meta.deprecated } : {}])),
});

// ---------------------------------------------------------------- dependencies

/** Why a request gave nothing usable, in words: a 200 with an empty or unreadable body is not a success. */
const reasonOf = (got) => {
  if (got.error === "budget") return "the run's request limit was used up";
  if (got.error) return got.error;
  return got.status === 200 ? "empty or unreadable response" : `status ${got.status}`;
};

function compare(result, pinned, latest) {
  const a = parseVersion(pinned);
  const b = parseVersion(latest);
  if (!pinned) result.state = "no published version matches the pinned range";
  else if (!a || !b) result.state = "unparseable";
  else if (b.minor >= 20000000 || a.minor >= 20000000 || b.major >= 1990 || a.major >= 1990) result.state = "date-versioned, not compared";
  else if (b.major > a.major) { result.state = "behind"; result.majorsBehind = b.major - a.major; }
  else if (a.major === 0 && b.major === 0 && b.minor > a.minor) { result.state = "behind"; result.zeroMinorBehind = b.minor - a.minor; }
  else result.state = compareVersions(a, b) < 0 ? "current major" : "current";
}

async function checkNpm(dep, ctx) {
  const base = { ecosystem: "npm", name: dep.name, spec: dep.version, dev: Boolean(dep.dev), manifest: dep.manifest };
  const kind = specKind(dep.version);
  if (kind !== "registry") return { ...base, state: kind === "unparseable" ? "unparseable" : `not looked up (${kind})` };
  if (isPrivateNpm(dep.name, ctx.priv)) return { ...base, state: "private, not looked up" };
  if (dep.name.startsWith("@types/")) return { ...base, state: "type definitions follow their package, not compared" };
  const doc = await ctx.fetcher.get(npmUrl(dep.name), { accept: ABBREVIATED, reduce: reduceNpm });
  if (doc.status === 404) return { ...base, state: "not on the public registry, treated as private" };
  if (!doc.json) return { ...base, state: "not checked", reason: reasonOf(doc) };
  const versions = Object.keys(doc.json.versions ?? {});
  const latest = doc.json["dist-tags"]?.latest;
  const lock = ctx.locks.get(path.dirname(dep.manifest));
  // A lock holding two copies of one package is read by the range this manifest asks for.
  const candidates = lock ? [...(lock.all?.get(dep.name) ?? [])] : [];
  let locked = lock?.bySpec?.get(`${dep.name}@${dep.version}`) ?? lock?.get(dep.name) ?? (candidates.length ? maxSatisfying(candidates, dep.version) : null);
  const range = parseRange(dep.version);
  const lockedVersion = parseVersion(locked);
  // A lock that no longer matches package.json is stale: the manifest's range decides.
  let lockMismatch = null;
  if (locked && range && lockedVersion && !satisfies(lockedVersion, range)) { lockMismatch = locked; locked = null; }
  const pinned = locked && doc.json.versions[locked] ? locked : maxSatisfying(versions, dep.version);
  const meta = await ctx.fetcher.get(`${npmUrl(dep.name)}/latest`, { reduce: (m) => ({ repository: m.repository, homepage: m.homepage, dist: { attestations: m.dist?.attestations ? { provenance: Boolean(m.dist.attestations.provenance) } : undefined } }) });
  const repository = typeof meta.json?.repository === "string" ? meta.json.repository : meta.json?.repository?.url;
  const repo = ownerOf(repository);
  const known = knownPublisher(dep.name, ctx.aliases);
  // A publisher is confirmed by Super-outer's own table, or by the package name or scope matching the
  // repository owner. A build record (provenance) alone only proves where a package was built, so a
  // look-alike built from its own repository stays unconfirmed.
  const ownerVerified = Boolean(known) || (Boolean(repo) && (dep.name.toLowerCase() === repo.owner || scopeOf(dep.name) === repo.owner));
  const result = {
    ...base,
    latest: latest ?? null,
    pinned: pinned ?? null,
    lockedFrom: locked && pinned === locked ? "lock file" : null,
    ...(lockMismatch ? { lockMismatch } : {}),
    owner: known ?? repo?.owner ?? null,
    repo: repo ? `${repo.owner}/${repo.repo}` : null,
    ownerVerified,
    provenance: Boolean(meta.json?.dist?.attestations?.provenance),
    versions,
    dist: doc.json["dist-tags"] ?? {},
  };
  if (!result.owner) result.ownerNote = meta.json ? "no GitHub repository listed" : "repository not readable";
  const deprecatedPinned = pinned ? doc.json.versions[pinned]?.deprecated : null;
  const deprecatedLatest = latest ? doc.json.versions[latest]?.deprecated : null;
  if (deprecatedLatest) result.deprecated = clean(deprecatedLatest, 200);
  else if (deprecatedPinned) result.deprecatedPinned = clean(deprecatedPinned, 200);
  compare(result, pinned, latest);
  return result;
}

const pyName = (name) => String(name).toLowerCase().replace(/[-_.]+/g, "-");
const asText = (v) => `${v.major}.${v.minor}.${v.patch}${v.pre ? `-${v.pre}` : ""}`;

async function checkPypi(dep, ctx) {
  const base = { ecosystem: "pypi", name: dep.name, spec: dep.version, dev: Boolean(dep.dev), manifest: dep.manifest };
  if (ctx.priv.pypiAll) return { ...base, state: "private index configured, not looked up" };
  if (/^\{/.test(dep.version)) return { ...base, state: "not looked up (from Git, a local path or a private source)" };
  if (/@|:\/\//.test(dep.version)) return { ...base, state: "not looked up (direct reference)" };
  const doc = await ctx.fetcher.get(`https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`, { reduce: (d) => ({ info: { name: d.info?.name, version: d.info?.version, project_urls: d.info?.project_urls, home_page: d.info?.home_page, classifiers: d.info?.classifiers } }) });
  if (doc.status === 404) return { ...base, state: "not on the public registry, treated as private" };
  if (!doc.json?.info) return { ...base, state: "not checked", reason: reasonOf(doc) };
  const info = doc.json.info;
  const urls = info.project_urls ?? {};
  const repo = ownerOf(urls.Source ?? urls.Repository ?? urls["Source Code"] ?? urls.Homepage ?? info.home_page);
  const known = knownPublisher(dep.name, ctx.aliases);
  const result = { ...base, latest: info.version, owner: known ?? repo?.owner ?? null, repo: repo ? `${repo.owner}/${repo.repo}` : null, ownerVerified: Boolean(known) || (Boolean(repo) && dep.name.toLowerCase() === repo.owner) };
  if (/inactive|deprecated/i.test((info.classifiers ?? []).join(" "))) result.deprecated = "marked inactive or deprecated on PyPI";
  const latest = pythonVersion(info.version);
  const locked = ctx.pyLocks.get(path.dirname(dep.manifest))?.get(pyName(dep.name));
  const spec = pythonSpec(dep.version);
  const exact = locked ?? spec.exact;
  if (exact) {
    const release = await ctx.fetcher.get(`https://pypi.org/pypi/${encodeURIComponent(dep.name)}/${encodeURIComponent(exact)}/json`, { reduce: (d) => ({ info: { yanked: d.info?.yanked, yanked_reason: d.info?.yanked_reason } }) });
    if (release.json?.info?.yanked) result.deprecatedPinned = `version ${clean(exact, 30)} was withdrawn (yanked)${release.json.info.yanked_reason ? `: ${clean(release.json.info.yanked_reason, 120)}` : ""}`;
    result.pinned = clean(exact, 30);
    if (locked) result.lockedFrom = "lock file";
    const pinned = pythonVersion(exact);
    if (!pinned || !latest) result.state = "unparseable";
    else compare(result, asText(pinned), asText(latest));
    return result;
  }
  if (spec.kind === "none") { result.state = "unpinned"; return result; }
  if (spec.kind === "minimum") { result.state = `minimum version only (${clean(dep.version, 30)}), not compared`; return result; }
  if (spec.kind === "capped") {
    // An upper bound such as <10 allows major 9 at most; a bound such as <10.2 still allows major 10.
    const top = spec.upper.minor === 0 && spec.upper.patch === 0 && !spec.upper.inclusive ? spec.upper.major - 1 : spec.upper.major;
    result.pinned = clean(dep.version, 30);
    result.capped = true;
    if (!latest) result.state = "unparseable";
    else if (latest.major > top) { result.state = "behind"; result.majorsBehind = latest.major - top; }
    else result.state = "current major";
    return result;
  }
  // exact with a wildcard (==2.0.*) or compatible (~=2.8, ^1.2): compare from the version it starts at.
  result.pinned = `${spec.base.major}.${spec.base.minor}.${spec.base.patch}`;
  if (spec.kind === "wildcard") result.pinned = clean(dep.version.replace(/^==\s*/, ""), 30);
  if (!latest) result.state = "unparseable";
  else if (spec.majorOnly) {
    if (latest.major > spec.base.major) { result.state = "behind"; result.majorsBehind = latest.major - spec.base.major; } else result.state = "current major";
  } else compare(result, asText({ ...spec.base, pre: null }), asText(latest));
  return result;
}

/** Expo-style frameworks: compare their peers with the framework's own version table for the pinned and the next SDK. */
async function checkFramework(name, entry, dep, all, ctx) {
  if (!entry.versionTable || !dep?.pinned || !dep.latest) return null;
  const pinned = parseVersion(dep.pinned);
  const latest = parseVersion(dep.latest);
  if (!pinned || !latest) return null;
  const nextMajor = pinned.major + 1;
  const next = latest.major > pinned.major ? (dep.dist[`sdk-${nextMajor}`] ?? maxSatisfying(dep.versions, `^${nextMajor}.0.0`)) : null;
  const table = async (version) => {
    if (!version) return null;
    const got = await ctx.fetcher.get(entry.versionTable.replace("{version}", encodeURIComponent(version)));
    return got.json && typeof got.json === "object" && !Array.isArray(got.json) ? got.json : null;
  };
  const [pinnedTable, nextTable, latestTable] = await Promise.all([table(dep.pinned), table(next), latest.major > pinned.major ? table(dep.latest) : null]);
  const managed = new Set(Object.keys(pinnedTable ?? {}));
  const peers = all.filter((other) => other.ecosystem === "npm" && other.manifest === dep.manifest && managed.has(other.name));
  const mismatched = [];
  for (const peer of peers) {
    const expected = String(pinnedTable[peer.name]);
    const range = parseRange(expected);
    const version = parseVersion(peer.pinned);
    if (range && version && !satisfies(version, range)) {
      const wanted = parseVersion(expected.replace(/^[~^>=<\s]+/, ""));
      mismatched.push({ name: peer.name, pinned: peer.pinned, expected: clean(expected, 40), major: Boolean(wanted) && (wanted.major !== version.major || (version.major === 0 && wanted.minor !== version.minor)) });
    }
    peer.managedBy = name;
  }
  const removedNext = nextTable ? peers.filter((peer) => !(peer.name in nextTable)).map((peer) => peer.name) : [];
  const removedLatest = latestTable ? peers.filter((peer) => !(peer.name in latestTable)).map((peer) => peer.name) : [];
  return {
    framework: name,
    manifest: dep.manifest,
    pinned: dep.pinned,
    latest: dep.latest,
    next,
    oneAtATime: Boolean(entry.upgradeOneAtATime),
    guide: entry.upgradeGuide ?? null,
    check: entry.check ?? null,
    tableRead: Boolean(pinnedTable),
    managed: peers.map((peer) => peer.name),
    mismatched,
    removedNext,
    removedLatest,
  };
}

// ---------------------------------------------------------------- installed skills

/** Installed skills with their source repository where the host records one. */
export function installedSkills(home = os.homedir()) {
  const out = [];
  let lock = {};
  try { lock = JSON.parse(fs.readFileSync(path.join(home, ".agents", ".skill-lock.json"), "utf8")).skills ?? {}; } catch {}
  for (const skill of readSkillFolder(path.join(home, ".agents", "skills"))) {
    out.push({ name: skill.name, source: typeof lock[skill.name]?.source === "string" ? lock[skill.name].source.toLowerCase() : null });
  }
  for (const skill of readSkillFolder(path.join(home, ".codex", "skills"))) out.push({ name: skill.name, source: null });
  try {
    for (const skill of claudeCodeRoster(home)) out.push({ name: skill.name, source: null });
  } catch {}
  return out;
}

const installedFor = (installed, owner, skillId) => installed.find((skill) => (skill.source?.split("/")[0] === owner && (skill.name === skillId || skill.name.endsWith(`:${skillId}`))) || skill.name === `${owner}:${skillId}`);

// ---------------------------------------------------------------- skills

export const SCAN_MAX = 500000;

// Download commands, then a pipe into a shell or interpreter (through sudo, env or a full path), a
// download saved to a file and run, a decoded block piped into a shell, or PowerShell's iwr | iex.
const FETCH = String.raw`(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|fetch)`;
const SHELL = String.raw`(?:sudo\s+(?:-\S+\s+)*)?(?:env\s+(?:-\S+\s+)*)?(?:\S*/)?(?:(?:ba|z|da|fi|k|c|tc)?sh|python[0-9.]*|node|perl|ruby|php|iex|invoke-expression|pwsh|powershell)\b`;
const RUNS_DOWNLOAD = [
  new RegExp(String.raw`\b${FETCH}\b[^\n]*\|\s*${SHELL}`, "i"),
  new RegExp(String.raw`<\(\s*${FETCH}\b|\$\(\s*${FETCH}\b|\b(?:eval|source)\s+["']?\$\(`, "i"),
  new RegExp(String.raw`\b${FETCH}\b[^\n]*(?:\s-o\s*|\s-O\s+|--output[=\s]+|>\s*)(?:\S*/)?([\w.-]+)[^\n]*(?:&&|;|\n)\s*(?:${SHELL}\s+(?:\S*/)?\1\b|chmod\s+\+x\s+(?:\S*/)?\1\b|\.\/\1\b)`, "i"),
  new RegExp(String.raw`\bbase64\s+(?:-d|-D|--decode)\b[^\n]*\|\s*${SHELL}`, "i"),
];

/** Signs of instructions hidden in a SKILL.md. Flags block a recommendation; notes ask the agent to read that part first. */
export function scanSkillText(input) {
  const flags = [];
  const notes = [];
  // A line ending in a backslash continues on the next line, so a pipe split across lines is read as one.
  const text = String(input ?? "").replace(/\\\r?\n[ \t]*/g, " ");
  if (text.length > SCAN_MAX) flags.push(`longer than ${SCAN_MAX.toLocaleString("en-US")} characters, too long to scan`);
  if (HIDDEN_TEST.test(text)) flags.push("hidden or direction-changing characters");
  if (RUNS_DOWNLOAD.some((pattern) => pattern.test(text))) flags.push("downloads and runs a script");
  if (/\b(ignore|disregard|forget) (all |any )?(previous|prior|above|earlier) (instructions|rules|guidance)/i.test(text)) flags.push("tells the agent to ignore its instructions");
  const comments = [...text.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => clean(m[1], 120)).filter(Boolean);
  if (comments.length) notes.push(`HTML comment: "${comments[0]}"${comments.length > 1 ? ` and ${comments.length - 1} more` : ""}`);
  if (/[A-Za-z0-9+/=]{200,}/.test(text)) notes.push("long encoded block");
  const domains = [...new Set([...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()))];
  return { flags, notes, domains: domains.slice(0, 12) };
}

/** Whether every scanner passed; anything else holds, and no scan at all drops. */
export function auditVerdict(audits) {
  if (!Array.isArray(audits) || audits.length === 0) return "drop: not audited";
  const name = (list) => list.map((audit) => `${clean(audit.provider, 30)} ${clean(audit.status, 20)}`).join(", ");
  // Owner decision, 25 October 2026: too much caution defeats the purpose. A failed scan holds the
  // skill; a warning, or a scan that did not finish, shows it with a note naming the scanner.
  const failed = audits.filter((audit) => /^fail/i.test(String(audit?.status ?? "")));
  if (failed.length) return `hold: ${name(failed)}`;
  const other = audits.filter((audit) => audit?.status !== "pass");
  return other.length ? `warn: ${name(other)}` : "pass";
}

const auditShowable = (audit) => /^(pass|warn|not scanned yet)/.test(audit ?? "");

const TREE_CACHE_HOURS = 24;

function readTreeCache(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

/** The skill folders in a repository with how many files each holds, from a 24-hour local cache or GitHub. */
async function repoSkills(owner, repo, ctx) {
  const key = `${owner}/${repo}`;
  if (ctx.trees.has(key)) return ctx.trees.get(key);
  const cached = ctx.treeCache?.[key];
  if (cached?.value?.skills && Date.now() - Date.parse(cached.at) < TREE_CACHE_HOURS * 3600 * 1000) {
    ctx.trees.set(key, cached.value);
    return cached.value;
  }
  const got = await ctx.fetcher.get(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`, {
    reduce: (j) => {
      const blobs = (j.tree ?? []).filter((item) => item.type === "blob").map((item) => item.path);
      const dirs = blobs.filter((p) => p.endsWith("/SKILL.md")).map((p) => p.slice(0, -"/SKILL.md".length));
      return { truncated: j.truncated, skills: Object.fromEntries(dirs.map((dir) => [dir, blobs.filter((p) => p.startsWith(`${dir}/`)).length])) };
    },
  });
  const value = got.json?.skills && typeof got.json.skills === "object" && !Array.isArray(got.json.skills) ? { skills: got.json.skills, truncated: Boolean(got.json.truncated) } : { error: got.error === "rate limited" ? "GitHub request limit reached; set GITHUB_TOKEN or try in an hour" : got.status === 404 ? "repository not found" : reasonOf(got) };
  ctx.trees.set(key, value);
  if (value.skills && ctx.treeCacheFile) {
    ctx.treeCache[key] = { at: new Date().toISOString(), value };
    try {
      fs.mkdirSync(path.dirname(ctx.treeCacheFile), { recursive: true });
      fs.writeFileSync(ctx.treeCacheFile, JSON.stringify(ctx.treeCache));
    } catch {}
  }
  return value;
}

const stems = (name) => new Set(name.toLowerCase().split(/[-_.]/).filter(Boolean).map((word) => (word.length > 4 ? word.replace(/(ing|ed|es|s|e)$/, "") : word)));

/** Another skill folder in the same repository whose name has the same word stems, such as expo-upgrade for upgrading-expo. */
function renamedTo(skillId, dirs) {
  const wanted = stems(skillId);
  return dirs.map((dir) => dir.split("/").at(-1)).find((name) => {
    if (name === skillId) return false;
    const have = stems(name);
    return have.size === wanted.size && [...wanted].every((word) => have.has(word));
  }) ?? null;
}

async function skillSearch(query, ctx) {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query.q)}${query.owner ? `&owner=${encodeURIComponent(query.owner)}` : ""}&limit=20`;
  const got = await ctx.fetcher.get(url);
  if (!Array.isArray(got.json?.skills)) return { ...query, error: reasonOf(got), items: [] };
  const items = [];
  let rejected = 0;
  for (const row of got.json.skills.slice(0, 20)) {
    const [rowOwner, rowRepo, extra] = String(row.source ?? "").toLowerCase().split("/");
    const skillId = String(row.skillId ?? row.name ?? "");
    if (extra !== undefined || !SAFE_NAME.test(rowOwner ?? "") || !SAFE_NAME.test(rowRepo ?? "") || !SAFE_NAME.test(skillId)) { rejected += 1; continue; }
    items.push({
      owner: rowOwner,
      repo: rowRepo,
      skillId,
      installs: Number(row.installs) || 0,
      vendor: Boolean(query.trusted) && rowOwner === query.owner,
      ...(query.named && !query.trusted && rowOwner === query.owner ? { namedPublisher: true } : {}),
      query: query.q,
    });
  }
  return { ...query, items, rejected };
}

const TRUST_ORDER = { vendor: 0, established: 1, "named publisher": 1, "small author": 2 };
const trustRank = (skill) => TRUST_ORDER[skill.trust.split(/[,(]/)[0].trim()] ?? 9;

/** How many of a need's words (by stem) appear in a skill's name, repository and description. */
const fitScore = (need, skill) => {
  const have = new Set([...stems(`${skill.skillId} ${skill.repo}`.replace(/\s+/g, "-")), ...stems(String(skill.description ?? "").replace(/[^A-Za-z0-9]+/g, "-"))]);
  return [...stems(need.replace(/\s+/g, "-"))].filter((word) => have.has(word)).length;
};

/** Whether a skill's folder still exists in its repository, from the repository listing (one request per repository, cached). */
async function existence(item, ctx) {
  const out = {};
  const tree = await repoSkills(item.owner, item.repo, ctx);
  const dirs = tree?.skills ? Object.keys(tree.skills) : [];
  const matches = dirs.filter((dir) => dir.split("/").at(-1) === item.skillId);
  if (!tree?.skills) out.exists = `not checked (${tree?.error ?? "no listing"})`;
  else if (matches.length > 1) out.exists = `ambiguous (${matches.length} folders named ${item.skillId})`;
  else if (!matches.length) {
    out.exists = tree.truncated ? "not found (repository listing truncated)" : "gone from the repository";
    const renamed = tree.truncated ? null : renamedTo(item.skillId, dirs);
    if (renamed) out.renamedTo = renamed;
  } else {
    out.exists = "yes";
    out.file = `${matches[0]}/SKILL.md`;
    out.otherFiles = Math.max(0, (tree.skills[matches[0]] ?? 1) - 1);
    if (tree.truncated) out.listingTruncated = true;
  }
  return out;
}

/** A skill that is gone, renamed or ambiguous, reported without reading its scans. */
function missingSkill(item, found, ctx) {
  const out = { ...item, id: `skill:${item.owner}/${item.repo}/${item.skillId}`, ...found, audit: "not read (the skill is not in its repository)" };
  out.installed = Boolean(installedFor(ctx.installed, item.owner, item.skillId));
  out.trust = "not shown";
  return out;
}

async function vetSkill(item, ctx, found) {
  const out = { ...item, id: `skill:${item.owner}/${item.repo}/${item.skillId}`, ...(found ?? await existence(item, ctx)) };
  const audit = await ctx.fetcher.get(`https://skills.sh/api/v1/skills/audit/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/${encodeURIComponent(item.skillId)}`);
  // The vendor's own skill that skills.sh has not scanned yet is still shown, with a note; anyone else's is dropped.
  out.audit = audit.status === 404 ? (item.vendor ? "not scanned yet" : "drop: not audited") : audit.json ? auditVerdict(audit.json.audits) : `not checked (${reasonOf(audit)})`;
  const dates = (audit.json?.audits ?? []).map((a) => Date.parse(a?.auditedAt)).filter(Number.isFinite);
  if (dates.length) out.auditedAt = new Date(Math.max(...dates)).toISOString().slice(0, 10);
  if (out.exists === "yes" && auditShowable(out.audit)) {
    const raw = await ctx.fetcher.get(`https://raw.githubusercontent.com/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/HEAD/${out.file.split("/").map(encodeURIComponent).join("/")}`, { json: false, accept: "text/plain" });
    if (raw.text) {
      out.rawUrl = raw.url;
      Object.assign(out, scanSkillText(raw.text));
      out.description = clean((raw.text.match(/^description:\s*(.+)$/m) ?? [])[1], 300) || null;
      if (out.otherFiles > 0) out.notes.push(`${out.otherFiles} other file${out.otherFiles === 1 ? "" : "s"} in the skill not scanned`);
      if (out.audit.startsWith("warn")) out.notes.push(`a safety scanner warned (${out.audit.slice(6)}); read the skill before recommending it`);
      if (out.audit === "not scanned yet") out.notes.push("skills.sh has not scanned this skill yet; read it before recommending it");
      if (out.listingTruncated) out.notes.push("GitHub listed only part of the repository, so another folder with this name may exist");
    } else out.scan = `not read (${reasonOf(raw)})`;
  }
  out.installed = Boolean(installedFor(ctx.installed, item.owner, item.skillId));
  out.trust = trustLevel(out);
  if (out.trust !== "not shown" && !out.trust.startsWith("not shown")) {
    const cli = ctx.aliases.skillsCli;
    if (cli?.install) out.install = cli.install.replace("{version}", cli.version).replace("{owner}", item.owner).replace("{repo}", item.repo).replace("{skill}", item.skillId);
  }
  return out;
}

// A SKILL.md in a hidden folder of the vendor's own codebase (.claude/skills, .agents/skills) is
// tooling for the vendor's engineers working on that codebase, such as react/react's extract-errors.
const CONTRIBUTOR_PATH = /(^|\/)\.(claude|agents|cursor|codex|github)\//;

function trustLevel(item) {
  if (item.exists !== "yes" || !auditShowable(item.audit) || !item.rawUrl || (item.flags?.length ?? 0) > 0) return "not shown";
  if (CONTRIBUTOR_PATH.test(item.file ?? "")) return "not shown: the vendor's own contributor tooling";
  const level = item.vendor ? "vendor" : item.namedPublisher ? "named publisher (confirm on the vendor's docs page that this GitHub account is theirs)" : item.installs >= 1000 ? "established" : "small author";
  return item.notes?.length ? `${level}, read the noted part first` : level;
}

// ---------------------------------------------------------------- MCP servers

/**
 * Whether an MCP Registry name is the publisher's own. `official`: under
 * `io.github.<owner>` (GitHub-verified) or under one of the vendor's domains
 * from Super-outer's own table. `unconfirmed`: `<tld>.<owner>` with no table
 * entry, which the agent confirms on the vendor's own docs page. A name under
 * a shared hosting domain such as `app.vercel` never counts.
 */
export function mcpOwnership(name, owner, { domains = [], sharedHosts = [], aliasNames = [] } = {}) {
  const labels = String(name ?? "").split("/")[0].toLowerCase().split(".");
  const wanted = [String(owner ?? "").toLowerCase(), ...aliasNames.map((alias) => alias.toLowerCase())].filter(Boolean);
  if (!wanted.length || labels.length < 2) return "other";
  if (sharedHosts.includes(`${labels[0]}.${labels[1]}`)) return "other";
  // Only the exact account counts: io.github.expo is Expo's account, io.github.expo.extra is not.
  if (labels[0] === "io" && labels[1] === "github") return labels.length === 3 && wanted.includes(labels[2]) ? "official" : "other";
  // A host name under the vendor's own domain needs control of that domain's DNS, so it counts
  // (Cloudflare's own server is com.cloudflare.mcp). Domains that give customers their own host names
  // are listed as shared hosts and never count.
  if (domains.includes(`${labels[1]}.${labels[0]}`)) return "official";
  return labels.length === 2 && wanted.includes(labels[1]) ? "unconfirmed" : "other";
}

async function mcpCandidates(owner, ctx) {
  const domains = ctx.aliases.domains?.[owner] ?? [];
  const aliasNames = (ctx.aliases.mcpNames?.[owner] ?? []).map((term) => term.replace(/^io\.github\./, ""));
  const terms = [...new Set([owner, ...(ctx.aliases.mcpNames?.[owner] ?? []), ...domains.map((domain) => `${domain.split(".").reverse().join(".")}`)])];
  const results = await Promise.all(terms.map((term) => ctx.fetcher.get(`https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(term)}&version=latest&limit=100`)));
  const failed = results.filter((got) => !Array.isArray(got.json?.servers));
  if (failed.length === results.length) return { owner, error: reasonOf(failed[0]), items: [] };
  const byName = new Map();
  let deprecated = 0;
  let empty = 0;
  for (const got of results) {
    for (const entry of got.json?.servers ?? []) {
      const server = entry?.server ?? entry;
      const ownership = mcpOwnership(server?.name, owner, { domains, sharedHosts: ctx.aliases.sharedHosts ?? [], aliasNames });
      if (ownership === "other" || byName.has(server.name)) continue;
      const status = entry?._meta?.["io.modelcontextprotocol.registry/official"]?.status;
      if (status && status !== "active") { deprecated += 1; continue; }
      const remotes = server.remotes ?? [];
      const packages = server.packages ?? [];
      if (!remotes.length && !packages.length) { empty += 1; continue; }
      const remote = remotes.find((r) => r.type === "streamable-http") ?? remotes[0];
      byName.set(server.name, {
        id: `mcp:${clean(server.name, 120)}`,
        name: clean(server.name, 120),
        version: clean(server.version, 30),
        ownership,
        transport: remote ? clean(remote.type, 30) : clean(packages[0].registryType ?? "package", 30),
        url: remote ? clean(remote.url, 200) : null,
        urlNeedsValue: Boolean(remote && /\{[^}]+\}/.test(remote.url ?? "")),
        remotes: remotes.length,
      });
    }
  }
  // Official first, then servers the vendor hosts (an address to connect to), then names that carry the vendor's own name.
  const named = (item) => Number(!item.name.split("/").slice(1).join("/").includes(owner));
  const items = [...byName.values()].sort((a, b) => Number(a.ownership !== "official") - Number(b.ownership !== "official") || Number(!a.url) - Number(!b.url) || named(a) - named(b));
  const rest = items.slice(LIMITS.mcpPerPublisher);
  return { owner, items: items.slice(0, LIMITS.mcpPerPublisher), more: rest.length, moreNames: rest.slice(0, 6).map((item) => item.name), deprecated, empty, truncated: results.some((got) => Boolean(got.json?.metadata?.nextCursor)) };
}

// ---------------------------------------------------------------- run

/** Runs the mechanical tool check for `root` and returns a plain-data result. */
export async function runToolCheck({ root, needs = [], extraPublishers = [], fetcher = createFetcher(), home = os.homedir(), aliases = readAliases(), now = new Date(), env = process.env, treeCacheFile = path.join(home, ".local", "share", "super-outer", "tool-check-trees.json") } = {}) {
  const facts = readStack(root, { aliases });
  const priv = privateNames(root, facts, home, env);
  const packageDirs = Object.keys(facts.manifests).map((file) => path.dirname(file));
  const locks = new Map(Object.keys(facts.manifests).filter((file) => path.basename(file) === "package.json").map((file) => [path.dirname(file), readLock(path.join(root, path.dirname(file)), root)]));
  for (const lock of locks.values()) for (const name of lock.privateNames ?? []) priv.names.add(name);
  const pyLocks = new Map([...new Set(packageDirs)].map((dir) => [dir, readPythonLock(path.join(root, dir))]));
  const ctx = { fetcher, aliases, priv, locks, pyLocks, trees: new Map(), installed: installedSkills(home), treeCacheFile, treeCache: treeCacheFile ? readTreeCache(treeCacheFile) : {} };
  const deps = [];
  for (const [manifest, entries] of Object.entries(facts.manifests)) {
    for (const dep of entries) deps.push({ ...dep, manifest });
  }
  // Runtime packages go first, so a request limit reached on a large project falls on build tools.
  deps.sort((a, b) => Number(Boolean(a.dev)) - Number(Boolean(b.dev)));
  const checked = await Promise.all(deps.map((dep) => {
    const file = path.basename(dep.manifest);
    if (file === "package.json") return checkNpm(dep, ctx);
    if (file === "requirements.txt" || file === "pyproject.toml") return checkPypi(dep, ctx);
    return { ecosystem: file, name: dep.name, spec: dep.version, manifest: dep.manifest, state: "not checked by this command" };
  }));

  const frameworks = [];
  for (const [name, entry] of Object.entries(aliases.frameworks ?? {})) {
    for (const dep of checked.filter((item) => item.name === name && item.ecosystem === "npm")) {
      const result = await checkFramework(name, entry, dep, checked, ctx);
      if (result) frameworks.push(result);
    }
  }
  const manyManifests = Object.keys(facts.manifests).length > 1;
  const findings = buildFindings(checked, frameworks, manyManifests);

  // Publishers confirmed by the project itself: a platform file, Super-outer's own table, or a package
  // whose name matches its repository owner. A publisher the agent names with --publisher is searched
  // but not trusted unless it is one of these.
  const platformOwners = Object.entries(aliases.platformFiles ?? {}).filter(([file]) => facts.config.includes(file)).map(([, owner]) => owner);
  const confirmed = new Set([...platformOwners, ...checked.filter((dep) => dep.ownerVerified && dep.owner && !dep.deprecated).map((dep) => dep.owner)]);
  const named = extraPublishers.map((value) => String(value).toLowerCase()).filter((value) => SAFE_NAME.test(value));

  // Skill searches, most relevant first: each upgraded framework's upgrade skill, the platform the project
  // runs on, runtime packages with findings, then other runtime packages, then vendors the agent found on
  // the web (--publisher) and the task's needs. A package is searched by its own name, filtered to its
  // publisher, so a publisher's unrelated repositories stay out. Build tools are never searched: a finding
  // about TypeScript says nothing about what the product needs.
  const queries = [];
  const add = (query) => {
    if (!query.q || queries.some((other) => other.q === query.q && other.owner === query.owner)) return;
    queries.push(query);
  };
  for (const fw of frameworks) {
    const dep = checked.find((item) => item.name === fw.framework && item.manifest === fw.manifest);
    if (dep?.owner && findings.some((finding) => finding.kind === "upgrade" && finding.name === fw.framework)) add({ q: `${fw.framework} upgrade`, owner: dep.owner, trusted: dep.ownerVerified });
  }
  for (const owner of platformOwners) add({ q: owner, owner, trusted: true });
  const searchName = (dep) => scopeOf(dep.name) ?? dep.name;
  // A build tool from the platform's own vendor is the platform's tool (wrangler for a Worker), and its
  // name finds the vendor's skills for that platform, which a search by the vendor's name ranks lower.
  for (const dep of checked.filter((d) => d.dev && d.owner && platformOwners.includes(d.owner) && !scopeOf(d.name) && (d.state === "behind" || d.state?.startsWith("current")))) add({ q: dep.name, owner: dep.owner, trusted: true });
  const withFindings = new Set(findings.map((finding) => finding.name));
  const looked = checked.filter((dep) => dep.owner && !dep.dev && !dep.deprecated && !dep.managedBy && (dep.state === "behind" || dep.state?.startsWith("current")));
  for (const dep of looked.filter((d) => withFindings.has(d.name))) add({ q: searchName(dep), owner: dep.owner, trusted: dep.ownerVerified });
  for (const dep of looked.filter((d) => !withFindings.has(d.name))) add({ q: searchName(dep), owner: dep.owner, trusted: dep.ownerVerified });
  for (const owner of named) add({ q: owner, owner, trusted: confirmed.has(owner), named: true });
  const own = ownNames(root, priv);
  const needsRefused = [];
  for (const need of needs.slice(0, 4)) {
    const problem = needProblem(need, own);
    if (problem) needsRefused.push({ need: clean(need, 60), problem });
    else add({ q: need.trim().replace(/\s+/g, " "), owner: null, trusted: false, need: true });
  }
  const chosen = [...queries.filter((q) => q.named || q.need), ...queries.filter((q) => !q.named && !q.need)].slice(0, LIMITS.maxQueries);

  const searches = await Promise.all(chosen.map((query) => skillSearch(query, ctx)));
  const seen = new Set();
  const key = (item) => `${item.owner}/${item.repo}/${item.skillId}`;
  const skills = [];
  const searchReport = [];
  for (const search of searches) {
    // Walk down the results in batches: check each still exists (gone names take no place), vet the ones
    // that do, and stop once keepPerQuery passed every check or twice vetPerQuery results were looked at.
    const pool = search.items.filter((item) => !seen.has(key(item)));
    const vetted = [];
    const missing = [];
    let next = 0;
    while (vetted.filter((skill) => !skill.trust.startsWith("not shown")).length < LIMITS.keepPerQuery && next < pool.length && next < LIMITS.vetPerQuery * 2) {
      const batch = pool.slice(next, next + LIMITS.vetPerQuery);
      next += batch.length;
      const found = await Promise.all(batch.map((item) => existence(item, ctx)));
      const present = [];
      batch.forEach((item, index) => (/^(yes|not checked)/.test(found[index].exists) ? present : missing).push([item, found[index]]));
      vetted.push(...await Promise.all(present.map(([item, exists]) => vetSkill(item, ctx, exists))));
    }
    pool.slice(0, next).forEach((item) => seen.add(key(item)));
    if (search.need) for (const skill of vetted) skill.fit = fitScore(search.q, skill);
    // For a need, how well the skill matches the words comes before trust; for a package, trust comes first.
    const order = (a, b) => (search.need ? (b.fit ?? 0) - (a.fit ?? 0) : 0) || trustRank(a) - trustRank(b) || b.installs - a.installs;
    const shown = vetted.filter((skill) => !skill.trust.startsWith("not shown")).sort(order).slice(0, LIMITS.keepPerQuery);
    const hidden = [...vetted.filter((skill) => !shown.includes(skill)), ...missing.map(([item, found]) => missingSkill(item, found, ctx))];
    skills.push(...shown, ...hidden.map((skill) => ({ ...skill, hiddenReason: true })));
    searchReport.push({ q: search.q, owner: search.owner ?? null, need: Boolean(search.need), error: search.error ?? null, found: search.items.length, rejected: search.rejected ?? 0, shown: shown.length, hidden: hidden.length });
  }

  const publisherOwners = [...new Set([...platformOwners, ...confirmed, ...named])].slice(0, 8);
  const mcp = await Promise.all(publisherOwners.map(async (owner) => ({ ...(await mcpCandidates(owner, ctx)), ...(confirmed.has(owner) ? {} : { namedOnly: true }) })));

  return {
    schema_version: "3.1.0",
    checked_at: now.toISOString(),
    manifest_hash: manifestHash(root),
    stack: Object.fromEntries(Object.entries(facts.manifests).map(([file, entries]) => [file, entries.map((dep) => (dep.version ? `${dep.name}@${dep.version}` : dep.name))])),
    config: facts.config,
    unread: [...facts.unread, ...facts.deeper],
    samples: facts.samples ?? [],
    publishers: publisherOwners,
    named,
    needsRefused,
    locks: [...locks].filter(([, lock]) => lock.from).map(([dir, lock]) => ({ dir, from: lock.from })),
    dependencies: checked.map(({ versions, dist, ...rest }) => rest),
    frameworks,
    findings,
    skills,
    searches: searchReport,
    mcp,
    installed: ctx.installed.filter((skill) => publisherOwners.some((owner) => skill.source?.startsWith(`${owner}/`))).map((skill) => `${skill.source}:${skill.name}`),
    budget: { requests: fetcher.stats.requests, failed: fetcher.stats.failed, refused: fetcher.stats.refused, failures: fetcher.stats.failures ?? {}, limit: LIMITS.maxRequests },
  };
}

function buildFindings(checked, frameworks, manyManifests) {
  const findings = [];
  const suffix = (manifest) => (manyManifests ? `@${path.dirname(manifest) === "." ? "root" : path.dirname(manifest)}` : "");
  for (const fw of frameworks) {
    const from = parseVersion(fw.pinned).major;
    const to = parseVersion(fw.latest).major;
    if (to > from) {
      const sameRemoved = fw.removedNext.join(",") === fw.removedLatest.join(",");
      // The id names the step, so a yes to 54 to 55 is not read as a yes to 55 to 56.
      const step = fw.oneAtATime ? from + 1 : to;
      findings.push({
        id: `upgrade:${fw.framework}:${from}-to-${step}${suffix(fw.manifest)}`,
        name: fw.framework,
        manifest: fw.manifest,
        kind: "upgrade",
        step: `${from} to ${step}`,
        title: `Upgrade ${fw.framework} ${from} to ${to}`,
        detail: [
          `${to - from} versions behind (installed ${fw.pinned}, latest ${fw.latest}).`,
          fw.oneAtATime && fw.next ? `The vendor recommends one version at a time; next is ${fw.next}. This finding covers ${from} to ${step}; the next step gets its own finding once this one is done.` : null,
          fw.removedNext.length ? `No longer in ${fw.framework} ${from + 1}: ${fw.removedNext.join(", ")}.` : null,
          fw.removedLatest.length && !sameRemoved ? `No longer in ${fw.framework} ${to}: ${fw.removedLatest.join(", ")}.` : null,
        ].filter(Boolean).join(" "),
        guide: fw.guide,
      });
    }
    for (const peer of fw.mismatched) {
      findings.push({ id: `mismatch:${peer.name}${suffix(fw.manifest)}`, name: peer.name, manifest: fw.manifest, kind: peer.major ? "mismatch" : "mismatch-minor", title: `${peer.name} does not match ${fw.framework} ${from}`, detail: `Installed ${peer.pinned}; ${fw.framework} ${fw.pinned} expects ${peer.expected}${peer.major ? "" : " (a small version step)"}.`, check: fw.check });
    }
  }
  for (const dep of checked) {
    // PyPI ids carry the ecosystem, so an npm and a Python package of the same name in one folder stay apart.
    const key = dep.ecosystem === "pypi" ? `pypi:${dep.name}` : dep.name;
    if (dep.deprecated) findings.push({ id: `deprecated:${key}${suffix(dep.manifest)}`, name: dep.name, manifest: dep.manifest, kind: "deprecated", title: `${dep.name} is deprecated`, notice: dep.deprecated, detail: "" });
    else if (dep.deprecatedPinned) findings.push({ id: `deprecated:${key}@${dep.pinned}${suffix(dep.manifest)}`, name: dep.name, manifest: dep.manifest, kind: "deprecated", title: `${dep.name} ${dep.pinned} is deprecated`, notice: dep.deprecatedPinned, detail: dep.latest ? `Latest is ${dep.latest}.` : "" });
    if (dep.state === "behind" && !dep.managedBy && !frameworks.some((fw) => fw.framework === dep.name && fw.manifest === dep.manifest)) {
      const where = dep.lockedFrom ? " (from the lock file)" : "";
      const majors = `${dep.majorsBehind} major ${dep.majorsBehind === 1 ? "version" : "versions"} behind`;
      const detail = dep.capped ? `The requirement ${dep.pinned} keeps it below the latest, ${dep.latest} (${majors}).`
        : dep.zeroMinorBehind ? `Installed ${dep.pinned}${where}, latest ${dep.latest}; in 0.x versions a minor release can break.`
        : `Installed ${dep.pinned}${where}, latest ${dep.latest} (${majors}).`;
      findings.push({ id: `behind:${key}${suffix(dep.manifest)}`, name: dep.name, manifest: dep.manifest, kind: dep.dev ? "behind-dev" : "behind", title: `${dep.name} is behind${dep.dev ? " (build tool)" : ""}`, detail });
    }
  }
  // One finding per id: a package named twice must not give two findings that one answer would both cover.
  const unique = [...new Map(findings.map((finding) => [finding.id, finding])).values()];
  const order = { upgrade: 0, deprecated: 1, mismatch: 2, behind: 3, "mismatch-minor": 4, "behind-dev": 5 };
  return unique.sort((a, b) => order[a.kind] - order[b.kind]);
}

// ---------------------------------------------------------------- record

const allItems = (record) => [...(record?.findings ?? []), ...(record?.skills ?? []), ...(record?.mcp ?? []).flatMap((group) => group?.items ?? [])];

/** Whether an answered item counts as answered now: "later" comes back after LATER_DAYS. */
export function stillAnswered(item, now = new Date()) {
  if (!ANSWERS.includes(item?.answer)) return false;
  if (item.answer !== "later") return true;
  const at = Date.parse(item.answeredAt);
  // A date in the future (a wrong clock or an edited record) would otherwise hide the item for good.
  return Number.isFinite(at) && at <= now.getTime() + DAY_MS && now.getTime() - at < LATER_DAYS * DAY_MS;
}

/** The new record, keeping the owner's earlier answers by id; a "later" answer older than LATER_DAYS is cleared. */
export function mergeRecord(previous, result, now = new Date()) {
  const answers = new Map();
  // Items the owner was shown stay marked across reruns, so the session-start reminder keeps counting them.
  const shown = new Set();
  for (const item of allItems(previous)) {
    if (item?.id && stillAnswered(item, now)) answers.set(item.id, { answer: item.answer, answeredAt: item.answeredAt ?? null });
    if (item?.id && item.shown === true) shown.add(item.id);
  }
  const withAnswer = (item) => ({ ...item, ...(shown.has(item.id) ? { shown: true } : {}), answer: answers.get(item.id)?.answer ?? null, answeredAt: answers.get(item.id)?.answeredAt ?? null });
  return {
    ...result,
    findings: result.findings.map(withAnswer),
    skills: result.skills.map(withAnswer),
    mcp: result.mcp.map((group) => ({ ...group, items: group.items.map(withAnswer) })),
  };
}

/** Writes the record, refusing a symbolic link in its place or a linked folder that leads outside the project. */
export function writeRecord(root, record) {
  const file = path.join(root, TOOL_CHECK_PATH);
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`${TOOL_CHECK_PATH} is a symbolic link; refusing to write through it.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!insideProject(root, path.dirname(file))) throw new Error(`${path.dirname(TOOL_CHECK_PATH)} leads outside the project through a linked folder; refusing to write there.`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

function updateItems(root, ids, change) {
  const record = readToolCheck(root);
  if (!record) throw new Error(`No tool check record at ${TOOL_CHECK_PATH}. Run super-outer tool-check run --write first.`);
  const wanted = new Set(ids);
  const found = new Set();
  const mark = (item) => {
    if (!wanted.has(item?.id)) return item;
    found.add(item.id);
    return change(item);
  };
  record.findings = (record.findings ?? []).map(mark);
  record.skills = (record.skills ?? []).map(mark);
  record.mcp = (record.mcp ?? []).map((group) => ({ ...group, items: (group.items ?? []).map(mark) }));
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length) throw new Error(`No finding or candidate with id ${missing.map((id) => clean(id, 80)).join(", ")}.`);
  writeRecord(root, record);
  return [...found];
}

/** Marks the items the agent showed the owner in the Tools block; only these are followed up at session start. */
export function markShown(root, ids) {
  return updateItems(root, ids, (item) => ({ ...item, shown: true }));
}

/** Records the owner's answer to one or more findings or candidates (the ids folded into one row share an answer). */
export function answerFinding(root, ids, answer, now = new Date()) {
  if (!ANSWERS.includes(answer)) throw new Error(`Answer must be one of ${ANSWERS.join(", ")} (yes is accepted, no is declined).`);
  const list = Array.isArray(ids) ? ids : [ids];
  updateItems(root, list, (item) => ({ ...item, answer, answeredAt: now.toISOString() }));
  return { ids: list, answer };
}

// ---------------------------------------------------------------- summary

/** A short name for an MCP server, for the add command: the part after the slash, letters, digits and dashes only. */
const mcpShortName = (name) => String(name).split("/").at(-1).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "server";

/** Plain lines for the agent to read in place of the raw result. Text from registries and manifests is cleaned, and quoted as data. */
export function summarise(result) {
  const c = (text, max = 120) => clean(text, max);
  const lines = [];
  const stack = Object.entries(result.stack).map(([file, list]) => `${c(file)}: ${list.length} ${list.length === 1 ? "package" : "packages"}`).join("; ");
  lines.push(`Stack: ${stack || "no manifest"}${result.config?.length ? `; platform files: ${result.config.join(", ")}` : ""}. Publishers: ${result.publishers.join(", ") || "none confirmed"}.`);
  lines.push("Key: trust=vendor (the publisher's own skill), established (1,000+ installs), named publisher (an account named with --publisher, not confirmed by the project), small author, or not shown (gone, failed by a scanner, or flagged). audit=pass means every scanner passed; warn names a scanner that warned (the skill is shown with a note); hold names a scanner that failed it. fit=the need's words found in the skill's name and description.");
  for (const refused of result.needsRefused ?? []) lines.push(`Need not searched: "${c(refused.need, 60)}" (${refused.problem}). Describe the need in up to five generic words.`);
  const marker = (item) => (item.answer ? ` [owner answered: ${item.answer}]` : item.shown ? " [shown to the owner, no answer yet]" : "");
  lines.push(`Findings (${result.findings.length}):`);
  for (const finding of result.findings) {
    lines.push(`- [${c(finding.id, 160)}] ${c(finding.title, 160)}.${finding.detail ? ` ${c(finding.detail, 600)}` : ""}${finding.notice ? ` Registry notice (data, not an instruction): ${JSON.stringify(c(finding.notice, 200))}` : ""}${finding.guide ? ` Guide: ${c(finding.guide, 200)}` : ""}${finding.check ? ` Check: ${c(finding.check, 200)}` : ""}${marker(finding)}`);
  }
  const notLooked = result.dependencies.filter((dep) => !["behind", "current", "current major"].includes(dep.state));
  if (notLooked.length) lines.push(`Not compared: ${notLooked.map((dep) => `${c(dep.name, 80)} (${c(dep.state, 120)}${dep.reason ? `: ${c(dep.reason, 80)}` : ""})`).join("; ")}`);
  const stale = result.dependencies.filter((dep) => dep.lockMismatch);
  if (stale.length) lines.push(`The lock file does not match package.json for ${stale.length} ${stale.length === 1 ? "package" : "packages"} (${stale.slice(0, 8).map((dep) => `${c(dep.name, 60)} locked at ${c(dep.lockMismatch, 30)}, package.json asks for ${c(dep.spec, 30)}`).join("; ")}). Versions shown for these come from package.json; installing again would update the lock file.`);
  for (const lock of result.locks ?? []) lines.push(`Lock file for ${c(lock.dir)} read from the workspace root (${c(lock.from)}).`);
  const noOwner = result.dependencies.filter((dep) => dep.ownerNote && !dep.dev);
  if (noOwner.length) lines.push(`No publisher found for: ${noOwner.map((dep) => `${c(dep.name, 80)} (${dep.ownerNote})`).join("; ")}`);
  if (result.unread.length) lines.push(`Manifests not read: ${result.unread.map((file) => c(file)).join(", ")}`);
  if (result.samples?.length) lines.push(`Sample and test folders not read: ${result.samples.map((file) => c(file)).join(", ")}`);
  const installed = result.installed ?? [];
  lines.push(`Installed from these publishers: ${installed.slice(0, 10).map((name) => c(name, 80)).join(", ") || "none found"}${installed.length > 10 ? `, and ${installed.length - 10} more` : ""}`);
  lines.push("Skill candidates (judge fit from the SKILL.md before recommending):");
  for (const search of result.searches) {
    if (search.error) lines.push(`- search "${c(search.q, 80)}"${search.owner ? ` (${search.owner})` : ""} FAILED (${c(search.error, 80)}). Say "could not check" for it, never "nothing found".`);
  }
  const shown = result.skills.filter((skill) => !skill.hiddenReason);
  for (const skill of shown) {
    lines.push(`- [${skill.id}] trust=${skill.trust}${skill.fit !== undefined ? ` fit=${skill.fit}` : ""} installs=${skill.installs} audit=${c(skill.audit, 80)}${skill.auditedAt ? ` (${skill.auditedAt})` : ""}${skill.installed ? " INSTALLED" : ""}${skill.notes?.length ? ` NOTE: ${skill.notes.map((note) => c(note, 160)).join("; ")}` : ""} read: ${skill.rawUrl}${skill.install ? ` install: ${skill.install}` : ""}${marker(skill)}`);
  }
  const hidden = result.skills.filter((skill) => skill.hiddenReason);
  // Not verified: a check that could not run (GitHub's limit, a timeout, a budget). These are unknown, not rejected.
  const unverified = hidden.filter((skill) => /^not checked/.test(skill.exists ?? "") || /^not checked/.test(skill.audit ?? "") || /^not read/.test(skill.scan ?? ""));
  if (unverified.length) {
    const reasonFor = (skill) => (/^not checked/.test(skill.exists ?? "") ? skill.exists : /^not checked/.test(skill.audit ?? "") ? `audit ${skill.audit}` : `SKILL.md ${skill.scan}`);
    const reasons = [...new Set(unverified.map((skill) => c(reasonFor(skill), 100)))];
    lines.push(`- ${unverified.length} ${unverified.length === 1 ? "candidate" : "candidates"} could not be verified (${reasons.join("; ")}): ${unverified.map((skill) => `${skill.owner}/${skill.repo}/${skill.skillId}`).join(", ")}. Say "could not check" for these.`);
  }
  for (const skill of hidden.filter((s) => !unverified.includes(s))) {
    const why = skill.exists !== "yes" ? skill.exists : skill.audit !== "pass" ? `audit ${skill.audit}` : skill.flags?.length ? `FLAGS: ${skill.flags.join(", ")}` : skill.trust;
    lines.push(`- not shown: ${skill.owner}/${skill.repo}/${skill.skillId} (${c(why, 160)})${skill.renamedTo ? `; the repository now has ${skill.renamedTo}` : ""}`);
  }
  if (!shown.length) {
    if (result.searches.some((s) => s.error) || unverified.length) lines.push("- no candidate could be verified in full: report \"could not check\" for the searches and candidates above, never \"nothing found\"");
    else if (result.searches.length) lines.push("- nothing passed every check");
  }
  lines.push("MCP servers (official: the vendor's GitHub account or a known vendor domain; unconfirmed: confirm on the vendor's own docs page). The add line connects the server in Claude Code for this project only; other hosts follow the vendor's page:");
  for (const group of result.mcp) {
    if (group.namedOnly) lines.push(`- ${group.owner}: named with --publisher and not confirmed by the project; confirm on the vendor's docs page that this account is theirs.`);
    if (group.error) lines.push(`- ${group.owner}: registry search FAILED (${c(group.error, 80)}). Say "could not check" for it.`);
    for (const item of group.items) {
      const read = `read: https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(item.name)}&version=latest`;
      const canAdd = item.url && !item.urlNeedsValue && /^(streamable-http|sse)$/.test(item.transport ?? "") && /^https:\/\/[^\s"'`$;|&<>]+$/.test(item.url);
      const addLine = canAdd ? ` add: claude mcp add --transport ${item.transport === "sse" ? "sse" : "http"} --scope project ${mcpShortName(item.name)} ${item.url}` : "";
      lines.push(`- [${item.id}] ${item.ownership} ${item.version} ${item.transport ?? ""} ${item.url ?? ""}${item.remotes > 1 ? ` (${item.remotes} addresses listed)` : ""}${item.urlNeedsValue ? " (address needs a value filled in)" : ""} ${read}${addLine}${marker(item)}`.replace(/\s+/g, " ").trim());
    }
    if (!group.error && !group.items.length) lines.push(`- ${group.owner}: none found under this name. The vendor may publish under another name; search the registry for its product name before saying it has none.`);
    const extras = [group.more ? `${group.more} more not listed${group.moreNames?.length ? ` (${group.moreNames.map((name) => c(name, 80)).join(", ")}${group.more > group.moreNames.length ? ", ..." : ""})` : ""}` : null, group.deprecated ? `${group.deprecated} deprecated dropped` : null, group.empty ? `${group.empty} with no address dropped` : null, group.truncated ? "more registry pages not read" : null].filter(Boolean);
    if (extras.length) lines.push(`- ${group.owner}: ${extras.join("; ")}`);
  }
  const b = result.budget;
  const failures = Object.entries(b.failures ?? {}).map(([what, count]) => `${what} x${count}`).join(", ");
  lines.push(`Requests: ${b.requests} of ${b.limit}; failed ${b.failed}${failures ? ` (${failures})` : ""}; not sent because of the limit ${b.refused}${b.refused ? ". The project has more packages than one run checks; run again with --dir on one package folder to check the rest" : ""}.`);
  return lines.join("\n");
}
