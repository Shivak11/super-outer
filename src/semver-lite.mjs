/**
 * Just enough of npm's version-range rules for the tool check to decide which
 * release a project pins and how far behind it is. Pure functions, no
 * dependencies. Ranges it cannot read come back as `null`, and the tool check
 * reports them as "unparseable" instead of guessing.
 */

const VERSION = /^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** `{ major, minor, patch, pre }` for a full version such as `4.1.1` or `58.0.0-canary.3`, or null. */
export function parseVersion(text) {
  const match = String(text ?? "").trim().match(VERSION);
  if (!match || match[2] === undefined || match[3] === undefined || /[xX*]/.test(match[2] + match[3])) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? null };
}

/** Negative, zero or positive, as `a` is lower than, equal to or higher than `b`. */
export function compareVersions(a, b) {
  for (const key of ["major", "minor", "patch"]) if (a[key] !== b[key]) return a[key] - b[key];
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/** A partial version such as `4`, `4.1` or `4.x`, with the missing parts as null. */
function parsePartial(text) {
  const match = String(text).trim().match(VERSION);
  if (!match) return null;
  const part = (value) => (value === undefined || /[xX*]/.test(value) ? null : Number(value));
  return { major: Number(match[1]), minor: part(match[2]), patch: part(match[3]), pre: match[4] ?? null };
}

const floor = (p) => ({ major: p.major, minor: p.minor ?? 0, patch: p.patch ?? 0, pre: p.pre });

/** One comparator set, such as `^4.1.1` or `>=2 <3`, as a list of [operator, version] tests. */
function comparators(set) {
  const tests = [];
  const hyphen = set.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (hyphen) {
    const low = parsePartial(hyphen[1]);
    const high = parsePartial(hyphen[2]);
    if (!low || !high) return null;
    tests.push([">=", floor(low)]);
    if (high.minor === null) tests.push(["<", { major: high.major + 1, minor: 0, patch: 0, pre: null }]);
    else if (high.patch === null) tests.push(["<", { major: high.major, minor: high.minor + 1, patch: 0, pre: null }]);
    else tests.push(["<=", floor(high)]);
    return tests;
  }
  for (const token of set.trim().split(/\s+/).filter(Boolean)) {
    const match = token.match(/^(\^|~|>=|<=|>|<|=)?(.+)$/);
    const operator = match[1] ?? "";
    if (/^[xX*]$/.test(match[2])) continue;
    const p = parsePartial(match[2]);
    if (!p) return null;
    if (operator === "^") {
      tests.push([">=", floor(p)]);
      if (p.major > 0 || p.minor === null) tests.push(["<", { major: p.major + 1, minor: 0, patch: 0, pre: null }]);
      else if (p.minor > 0 || p.patch === null) tests.push(["<", { major: 0, minor: p.minor + 1, patch: 0, pre: null }]);
      else tests.push(["<", { major: 0, minor: 0, patch: p.patch + 1, pre: null }]);
    } else if (operator === "~") {
      tests.push([">=", floor(p)]);
      tests.push(["<", p.minor === null ? { major: p.major + 1, minor: 0, patch: 0, pre: null } : { major: p.major, minor: p.minor + 1, patch: 0, pre: null }]);
    } else if (operator === "" || operator === "=") {
      if (p.minor === null) tests.push([">=", floor(p)], ["<", { major: p.major + 1, minor: 0, patch: 0, pre: null }]);
      else if (p.patch === null) tests.push([">=", floor(p)], ["<", { major: p.major, minor: p.minor + 1, patch: 0, pre: null }]);
      else tests.push(["=", floor(p)]);
    } else tests.push([operator, floor(p)]);
  }
  return tests;
}

/** The parsed form of an npm range, or null when it cannot be read. `*`, `x` and `""` mean any version. */
export function parseRange(range) {
  const text = String(range ?? "").trim();
  if (text === "" || text === "*" || /^[xX]$/.test(text)) return [[]];
  const sets = text.split("||").map(comparators);
  return sets.some((set) => set === null) ? null : sets;
}

function passes(version, [operator, bound]) {
  const order = compareVersions(version, bound);
  return { "=": order === 0, ">": order > 0, ">=": order >= 0, "<": order < 0, "<=": order <= 0 }[operator];
}

/** Whether `version` (a parsed full version) is inside the parsed range. Prereleases match only when the range names one. */
export function satisfies(version, parsedRange) {
  return parsedRange.some((set) => {
    if (!set.every((test) => passes(version, test))) return false;
    return version.pre === null || set.some(([, bound]) => bound.pre !== null && bound.major === version.major && bound.minor === version.minor && bound.patch === version.patch);
  });
}

/** The highest version in `versions` (strings) that the range allows, or null. */
export function maxSatisfying(versions, range) {
  const parsed = parseRange(range);
  if (!parsed) return null;
  let best = null;
  let bestText = null;
  for (const text of versions) {
    const version = parseVersion(text);
    if (!version || !satisfies(version, parsed)) continue;
    if (!best || compareVersions(version, best) > 0) {
      best = version;
      bestText = text;
    }
  }
  return bestText;
}

/**
 * What kind of npm dependency spec this is. Only `registry` specs are looked
 * up; the rest are local, private or unpinned and are never sent anywhere.
 */
export function specKind(spec) {
  const text = String(spec ?? "").trim();
  if (/^workspace:/.test(text)) return "workspace";
  if (/^(file|link|portal):/.test(text)) return "local";
  if (/^npm:/.test(text)) return "alias";
  if (/^(git\+|git:|github:|gitlab:|bitbucket:)|^[\w.-]+\/[\w.-]+(#.*)?$/.test(text)) return "git";
  if (/^https?:/.test(text)) return "url";
  if (text === "" || text === "*" || text === "latest" || text === "next") return "unpinned";
  if (/^[a-z][\w-]*$/i.test(text)) return "tag";
  return parseRange(text) ? "registry" : "unparseable";
}

/**
 * A Python version such as `2.31`, `2.0.0rc1`, `1.2.3.post1` or `2.0.*`, in
 * the shape `parseVersion` returns. A release candidate, alpha, beta or dev
 * release becomes `pre`; a post release counts as its base release. Null when
 * it cannot be read.
 */
export function pythonVersion(text) {
  const match = String(text ?? "").trim().toLowerCase().match(/^v?(?:\d+!)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.\d+)*(?:\.\*)?(?:[-_.]?(a|b|c|rc|alpha|beta|pre|preview|dev)[-_.]?(\d*))?(?:[-_.]?(?:post|rev|r)[-_.]?\d*)?(?:\.?dev\d*)?(?:\+[a-z0-9.]+)?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2] ?? 0), patch: Number(match[3] ?? 0), pre: match[4] ? `${match[4]}${match[5] ?? ""}` : null };
}

/**
 * How a Python requirement pins its package: `exact` (`==2.31.0`), `wildcard`
 * (`==2.0.*`), `compatible` (`~=2.8`, or Poetry's `^1.2` and `~1.2`), `capped`
 * (an upper bound such as `<10`), `minimum` (only `>=`), or `none`. `base` is
 * the version it pins or starts from and `upper` the bound it stays below.
 */
export function pythonSpec(spec) {
  const text = String(spec ?? "").trim();
  if (!text || text === "*") return { kind: "none" };
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const out = { kind: "none", base: null, upper: null, exact: null };
  for (const part of parts) {
    const match = part.match(/^(===|==|~=|<=|>=|!=|<|>|\^|~)?\s*(.+)$/);
    if (!match) continue;
    const [, op = "==", value] = match;
    const version = pythonVersion(value);
    if (!version) continue;
    if ((op === "==" || op === "===") && /\.\*$/.test(value)) { out.kind = "wildcard"; out.base = version; }
    else if (op === "==" || op === "===") { out.kind = "exact"; out.base = version; out.exact = value.trim(); }
    else if (op === "~=" || op === "^" || op === "~") {
      if (out.kind !== "exact") out.kind = "compatible";
      out.base = version;
      // PEP 440: ~=0.9 means 0.9 or later within 0.*, so it never pins a minor version.
      out.majorOnly = op === "~=" && value.trim().split(".").length === 2;
    }
    else if (op === "<" || op === "<=") out.upper = { ...version, inclusive: op === "<=" };
    else if (op === ">=" || op === ">") { if (!out.base) out.base = version; }
  }
  if (out.kind === "none" && out.upper) out.kind = "capped";
  else if (out.kind === "none" && out.base) out.kind = "minimum";
  return out;
}

/** The version a Python requirement pins or starts from (`==2.31.0`, `~=2.8`, `>=0.110`), or null. */
export function pythonBase(spec) {
  const parsed = pythonSpec(spec);
  return parsed.base ? { ...parsed.base, pre: null } : null;
}
