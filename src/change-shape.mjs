/**
 * Change-shape classification.
 *
 * Safe Activation is guidance about the *shape* of a change, not a domain
 * specialist. That distinction is load-bearing: `ARCHETYPE_ROOM_THRESHOLD`
 * gates archetypes wholesale, so once evidence has already selected three or
 * more specialists, archetypes are skipped entirely. Attaching activation
 * through that path would silently drop the question on exactly the large
 * features that most need it — a coordinated mobile-and-backend feature is the
 * canonical case.
 *
 * So this classifier runs independently of the room rule. Domain routing keeps
 * its behaviour unchanged; qualifying shapes attach activation guidance
 * afterwards, without adding specialists merely to carry a question.
 */

export const CHANGE_SHAPES = Object.freeze([
  "new_feature",
  "major_overhaul",
  "replacement",
  "coordinated_cross_system_change",
  "maintenance",
]);

/**
 * Shapes that must receive the Safe Activation interview, with the depth floor
 * each one earns. A protected domain may still raise these; nothing here may
 * lower a detected minimum.
 */
export const ACTIVATION_SHAPES = Object.freeze({
  new_feature: "FOCUSED",
  major_overhaul: "FULL",
  replacement: "FULL",
  coordinated_cross_system_change: "FULL",
});

/**
 * Maintenance phrases describe work *about* code rather than a change in what
 * the product does, and the brief names them as false triggers to avoid:
 * "add a test", "new variable", "rename feature flag", "update documentation",
 * "refactor comments", "fix formatting".
 *
 * Precedence is judged one clause at a time. A request often joins two pieces
 * of work, as in "Build a new onboarding screen and add tests for it". The
 * clause that adds tests is maintenance, and the clause that builds the screen
 * is a feature, so the request is a feature. A clause outranks maintenance only
 * when it carries no maintenance phrase itself and leads with its own verb: a
 * build verb that names a thing being built, an explicit overhaul verb, or an
 * explicit replacement phrase. "Update the docs to describe the redesign" stays
 * maintenance, because the redesign is only mentioned inside a maintenance
 * clause. Bare "replace", "rewrite" and "rebuild" never outrank maintenance,
 * because maintenance work uses them too.
 */
const MAINTENANCE_PATTERNS = Object.freeze([
  /\b(?:add|adding|write|writing)\s+(?:a\s+|an\s+|some\s+|more\s+)?(?:(?:unit|integration|regression|e2e|end-to-end|playwright|cypress|jest|vitest|snapshot|smoke|component)\s+)?tests?\b/i,
  /\b(?:new|another|extra)\s+(?:variable|constant|helper|util|parameter|argument)\b/i,
  /\brenam(?:e|ing)\b/i,
  /\b(?:update|updating|fix|fixing|improve|improving)\s+(?:the\s+)?(?:docs?|documentation|readme|changelog|comments?)\b/i,
  /\brefactor(?:ing)?\s+(?:the\s+)?comments?\b/i,
  /\b(?:fix|fixing|clean\s?up|tidy)\s+(?:the\s+)?(?:formatting|whitespace|indentation|lint(?:ing)?|typos?)\b/i,
  /\b(?:typo|typos|whitespace|formatting only|comment[- ]only)\b/i,
  /\bbehaviou?r[- ]preserving\b/i,
]);

/**
 * Real requests put a qualifier between the verb and the noun: "a new **News**
 * feature", "an **onboarding** flow". Allowing a short run of intervening words
 * inside one sentence catches those without reaching across a full stop.
 *
 * The list also holds the product nouns people use when they ask for a
 * feature: an editor, a dashboard, a panel, a view, an inbox, a tool, a home
 * page or a website, in the singular or the plural. A bare "app" is left out on
 * purpose. "Build the app and run the tests" is a build command, and "deploy
 * the new build of the app" would match through the "new" pattern; an app
 * counts only in the phrasings of NEW_PRODUCT_PATTERNS below. "Workspace" is
 * left out because package managers and code editors use the same word for
 * their own folders. A database or SQL view is stored data, and a tool call,
 * tool use or tool result is a step inside an agent loop, so neither counts as
 * a thing being built.
 */
const VIEW_BUILT = "(?<!\\b(?:database|db|sql|materiali[sz]ed)\\s)views?";
const TOOL_BUILT = "tool(?!\\s+(?:calls?|calling|use|uses|results?|schemas?|definitions?)\\b)";
// The nouns that classified requests before 5.7.0 keep their earlier matching,
// with plurals added for the ones a person looks at.
const THING_BUILT_BEFORE_5_7 =
  "(?:feature|screens?|pages?|flows?|pipeline|experiences?|capability|surfaces?|endpoint|api|service)";
const HOME_AND_WEB = "homepages?|home\\s?screens?|webpages?|websites?|web\\s+sites?|landing\\s+sites?";
const THING_BUILT_FROM_5_7 = `(?:editors?|dashboards?|panels?|inbox(?:es)?|${VIEW_BUILT}|${TOOL_BUILT}|${HOME_AND_WEB})`;

/**
 * A place is not a thing being built. In "add padding to the dashboard" the
 * dashboard is where a small change is made, so for the nouns added in 5.7.0
 * the words between the verb and the noun may not include "to the", "on the"
 * or "in the". The older nouns keep their earlier matching, so a request that
 * classified one way before 5.7.0 still does.
 */
const WORDS_BEFORE_THE_THING =
  "(?:(?!\\b(?:to|on|in|into|onto|inside|within)\\s+(?:the|this|that|our|my|your|its|their)\\b)[^.]){0,40}?";
const BUILD_VERB =
  "\\b(?:build|building|add|adding|create|creating|introduce|introducing|ship|shipping|implement|implementing|launch|launching)\\b";
/**
 * People also ask for a screen without a build verb: "make a screen where
 * students can see their scores", "can you put together a profile screen",
 * "I want a page where users can see their past recordings". These verbs are
 * common in other requests ("make the dashboard rebuild its view"), so they
 * count only with "a" or "an" and only for something a person looks at.
 */
const ASK_FOR_ONE =
  "\\b(?:make|making|design|designing|put\\s+together|putting\\s+together|need|needs|want|wants|would\\s+like)\\s+(?:me\\s+|us\\s+)?(?:an?)\\b";
const VISIBLE_THING = `(?:screens?|pages?|flows?|experiences?|surfaces?|editors?|dashboards?|panels?|inbox(?:es)?|${VIEW_BUILT}|${HOME_AND_WEB})`;

/**
 * A person starting a product names it as an app or a website. Up to three
 * words may stand between "a" and the app ("build me a simple to-do list app");
 * before 5.10 the limit was two. "Build me an
 * app" and "create a mobile app for recording voice notes" ask for a product;
 * "build the app" and "build an app bundle for the store" run a build. So an
 * app counts after create, make, design or develop, after "build me" or
 * "build us", or after "a new"; a website or web app also counts after a plain
 * build. None of them counts when a build word follows the noun.
 */
const APP_OR_SITE =
  "(?:apps?|applications?|web\\s?apps?|websites?|web\\s+sites?)(?!\\s+(?:versions?|builds?|releases?|bundles?|binar(?:y|ies)|icons?|ids?|keys?|tokens?|secrets?|passwords?|stores?|config(?:uration)?|listings?|updates?)\\b)";
// The words between "a" and the app describe the product ("a simple to-do
// list app"). A gap holding a preposition or a routine task word describes
// something else: "make a fix to the website", "create a PR for the app".
const PRODUCT_GAP =
  "(?:(?!(?:to|for|of|about|in|on|the|our|my|this|that|fix|fixes|backup|release|build|copy|note|commit|branch)(?![\\w-]))[\\w-]+\\s+){0,3}?";
const NEW_PRODUCT_PATTERNS = Object.freeze([
  new RegExp(`\\b(?:create|creating|make|making|design|designing|develop|developing)\\s+(?:me\\s+|us\\s+)?(?:an?)\\s+${PRODUCT_GAP}${APP_OR_SITE}\\b`, "i"),
  new RegExp(`\\bbuild(?:ing)?\\s+(?:me|us)\\s+(?:an?)\\s+${PRODUCT_GAP}${APP_OR_SITE}\\b`, "i"),
  new RegExp(`\\bbuild(?:ing)?\\s+(?:an?)\\s+(?:new\\s+)?(?:[\\w-]+\\s+)?(?:websites?|web\\s+sites?|web\\s?apps?|mobile\\s+apps?)\\b`, "i"),
  new RegExp(`\\ban?\\s+new\\s+(?:[\\w-]+\\s+)?${APP_OR_SITE}\\b`, "i"),
]);

/**
 * "A new screen" asks for one. "The new dashboard crashes" and "no new screens"
 * name something already built or rule it out. For the nouns added in 5.7.0
 * and for the visible-surface reason, "new" therefore counts only when it does
 * not follow "the", "no", "this", "that", "these", "those" or a possessive.
 * The older nouns keep their earlier matching apart from "no new", because
 * "Roll out the new onboarding flow to beta users" is the request the Safe
 * Activation question exists for.
 */
const NEW_THING = "(?<!\\b(?:the|no|this|that|these|those|our|my|your|their|its)\\s)\\bnew\\b";
const NEW_BEFORE_5_7 = "(?<!\\bno\\s)\\bnew\\b";

const NEW_FEATURE_PATTERNS = Object.freeze([
  new RegExp(`${BUILD_VERB}[^.]{0,40}?\\b${THING_BUILT_BEFORE_5_7}\\b`, "i"),
  new RegExp(`${BUILD_VERB}${WORDS_BEFORE_THE_THING}\\b${THING_BUILT_FROM_5_7}\\b`, "i"),
  new RegExp(`${NEW_BEFORE_5_7}[^.]{0,40}?\\b${THING_BUILT_BEFORE_5_7}\\b`, "i"),
  new RegExp(`${NEW_THING}${WORDS_BEFORE_THE_THING}\\b${THING_BUILT_FROM_5_7}\\b`, "i"),
  new RegExp(`${ASK_FOR_ONE}${WORDS_BEFORE_THE_THING}\\b${VISIBLE_THING}\\b`, "i"),
  ...NEW_PRODUCT_PATTERNS,
  /\bgreenfield\b/i,
]);

const OVERHAUL_VERB_PATTERN =
  /\b(?:overhaul|overhauling|rework|reworking|redesign|redesigning|rebuild|rebuilding|revamp|revamping|re-?architect(?:ing)?)\b/i;
const MAJOR_CHANGE_PATTERN =
  /\b(?:major|substantial|significant|complete|full)\s+(?:rewrite|rework|change|overhaul|redesign)\b/i;
const OVERHAUL_PATTERNS = Object.freeze([
  OVERHAUL_VERB_PATTERN,
  MAJOR_CHANGE_PATTERN,
  /\brewrit(?:e|ing)\s+(?:the\s+)?(?:existing\s+)?\w+/i,
]);

const EXPLICIT_REPLACEMENT_PATTERNS = Object.freeze([
  /\bswap(?:ping)?\s+(?:out\s+)?(?:the\s+)?\w+\s+for\b/i,
  /\bmigrat(?:e|ing)\s+(?:from|off)\b/i,
  /\b(?:switch|switching|move|moving)\s+(?:from|off)\s+\w+\s+to\b/i,
  /\bnew\s+(?:provider|vendor|model|ranking|retrieval|prompt)\s+pipeline\b/i,
]);
const REPLACEMENT_PATTERNS = Object.freeze([
  /\breplac(?:e|ing|ement)\b/i,
  ...EXPLICIT_REPLACEMENT_PATTERNS,
]);

/**
 * Whether the thing being built, redesigned or replaced is something a person
 * looks at. The router selects the product UI specialist from interface words
 * such as "screen" and "ui", so "Build a new writing editor" and "Add a
 * dashboard that shows weekly recordings" used to select no specialist at all.
 * The router reads this reason and selects that specialist for a qualifying
 * shape.
 *
 * The surface has to be what the request makes or remakes. A short qualifier
 * may sit between the verb and the noun ("a new writing editor"), but the words
 * in between may not include "to the", "on the" or "in the": in "add padding
 * to the dashboard" the dashboard is where a small change is made, and nothing
 * new is being built. A redesigned app, website or product is also a visible
 * surface: "Redesign the app", and so is one rebuilt from scratch.
 */
const VISIBLE_SURFACE_PATTERNS = Object.freeze([
  new RegExp(
    `(?:\\b(?:build|building|add|adding|create|creating|introduce|introducing|ship|shipping|implement|implementing|launch|launching|overhaul|overhauling|rework|reworking|redesign|redesigning|rebuild|rebuilding|revamp|revamping|replac(?:e|ing))\\b|${NEW_THING})${WORDS_BEFORE_THE_THING}\\b${VISIBLE_THING}\\b`,
    "i",
  ),
  new RegExp(`${ASK_FOR_ONE}${WORDS_BEFORE_THE_THING}\\b${VISIBLE_THING}\\b`, "i"),
  ...NEW_PRODUCT_PATTERNS,
  new RegExp(
    `\\b(?:redesign(?:ing)?|rebuild(?:ing)?(?=[^.]{0,60}\\bfrom\\s+scratch\\b))\\b${WORDS_BEFORE_THE_THING}\\b(?:apps?|applications?|websites?|products?)\\b`,
    "i",
  ),
]);

/**
 * "Rebuild" names two different requests. A person who asks to rebuild the
 * onboarding flow wants it made again. A person who asks to rebuild the
 * bundle, the search index or the docker image wants a routine build step run,
 * and "rebuild the view when the filter changes" asks for a screen to redraw.
 * The routine kinds are reworded before the shape is judged, so they never
 * raise the replace-or-run-both question. "From scratch" or a named framework
 * keeps every rebuild in its sentence in the first kind: "rebuild the app from
 * scratch", "rebuild the home page in React".
 */
const REBUILD = "\\brebuild(?:s|ing)?\\b";
const BUILD_OUTPUT =
  "(?:bundles?|builds?|images?|containers?|index(?:es)?|indices|caches?|dist|node_modules|lock\\s?files?|dependencies|deps|packages?|css|styles(?:heets?)?|assets|binar(?:y|ies)|projects?|apps?|tests?|docs?|types|labels|translations|sitemaps?)";
// The build output has to be the thing rebuilt: the last noun before the
// clause ends or moves on. "Rebuild the web app dashboard" rebuilds a
// dashboard, and "rebuild the app for release" rebuilds the app.
const OUTPUT_ENDS =
  "(?:\\s+(?:folders?|director(?:y|ies)|dirs?|files?))?(?=\\s*(?:$|[,;:!?.)])|\\s+(?:and|then|for|in|on|with|after|before|so|to|when|because|again|locally|now|please|from|using|via|first|once|if|or|but)\\b)";
// Pages that are themselves generated: "rebuild the docs page", "rebuild the static site".
const GENERATED_PAGE = "(?:docs?|static|generated)\\s+(?:pages?|sites?)\\b";
const ROUTINE_REBUILDS = Object.freeze([
  new RegExp(
    `${REBUILD}(?=\\s+(?:(?:the|our|my|a|an|this|that|all|every)\\s+)?(?:[\\w-]+\\s+){0,2}?(?:${BUILD_OUTPUT}${OUTPUT_ENDS}|${GENERATED_PAGE}))`,
    "gi",
  ),
  new RegExp(`${REBUILD}(?=\\s*(?:$|[,;:!?.])|\\s+(?:it|them|everything|again|and|then|now|locally|please)\\b)`, "gi"),
  new RegExp(
    `${REBUILD}(?=[^.]{0,40}?\\b(?:when|whenever|after|once|each\\s+time|every\\s+time)\\s+(?:the\\s+)?(?:[\\w-]+\\s+){0,2}?(?:changes?|loads?|updates?|arrives?|resizes?|is\\s+(?:updated|changed|loaded))\\b)`,
    "gi",
  ),
  new RegExp(`${REBUILD}(?=\\s+(?:its|their)\\b)`, "gi"),
]);
const REBUILD_AS_REMAKE =
  /\bfrom\s+scratch\b|\b(?:in|with|using|on)\s+(?:react(?:\s+native)?|next(?:\.?js)?|vue|svelte|angular|swiftui|flutter|jetpack\s+compose|compose|tailwind|kotlin|swift|expo)\b/i;

/**
 * Developers use the 5.7.0 nouns for their own things. A Django or Flask view
 * answers a web request, a database view is stored data, a dashboard API or a
 * dashboard endpoint returns data, the inbox pattern is a messaging technique,
 * and a Grafana or Datadog dashboard is for engineers watching a service. In
 * those uses the noun is reworded before the shape is judged, so the request
 * is not read as building something people look at. "Screen reader" and
 * "launch page" (a splash screen) are reworded the same way.
 */
const NOUNS_FROM_5_7 = "(?:editors?|dashboards?|panels?|inbox(?:es)?|views?)";
const DEVELOPER_BEFORE =
  "(?:database|db|sql|materiali[sz]ed|postgres(?:ql)?|mysql|sqlite|bigquery|snowflake|django|flask|rails|laravel|code|vim|emacs)";
const DEVELOPER_AFTER =
  "(?:endpoints?|apis?|services?|config(?:uration)?s?|patterns?|models?|controllers?|plugins?|extensions?|schemas?|quer(?:y|ies)|tables?|backends?|routes?|resolvers?|workers?|jobs?|queues?|layers?|functions?)";
const OPS_TOOL =
  /\b(?:grafana|datadog|kibana|cloudwatch|sentry|honeycomb|new\s+relic|prometheus|metabase|looker|superset|tableau|power\s?bi|posthog|mixpanel|amplitude)\b/i;
const DEVELOPER_NOUNS = Object.freeze([
  new RegExp(`(?<=\\b${DEVELOPER_BEFORE}\\s+)${NOUNS_FROM_5_7}\\b`, "gi"),
  new RegExp(`\\b${NOUNS_FROM_5_7}(?=\\s+${DEVELOPER_AFTER}\\b)`, "gi"),
  /\bviews?(?=\s+(?:in|on|inside|within)\s+(?:the\s+)?(?:postgres(?:ql)?|sql|mysql|sqlite|database|db|bigquery|snowflake|supabase|warehouse)\b)/gi,
  /\bscreens?(?=\s+readers?\b)/gi,
]);
const STYLE_REFERENCE =
  /\b(?:like|similar\s+to|inspired\s+by|in\s+the\s+style\s+of)\b|\b(?:grafana|datadog|kibana|posthog|mixpanel|amplitude|metabase|looker|tableau)[-\s]style\b/i;
const LAUNCH_AS_NOUN = /\blaunch(?=\s+(?:pages?|screens?)\b)/gi;
/**
 * "Please don't redesign anything, just fix the crash" asks for no redesign.
 * A change verb that is ruled out in the same breath is reworded, so it does
 * not set the shape.
 */
const RULED_OUT_CHANGE =
  /\b(?:don't|do\s+not|never|no\s+need\s+to|without)\s+(?:redesign|overhaul|rework|rebuild|revamp|replace|rewrite)(?:ing)?\b/gi;
const NOT_A_PRODUCT_NOUN = "part";

/**
 * Clauses are split at sentence ends, semicolons, commas and the words "and",
 * "then", "but", "also" and "plus". The separators are kept, so the text can
 * be put back together unchanged after a clause is reworded.
 */
const CLAUSE_SEPARATOR = /((?:[.;!?\n]+|,)\s*|\s+(?:and|then|but|also|plus)\s+)/i;
const clausesOf = (text) =>
  text.split(CLAUSE_SEPARATOR).filter((_, index) => index % 2 === 0).map((clause) => clause.trim()).filter(Boolean);
const eachClause = (text, change) =>
  text.split(CLAUSE_SEPARATOR).map((part, index) => (index % 2 === 0 ? change(part) : part)).join("");

/** The request as the shape classifier reads it: routine rebuilds and developer meanings reworded. */
function productMeaning(text) {
  // Each run of spaces or tabs becomes one space, and each run of new lines
  // one new line. Several patterns below step through white space, and a run
  // of thousands of spaces made routing take seconds.
  const compact = text.replace(/[^\S\n]+/g, " ").replace(/\n+/g, "\n").replace(RULED_OUT_CHANGE, "change");
  const sentences = compact.split(/([.;!?\n]+)/);
  let result = sentences
    .map((part, index) =>
      index % 2 === 1 || REBUILD_AS_REMAKE.test(part)
        ? part
        : ROUTINE_REBUILDS.reduce((current, pattern) => current.replace(pattern, "recompile"), part),
    )
    .join("");
  result = eachClause(result, (clause) =>
    OPS_TOOL.test(clause) && !STYLE_REFERENCE.test(clause)
      ? clause.replace(new RegExp(`\\b${NOUNS_FROM_5_7}\\b`, "gi"), NOT_A_PRODUCT_NOUN)
      : clause,
  );
  result = DEVELOPER_NOUNS.reduce((current, pattern) => current.replace(pattern, NOT_A_PRODUCT_NOUN), result);
  return result.replace(LAUNCH_AS_NOUN, "opening");
}

/** Words people put before the verb: "please", "can you", "let's", "I want you to", "we need". */
const LEAD_IN =
  /^(?:(?:please|pls|now|also|first|next|then|so|ok(?:ay)?|hey|and|but|just)\b[\s,]*|(?:can|could|would|will)\s+you\s+(?:please\s+)?|let'?s\s+|(?:i|we)\s+(?:need|want|would\s+like)\s+(?:you\s+)?to\s+|(?:i|we)'?d\s+like\s+(?:you\s+)?to\s+|(?:i|we)\s+(?=(?:need|want|would\s+like)\b))+/i;
const BUILD_LEAD =
  /^(?:build(?:ing)?|add(?:ing)?|creat(?:e|ing)|introduc(?:e|ing)|ship(?:ping)?|implement(?:ing)?|launch(?:ing)?|mak(?:e|ing)|design(?:ing)?|put(?:ting)?\s+together|develop(?:ing)?|set\s+up|need|want|would\s+like)\b/i;
const OVERHAUL_LEAD =
  /^(?:overhaul(?:ing)?|rework(?:ing)?|redesign(?:ing)?|revamp(?:ing)?|re-?architect(?:ing)?|do\s+(?:a|an|the)\s+(?:(?:major|substantial|significant|complete|full)\s+)?(?:redesign|overhaul|rework|revamp))\b/i;
const REPLACEMENT_LEAD = /^(?:swap(?:ping)?|migrat(?:e|ing)|switch(?:ing)?|mov(?:e|ing))\b/i;

const anyMatch = (patterns, text) => patterns.some((pattern) => pattern.test(text));

/** A clause free of maintenance phrases that asks, with its own verb, for a feature, an overhaul or a replacement. */
function requestsChange(clause) {
  if (anyMatch(MAINTENANCE_PATTERNS, clause)) return false;
  const lead = clause.replace(LEAD_IN, "");
  if (BUILD_LEAD.test(lead)) return anyMatch(NEW_FEATURE_PATTERNS, clause);
  if (OVERHAUL_LEAD.test(lead)) return true;
  if (REPLACEMENT_LEAD.test(lead)) return anyMatch(EXPLICIT_REPLACEMENT_PATTERNS, clause);
  return false;
}

/**
 * Two or more distinct systems named together. A mobile change that also
 * changes backend behaviour cannot be activated on one side alone, which is
 * precisely why it earns FULL.
 */
const SYSTEM_WORDS = Object.freeze({
  mobile: /\b(?:mobile|app|ios|android|client|frontend|screen)\b/i,
  backend: /\b(?:backend|server|api|endpoint|service|worker)\b/i,
  data: /\b(?:database|schema|migration|persisted|stored data)\b/i,
  model: /\b(?:ai|llm|model|prompt|retrieval|ranking|embedding)\b/i,
});

const CROSS_REPO_PATTERNS = Object.freeze([
  /\bcross[- ]repos?(?:itor(?:y|ies))?\b/i,
  /\bboth\s+repos?(?:itories)?\b/i,
  /\b(?:coordinated|coordinate)\s+(?:across|between)\b/i,
  /\bend[- ]to[- ]end\s+feature\b/i,
]);

/** Work aimed at real people is what makes activation a live question. */
const AUDIENCE_PATTERN =
  /\b(?:staging|production|prod|beta|internal testers?|test users?|rollout|roll out|launch|release to)\b/i;

/** True when some clause of the request outranks the maintenance phrases in the others. */
export const outranksMaintenance = (text) => clausesOf(productMeaning(String(text ?? ""))).some(requestsChange);

/**
 * True when the request runs a routine rebuild ("rebuild the app", "rebuild
 * the css", "rebuild the docs page") and asks for no visible surface besides.
 * Jev reads "rebuild" literally and judges these as remaking something people
 * use, so from 5.8.0 this check sets Jev's design reading aside for them,
 * keeping the 5.7.0 behaviour. "Rebuild the bundle and add a settings page"
 * still asks for a page, so it is not caught here.
 */
export const isRoutineRebuildOnly = (text) => {
  const value = String(text ?? "").toLowerCase();
  const meaning = productMeaning(value);
  return !/\brecompile\b/.test(value) && /\brecompile\b/.test(meaning) && !anyMatch(VISIBLE_SURFACE_PATTERNS, meaning);
};

/** True when a request asks for a whole new product: an app or a website. */
export function namesNewProduct(text) {
  return anyMatch(NEW_PRODUCT_PATTERNS, String(text ?? ""));
}

export function classifyChangeShape(text, { protectedDomains = [] } = {}) {
  const meaning = productMeaning(String(text ?? ""));

  // Maintenance decides unless another clause asks for a change with its own
  // verb. A protected domain does not turn a typo fix into a feature launch;
  // it raises depth through routing instead.
  const clauses = clausesOf(meaning);
  const changeClauses = clauses.filter((clause) => !anyMatch(MAINTENANCE_PATTERNS, clause));
  const maintenanceCount = clauses.length - changeClauses.length;
  if (maintenanceCount > 0 && !changeClauses.some(requestsChange)) {
    return { shape: "maintenance", activation: false, depthFloor: null, reasons: ["maintenance_phrase"] };
  }
  // When a maintenance clause was outranked, the other clauses describe the change.
  const haystack = maintenanceCount > 0 ? changeClauses.join(". ") : meaning;

  const systems = Object.entries(SYSTEM_WORDS)
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([name]) => name);
  const crossSystem =
    systems.length >= 2 || anyMatch(CROSS_REPO_PATTERNS, haystack);

  const reasons = [];
  let shape = null;
  if (anyMatch(REPLACEMENT_PATTERNS, haystack)) { shape = "replacement"; reasons.push("replacement_phrase"); }
  else if (anyMatch(OVERHAUL_PATTERNS, haystack)) { shape = "major_overhaul"; reasons.push("overhaul_phrase"); }
  else if (anyMatch(NEW_FEATURE_PATTERNS, haystack)) { shape = "new_feature"; reasons.push("new_feature_phrase"); }

  // Coordinated work outranks a bounded new feature: it cannot be switched on
  // one side at a time, so it earns the higher floor. An explicit
  // cross-repository phrase is itself enough to establish the shape, even when
  // the wording never names a thing being built.
  if (crossSystem) {
    if (shape === null && anyMatch(CROSS_REPO_PATTERNS, haystack)) {
      shape = "coordinated_cross_system_change";
      reasons.push("cross_repository_phrase");
    } else if (shape !== null) {
      shape = shape === "new_feature" ? "coordinated_cross_system_change" : shape;
    }
    if (shape !== null) {
      reasons.push(`systems:${systems.join("+") || "cross_repository"}`);
    }
  }

  if (shape === null) {
    return { shape: null, activation: false, depthFloor: null, reasons: [] };
  }

  if (anyMatch(VISIBLE_SURFACE_PATTERNS, haystack)) reasons.push("visible_surface");
  if (AUDIENCE_PATTERN.test(haystack)) reasons.push("named_audience");
  if (protectedDomains.length > 0) reasons.push(`protected:${protectedDomains.join(",")}`);

  let depthFloor = ACTIVATION_SHAPES[shape] ?? null;
  // Cross-system coordination is FULL even when the wording sounded bounded.
  if (crossSystem && depthFloor === "FOCUSED") depthFloor = "FULL";

  return { shape, activation: Boolean(depthFloor), depthFloor, reasons };
}



const DEPTH_ORDER = ["SMALL_SAFE", "QUICK", "FOCUSED", "FULL", "CRITICAL"];

/**
 * Raise depth to the activation floor, never lower it. CRITICAL always wins,
 * and SMALL_SAFE is never promoted by this path — a genuinely safe edit stays
 * quiet even if a stray feature word appears in it.
 */
export function applyDepthFloor(mode, depthFloor) {
  if (!depthFloor || mode === "CRITICAL" || mode === "SMALL_SAFE") return mode;
  return DEPTH_ORDER.indexOf(depthFloor) > DEPTH_ORDER.indexOf(mode) ? depthFloor : mode;
}
