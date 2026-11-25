import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { classifyChangeShape, outranksMaintenance } from "./change-shape.mjs";

const CORE_ARCHETYPE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../skills/super-outer/references/archetypes",
);

/**
 * Archetypes match on *product* nouns — "voice", "recording", "upload",
 * "refunds" — because that is the vocabulary owners actually type.
 *
 * This is the whole reason the layer exists. `triggerGroups` in constants.mjs
 * matches engineering vocabulary (`retry`, `idempotency`, `backfill`) that a
 * person describing a feature never says, which is why a plainly worded request
 * selected zero specialists and left nobody in the room to anticipate anything.
 */

const singular = (word) =>
  word
    .replace(/\b(\w+)ies\b/g, "$1y")
    .replace(/\b(\w+(?:s|sh|ch|x|z))es\b/g, "$1")
    .replace(/\b(\w{3,})s\b/g, "$1");

/**
 * Some two-word names belong to one developer thing. A feature flag is a code
 * switch, an app server is a running process, and an event listener is a
 * function. Each is joined into one word before matching, so its first word
 * cannot complete a product phrase: "retire this feature flag" does not match
 * "retire this feature", and "track event listeners" does not match "track
 * event". The same joining is applied to the phrases themselves.
 */
const DEVELOPER_COMPOUNDS = Object.freeze(
  [
    "feature flag", "feature toggle",
    "app server", "app process", "app connection", "app worker",
    "app store connect",
    "event listener", "event loop", "event handler", "event emitter", "event bus",
  ]
    // Matching runs on singular words ("process" becomes "proces"), so each
    // name is made singular the same way before it is joined.
    .map(singular)
    .map((compound) => [new RegExp(`(?<= )${compound}(?= )`, "g"), compound.replaceAll(" ", "")]),
);

const normalise = (text) =>
  DEVELOPER_COMPOUNDS.reduce(
    (current, [pattern, joined]) => current.replace(pattern, joined),
    ` ${singular(String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())} `,
  );

const asArray = (value) => (Array.isArray(value) ? value : []);

function parseArchetype(raw, source) {
  if (!raw || typeof raw !== "object") return null;
  const { id, name, matches, modules, failureModes } = raw;
  if (!id || !Array.isArray(matches) || !Array.isArray(failureModes)) return null;
  return {
    id: String(id),
    name: String(name ?? id),
    matches: matches.map(String),
    modules: asArray(modules).map(String),
    failureModes: failureModes.filter((mode) => mode?.id && mode?.prompt),
    source,
  };
}

function readDirectory(directory, source) {
  const archetypes = new Map();
  try {
    if (!statSync(directory).isDirectory()) return archetypes;
  } catch {
    // A missing vault is the ordinary case under Codex, Cursor, CI, and any
    // install that is not the author's laptop. Degrade silently, as the glossary does.
    return archetypes;
  }
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = parseArchetype(
        JSON.parse(readFileSync(join(directory, name), "utf8")),
        source,
      );
      if (parsed) archetypes.set(parsed.id, parsed);
    } catch {
      // A malformed entry is skipped, never fatal: one bad file must not
      // disable anticipation for every other kind of work.
    }
  }
  return archetypes;
}

export function loadArchetypes({ vaultArchetypeDirectory = null, coreDirectory = CORE_ARCHETYPE_DIR } = {}) {
  const core = readDirectory(coreDirectory, "core");
  if (!vaultArchetypeDirectory) {
    return { archetypes: [...core.values()], vaultLoaded: false };
  }
  const vault = readDirectory(vaultArchetypeDirectory, "vault");
  // The vault wins on id collision: it is the copy the owner maintains as they work.
  const merged = new Map([...core, ...vault]);
  return { archetypes: [...merged.values()], vaultLoaded: vault.size > 0 };
}

/**
 * Maintenance verbs describe changing code *about* a thing, not building the
 * thing. "Rename a local variable in the upload helper" mentions uploads but is
 * not an upload feature, and summoning four specialists for it is exactly the
 * over-asking v4.0.2 removed.
 *
 * A protected domain overrides this: renaming a column on the payments table is
 * still payments work, and the protected boundary must never be softened by a
 * verb.
 */
const MAINTENANCE_PATTERN =
  /\b(?:rename|renaming|renamed|extract|inline|tidy|tidying|formatting|reformat|lint|typo|typos|reword|rewording|reorder|reordering|whitespace|dead code)\b|\b(?:fix|fixing|update|updating|add|adding|remove|removing|clean up|cleaning up)\s+(?:(?:the|a|some|code)\s+)*comments?\b|\bcomment[- ]only\b|\bformat\s+(?:the\s+)?(?:code|file|files|source)\b/i;

export function isMaintenanceOnly(text, { protectedDomains = [] } = {}) {
  if (protectedDomains.length > 0) return false;
  // An explicit redesign or overhaul outranks a maintenance verb here too, the
  // same precedence the change-shape classifier uses: "Redesign the folder
  // screen and rename the tabs" is redesign work.
  if (outranksMaintenance(text)) return false;
  // The change-shape classifier's maintenance phrases count here too, so "add
  // tests for the new pricing page" is maintenance in both places.
  return MAINTENANCE_PATTERN.test(String(text ?? "")) || movesOnlyCode(text) || classifyChangeShape(text).shape === "maintenance";
}

/**
 * "Move" is tidy-up work unless stored data follows it in the same clause:
 * "move the save button 8px to the left" is tidy-up, and "move every recording
 * to the new storage format" moves stored data (task-observer observation 55).
 * Only the last "move" in a clause needs checking, so the check reads each
 * clause once however long the request is.
 */
const MOVE = /\b(?:move|moving)\b/gi;
const STORED_DATA = /\b(?:recordings?|records?|data|databases?|db|storage|buckets?|backups?|uploads?|users|accounts|customers)\b/i;

function movesOnlyCode(text) {
  for (const clause of String(text ?? "").split(/[.;!?\n]+/)) {
    let last = -1;
    for (const match of clause.matchAll(MOVE)) last = match.index + match[0].length;
    if (last !== -1 && !STORED_DATA.test(clause.slice(last))) return true;
  }
  return false;
}

/**
 * A page named as a location is not the work. In "fix the button on the pricing
 * page" the pricing page is where the button sits, so the launch-surfaces
 * library has nothing to anticipate; in "create a pricing page" the page is
 * what is being built. The change-shape classifier draws the same line for the
 * nouns it added in 5.7.0. A match word that names a page, screen, site or
 * listing therefore counts only when at least one mention of it is not preceded
 * by "on the", "in the", "at the" and similar.
 */
const PLACE_MATCH = / (?:page|screen|site|website|listing) $/;
const LOCATION_BEFORE = /(?:^| )(?:on|in|at|inside|within) (?:the|this|that|our|my|your|its|their)$/;

function namedOnlyAsLocation(haystack, needle) {
  if (!PLACE_MATCH.test(needle)) return false;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + 1)) {
    if (!LOCATION_BEFORE.test(haystack.slice(0, index))) return false;
  }
  return true;
}

export function detectArchetypes(text, library) {
  const haystack = normalise(text);
  return library.archetypes
    .map((archetype) => {
      const hits = archetype.matches.filter((token) => {
        const needle = normalise(token);
        return haystack.includes(needle) && !namedOnlyAsLocation(haystack, needle);
      });
      return { archetype, hits };
    })
    .filter(({ hits }) => hits.length > 0)
    .sort((left, right) => right.hits.length - left.hits.length || left.archetype.id.localeCompare(right.archetype.id))
    .map(({ archetype, hits }) => ({ ...archetype, matchedOn: hits }));
}

/**
 * Suppression — the load-bearing half.
 *
 * An archetype that only lists questions over-asks by construction, and
 * over-asking regresses v4.0.2 harder than v4.0.0 regressed questions. So each
 * failure mode says where to look, and anything the repository already answers
 * is reported as settled instead of asked.
 */
export function repositoryAnswers(mode, { root, search = defaultSearch }) {
  const needles = asArray(mode.lookFor);
  if (needles.length === 0 || !root || !existsSync(root)) return null;
  for (const needle of needles) {
    const hit = search(needle, root);
    if (hit) return { needle, evidence: hit };
  }
  return null;
}

/**
 * Where a failure mode is "already handled" must be found in the product, not
 * in Super-outer itself. A repository that vendors the skills carries every
 * archetype file, so each search term would otherwise be found in the very
 * question that names it, and every question would read as answered. Task and
 * design records are excluded for the same reason.
 */
const SEARCH_EXCLUDES = Object.freeze([
  ":(exclude,glob)**/skills/super-outer/**",
  ":(exclude,glob)**/skills/draw-system-diagram/**",
  ":(exclude,glob)**/skills/team-technical-diagram/**",
  ":(exclude,glob)**/skills/jev-opportunities/**",
  ":(exclude,glob)**/skills/caveman-opportunities/**",
  ":(exclude,glob)**/skills/edge-cases/**",
  ":(exclude,glob).engineering/super-outer/**",
]);

export function defaultSearch(needle, root) {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-l", "-i", "--fixed-strings", needle, "--", ".", ...SEARCH_EXCLUDES],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 },
    );
    const first = out.split("\n").find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}

/**
 * Many terms in one search, for routing. Starting `git grep` costs about 40 ms,
 * so the ledger's thirty-odd terms took longer one at a time than the prompt
 * hook can spend. One `git grep` lists the files that hold any term, and each
 * listed file is then read to see which terms it holds, in the order git lists
 * them, so a term's file is the same first file `defaultSearch` reports. Reading
 * the files also finds a term that sits inside a longer one, such as "endpoint"
 * in "public endpoint", which a single combined match would report only once.
 *
 * Returns each term, lower-cased, with its first file or null. `complete` is
 * false when the deadline passed or git failed, because a missing file then
 * says nothing about the code.
 */
export const SEARCH_TERMS_BUDGET_MS = 800;

// After this many files, if a term has been found, git is asked again for the
// terms still missing. A common term such as "user" lists nearly every file,
// and reading them all for one rare term would use the whole budget.
const RESCAN_AFTER_FILES = 25;

export function searchTerms(needles, root, { budgetMs = SEARCH_TERMS_BUDGET_MS, clock = Date.now } = {}) {
  const deadline = clock() + budgetMs;
  const wanted = [...new Set(needles.map((needle) => String(needle).toLowerCase()).filter(Boolean))];
  const found = new Map(wanted.map((needle) => [needle, null]));
  const read = new Set();
  let open = wanted.length;
  while (open > 0) {
    const missing = wanted.filter((needle) => found.get(needle) === null);
    const remaining = deadline - clock();
    if (remaining <= 0) return { found, complete: false };
    let listed;
    try {
      listed = execFileSync(
        "git",
        ["grep", "-l", "-z", "-i", "--fixed-strings", ...missing.flatMap((needle) => ["-e", needle]), "--", ".", ...SEARCH_EXCLUDES],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: Math.max(1, remaining), maxBuffer: 64 * 1024 * 1024 },
      );
    } catch (error) {
      // git grep exits with 1 when no file holds any term.
      return { found, complete: error?.status === 1 };
    }
    const openBefore = open;
    let readThisPass = 0;
    let askAgain = false;
    for (const file of listed.split("\0").filter(Boolean)) {
      if (open === 0) break;
      if (read.has(file)) continue;
      if (clock() >= deadline) return { found, complete: false };
      read.add(file);
      readThisPass += 1;
      let text;
      try { text = readFileSync(join(root, file), "utf8").toLowerCase(); } catch { continue; }
      for (const needle of missing) {
        if (found.get(needle) === null && text.includes(needle)) {
          found.set(needle, file);
          open -= 1;
        }
      }
      if (open > 0 && open < openBefore && readThisPass >= RESCAN_AFTER_FILES) {
        askAgain = true;
        break;
      }
    }
    if (!askAgain) break;
  }
  return { found, complete: true };
}

/**
 * Turn matched archetypes into router decision records, splitting them into
 * questions to ask and findings the repository already settled.
 */
export function archetypeDecisions(archetypes, { root = null, search = defaultSearch } = {}) {
  const decisions = [];
  const settled = [];
  for (const archetype of archetypes) {
    for (const mode of archetype.failureModes) {
      const answer = root ? repositoryAnswers(mode, { root, search }) : null;
      if (answer) {
        settled.push({
          archetype: archetype.id,
          id: mode.id,
          prompt: mode.prompt,
          evidence: answer.evidence,
          needle: answer.needle,
        });
        continue;
      }
      decisions.push({
        id: `${archetype.id}:${mode.id}`,
        kind: "interpretive",
        topic: `${archetype.id} ${mode.id}`,
        prompt: mode.prompt,
        why: mode.why,
        options: mode.options,
        recommended: mode.recommended,
        priority: 1,
        archetype: archetype.id,
        // Sequencing and proof travel with the decision: the interview orders
        // by cost-of-being-wrong, `defer` goes to the ledger instead of the
        // interview, and an answered question becomes a proof obligation.
        sequence: mode.sequence,
        provenBy: mode.provenBy,
        lookFor: mode.lookFor,
      });
    }
  }
  return { decisions, settled };
}

export const archetypePolicy = Object.freeze({
  detection: "deterministic-product-nouns",
  semanticSearch: false,
  writesToVault: false,
  suppression: "repository-evidence-first",
});
