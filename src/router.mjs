import {
  ARCHETYPE_QUESTION_BUDGET,
  ARCHETYPE_ROOM_THRESHOLD,
  CONTRACT_VERSION,
  PROTECTED_DOMAIN_PATTERNS,
  QUESTION_BUDGETS,
  SCORE_DIMENSIONS,
  SPECIALIST_BY_ID,
  SPECIALIST_MODULES,
} from "./constants.mjs";
import { detectArchetypes, isMaintenanceOnly, loadArchetypes } from "./archetypes.mjs";
import { classifyChangeShape, applyDepthFloor } from "./change-shape.mjs";

const RISK_WORDS = Object.freeze({ low: 1, medium: 3, high: 5 });
// The change shapes in which a visible surface brings in the product UI specialist.
const VISIBLE_SURFACE_SHAPES = new Set(["new_feature", "major_overhaul", "replacement", "coordinated_cross_system_change"]);
const SAFE_FILE_PATTERN = /(?:^|\/)(?:readme|changelog|license)(?:\.[^/]*)?$|\.(?:md|mdx|txt)$/i;

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A trigger also matches its plural. "Add background queues" is the same
// request as "add a background queue", and before 5.10 only the singular
// reached the specialist. Two triggers keep only their singular, because their
// plurals usually name people: "support agents" are staff, and "clients can
// download their invoices" are customers.
const SINGULAR_ONLY = new Set(["agent", "client"]);

function pluralTail(phrase) {
  if (!/[a-z]$/i.test(phrase) || SINGULAR_ONLY.has(phrase.toLowerCase())) return "";
  return /[^aeiou]y$/i.test(phrase) ? "" : "(?:e?s)?";
}

function phrasePattern(phrase) {
  let escaped = escapePattern(phrase).replaceAll("\\ ", "[\\s_-]+");
  if (/[^aeiou]y$/i.test(phrase)) escaped = `${escaped.slice(0, -1)}(?:y|ies)`;
  return new RegExp(`(?:^|[^a-z0-9])${escaped}${pluralTail(phrase)}(?=$|[^a-z0-9])`, "i");
}

/**
 * Stated demand, in the words a product owner uses. The specialist trigger
 * lists hold engineering vocabulary ("throughput", "concurrency"), so "a chat
 * app for 50k users" reached no specialist before 5.10. A phrase counts only
 * when it is not named as the place of a change ("fix the typo in our chat
 * app"), and a user count counts only from 1,000 or with a unit such as k, lakh
 * or million: "our app has 2 users" states no demand.
 */
const USER_COUNT =
  /\b(\d[\d,.]*)\s*(k|m|mn|lakhs?|crores?|millions?|thousands?)?\+?\s+(?:daily\s+|active\s+|monthly\s+|concurrent\s+|paying\s+|registered\s+)?(?:users|people|customers|students|players|sellers|buyers|members|visitors|subscribers|learners)\b/gi;
const STATED_SCALE = Object.freeze([
  /\b(?:millions|lakhs|crores|thousands)\s+of\s+(?:users|people|customers|students|players|visitors|learners)\b/i,
  /\bscal(?:e|ing)\s+(?:up\s+)?to\s+(?:\d|millions?|lakhs?|crores?|thousands?|many|more|lots|a\s+lot)\b/i,
  /\bat\s+scale\b/i,
  /\b(?:traffic\s+spikes?|spikes?\s+in\s+traffic|lots\s+of\s+traffic|heavy\s+traffic|launch\s+day|go(?:es|ing)?\s+viral|product\s+hunt)\b/i,
  /\b(?:getting\s+slow(?:er)?|(?:app|site|website|page|server|api)\s+(?:is|feels|gets)\s+(?:really\s+|very\s+|so\s+)?slow|loads?\s+slowly)\b/i,
  /\b(?:lots\s+of|many|thousands\s+of)\s+concurrent\b/i,
  /\bconcurrent\s+users\b/i,
  /\b(?:students|players|people|users)\s+at\s+once\b/i,
]);
// Kinds of system that need their architecture walked before building. Each
// counts only as the thing being built: a build verb governs it in the same
// clause, and the clause reports no fix, test or cosmetic change.
const LIVE_SYSTEM = Object.freeze([
  /\breal[- ]?time\b/i,
  /\blive\s+(?:chat|feeds?|updates?|scores?|location|tracking|collaboration|cursors?)\b/i,
  /\bupdates?\s+(?:live|instantly|in\s+real[- ]?time)\b/i,
  /\b(?:chat|messaging)\s+apps?\b/i,
  /\bmultiplayer\b/i,
]);
const REMEMBERING_AGENT = Object.freeze([
  /\bagent\s+memory\b/i,
  /\bmemory\s+(?:to|for|in)\s+(?:my|our|the|this)\s+(?:[\w-]+\s+)?(?:agents?|bots?|chatbots?|assistants?|tutors?)\b/i,
  /\blong[- ]running\s+agents?\b/i,
  /\bremembers?\s+(?:what\s+|how\s+|which\s+)?(?:each|every|the|all|its)\s+(?:users?|students?|customers?|players?|person|people|learners?)\b/i,
]);
const SIMULATION = Object.freeze([/\bsimulations?\b/i]);
const BUILD_VERB =
  /\b(?:build|building|create|creating|make|making|add|adding|develop|developing|design|designing|implement|implementing|introduce|introducing|set\s+up|setting\s+up|need|needs|want|wants)\b/i;
// "Players should see each other's moves in real time" asks for a live system
// without a build verb.
const NEED_VERB = /\b(?:should|must|needs?\s+to|has\s+to|have\s+to)\b/i;
// A system named only to describe something else ("make the chat app icon
// bigger", "our live scores widget") is not the thing being built.
const DESCRIBES_NEXT = /^\s+(?:icons?|buttons?|badges?|banners?|logos?|fonts?|colou?rs?|labels?|widgets?|toggles?|screenshots?|lobby)(?![\w-])/i;
/**
 * A routine task named as the object of a verb: "make a fix to the website
 * footer", "create a ticket about the app crash", "create a PR for the app",
 * "develop a test for the app login", "make a screenshot of the website".
 */
const TASK_OBJECT =
  /\b(?:build|create|make|develop|write|open|file|raise|add|do|take)\s+(?:me\s+|us\s+)?(?:a|an|the)\s+(?:quick\s+|small\s+|new\s+)?(?:fix|fixes|ticket|pr|pull\s+request|tests?|release\s+build|screenshot|backup|copy|commit|branch)\b(?=\s+(?:for|to|about|of|on|in|that|which|with)\b|\s*$|[.,;])/i;
const ROUTINE_TASK = /\b(?:tests?\s+for|write\s+tests?|release\s+build)\b/i;
// Words that report a problem with something that exists.
const PROBLEM =
  /\b(?:fix|fixing|bugs?|broken|crash(?:es|ing)?|wrong|misaligned|regression|typo|cut\s+off|overlaps?|not\s+working|(?:does|is)n'?t\s+working)\b/i;
// A new thing being built: a build verb followed by "a" or "an". Its name may
// hold a problem word ("a bug tracker", "a crash reporting dashboard").
const NEW_THING =
  /\b(?:build|create|make|develop|design|start|set\s+up)\s+(?:me\s+|us\s+)?(?:a|an)\s+(?!(?:quick\s+|small\s+)?(?:fix|fixes)\b)/i;
/**
 * A screen element a customer uses is the thing being changed in "add a filter
 * to the orders page", even though the page is only where it goes. Before 5.10
 * such a change reached no product specialist, so nobody asked what the empty
 * list shows or which sort comes first. An element aimed at something on the
 * server ("a filter to the orders API", "a sort option to the search endpoint")
 * stays out.
 */
const SCREEN_ELEMENT =
  /\b(?:add|adding|show|showing|reorder|reordering|change|changing|redesign|redesigning)\b[^.]{0,30}?\b(?:filters?|search\s+(?:box|bar|field)e?s?|sort(?:ing)?\s+options?|empty\s+states?|forms?|onboarding\s+steps?|tabs?)\b([^.]{0,30})/gi;
const SERVER_SIDE_TARGET =
  /\b(?:apis?|endpoints?|quer(?:y|ies)|database|db|sql|backend|server|logs?|cli|scripts?|jobs?|webhooks?)\b/i;

function changesScreenElement(text) {
  for (const match of text.matchAll(SCREEN_ELEMENT)) {
    // "Change the filter label" edits wording, not the filter.
    if (/^\s+(?:labels?|text|copy|wording)\b/i.test(match[1] ?? "")) continue;
    if (!SERVER_SIDE_TARGET.test(match[1] ?? "")) return true;
  }
  return false;
}

const NAMED_AS_PLACE =
  /(?:^|\s)(?:on|in|at|inside|within|into)\s+(?:the|this|that|our|my|your|its|their)\s*$/i;

const clausesOf = (text) => String(text ?? "").toLowerCase().split(/[.;!?\n]+/);
const globalOf = (pattern) =>
  new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);

/**
 * True when the request reports a problem with something that exists, or names
 * a routine developer task, rather than asking for something new.
 */
export function readsAsFixOrTask(description) {
  const text = String(description ?? "");
  if (TASK_OBJECT.test(text)) return true;
  // "Build a typing test for school kids" builds a product; "tests for the
  // payment webhook" is a developer task.
  return clausesOf(text).some((clause) =>
    (ROUTINE_TASK.test(clause) || PROBLEM.test(clause)) && !NEW_THING.test(clause));
}

/**
 * True when a phrase is the thing being built: a build verb governs it with no
 * definite word in between, or, for something that must update live, a need
 * verb comes before it. A clause that reports a problem never counts.
 */
function builtInClause(text, patterns, { needVerb = false } = {}) {
  for (const clause of clausesOf(text)) {
    if (PROBLEM.test(clause) && !NEW_THING.test(clause)) continue;
    if (TASK_OBJECT.test(clause)) continue;
    for (const pattern of patterns) {
      for (const match of clause.matchAll(globalOf(pattern))) {
        const before = clause.slice(0, match.index);
        if (NAMED_AS_PLACE.test(before)) continue;
        if (DESCRIBES_NEXT.test(clause.slice(match.index + match[0].length))) continue;
        if (BUILD_VERB.test(before)) return true;
        if (needVerb && NEED_VERB.test(before)) return true;
      }
    }
  }
  return false;
}

// Cosmetic objects that a demand phrase can only describe: "a Product Hunt
// badge", "the launch day banner colour".
const COSMETIC_AFTER = /^\s+(?:badges?|banners?|buttons?|logos?|icons?|links?|colou?rs?|fonts?|labels?|text)\b/i;

function statesDemand(text) {
  for (const clause of clausesOf(text)) {
    if (PROBLEM.test(clause) && !NEW_THING.test(clause)) continue;
    for (const match of clause.matchAll(USER_COUNT)) {
      if (NAMED_AS_PLACE.test(clause.slice(0, match.index))) continue;
      if (COSMETIC_AFTER.test(clause.slice(match.index + match[0].length))) continue;
      const value = Number.parseFloat(match[1].replace(/,/g, ""));
      if (match[2] || value >= 1000) return true;
    }
    for (const pattern of STATED_SCALE) {
      for (const match of clause.matchAll(globalOf(pattern))) {
        if (NAMED_AS_PLACE.test(clause.slice(0, match.index))) continue;
        if (COSMETIC_AFTER.test(clause.slice(match.index + match[0].length))) continue;
        // "200 students at once" is concurrency; "3 students at once in the grid" is a layout.
        const count = clause.slice(0, match.index).match(/(\d[\d,]*)\s*$/);
        if (count && Number.parseInt(count[1].replace(/,/g, ""), 10) < 100) continue;
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether a request names a kind of system that needs its architecture walked
 * before building: something that updates live, an agent that remembers people,
 * or a simulation, each as the thing being built.
 */
export function namesNewKindOfSystem(description) {
  return builtInClause(description, LIVE_SYSTEM, { needVerb: true })
    || builtInClause(description, REMEMBERING_AGENT)
    || builtInClause(description, SIMULATION);
}

const NEW_WORK_SHAPES = new Set(["new_feature", "major_overhaul", "replacement", "coordinated_cross_system_change"]);

/**
 * Whether the word lists read a request as new work that needs the product
 * brief and the story walk: a new product, a new feature or overhaul, or a new
 * kind of system. Maintenance, SMALL_SAFE work and a request worded as a fix or
 * a routine task never count.
 */
export function startsNewWork(route, description) {
  if (!route || route.mode === "SMALL_SAFE" || route.change_shape?.shape === "maintenance") return false;
  if (readsAsFixOrTask(description)) return false;
  return (
    NEW_WORK_SHAPES.has(route.change_shape?.shape) ||
    (route.archetypes ?? []).some((archetype) => archetype.id === "new-product-setup") ||
    namesNewKindOfSystem(description)
  );
}

function normaliseText(input) {
  return [
    input.title,
    input.description,
    input.intent,
    ...(input.tags ?? []),
    ...(input.changedFiles ?? []),
    ...(input.signals ?? []),
  ]
    .filter((value) => typeof value === "string")
    .join(" \n ")
    .toLowerCase();
}

function normaliseRisk(value, fallback) {
  if (typeof value === "string" && value.toLowerCase() in RISK_WORDS) {
    return RISK_WORDS[value.toLowerCase()];
  }
  if (Number.isFinite(value)) return Math.max(0, Math.min(5, Number(value)));
  return fallback;
}

function matchingTerms(text, terms) {
  return terms.filter((term) => phrasePattern(term).test(text));
}

function moduleEvidence(module, text) {
  const playbooks = [];
  const matchedTriggers = [];
  for (const [group, terms] of Object.entries(module.triggerGroups)) {
    const matches = matchingTerms(text, terms);
    if (matches.length > 0) {
      playbooks.push(group);
      matchedTriggers.push(...matches);
    }
  }
  return { playbooks, matchedTriggers: [...new Set(matchedTriggers)] };
}

// A request that keeps the screens as they are rules out the product UI
// specialist, however it says so: "with no UI changes", "backend only", "don't
// change the UI", "leave the screens unchanged", "the screen stays the same" or
// "a headless API". Work that is only on the server rules out client code too.
const SERVER_ONLY = [
  /\b(?:backend|back-end|server(?:-side)?|api)[- ]only\b/i,
  /\bheadless\b/i,
  /\bno (?:front-?end|client) (?:changes?|work)\b/i,
  /\bwithout (?:a |any )?(?:front-?end|client)\b(?! (?:test|tests|bug|bugs)\b)/i,
];
const NEGATED_MODULE_PATTERNS = Object.freeze({
  "product-ui-ux-motion": [
    /\bno client-visible changes?\b/i,
    /\bwithout (?:a |any )?(?:ui|ux|visual|interaction|motion|client-visible) changes?\b/i,
    /\bno (?:ui|ux|visual|interface|screen|design|layout) (?:changes?|work|needed|required)\b/i,
    /\bwith no (?:ui|ux|interface|screens?|visual changes?)\b/i,
    /\bno new (?:screens?|pages?|ui|ux|interface)\b/i,
    /\bwithout (?:a |any )?(?:ui|ux|interface)\b(?! (?:test|tests|bug|bugs)\b)/i,
    /\b(?:without|not|never|don't|do not) (?:chang|touch|modify|alter)(?:e|es|ed|ing)? (?:the |any )?(?:ui|ux|interface|screens?|visuals?|layout)\b/i,
    /\b(?:leave|leaving|keep|keeping) (?:the )?(?:ui|ux|interface|screens?|visuals?|layout) (?:unchanged|untouched|as (?:it is|they are|is)|the same)\b/i,
    /\bthe (?:ui|interface|screens?|layout) (?:stays?|remains?) (?:the same|unchanged|as (?:it is|is))\b/i,
    /\b(?:no|zero) (?:ui|ux|interface)\b/i,
    /\b(?:leave|leaving|keep|keeping) the (?:ui|ux|interface|screens?|layout|design) (?:alone|exactly as (?:it is|they are))\b/i,
    /\bthe (?:ui|ux|interface|screens?|layout) (?:is|are) (?:unchanged|untouched|the same)\b/i,
    /\b(?:ui|ux|interface|screen|visual|design) changes? (?:are|is) out of scope\b/i,
    /\bnot the (?:ui|ux|interface|screens?)\b/i,
    ...SERVER_ONLY,
  ],
  "frontend-client": [
    /\bno client-visible changes?\b/i,
    /\bwithout changing any client contract\b/i,
    /\bwithout (?:a |any )?(?:client|frontend|mobile|browser) changes?\b/i,
    ...SERVER_ONLY,
  ],
  "backend-api": [
    /\bwithout service changes?\b/i,
    /\bwithout (?:a |any )?(?:backend|api|server) changes?\b/i,
  ],
  "ai-llm": [
    /\bwithout (?:a |an |any )?(?:model|ai|llm)\b/i,
    /\bno (?:model|ai|llm) (?:call|change|work)\b/i,
  ],
  "delivery-release": [
    /\bno delivery claim\b/i,
    /\bwithout (?:a |any )?(?:delivery|release|deployment) changes?\b/i,
  ],
  "security-privacy-abuse": [
    /\b(?:do not|don't|without) (?:add(?:ing)?|introduc(?:e|ing)|enabl(?:e|ing)|chang(?:e|ing)|modify(?:ing)?|touch(?:ing)?) (?:any )?(?:auth(?:entication)?|authorization|access controls?)\b/i,
  ],
});

const SAFE_PROTECTED_ABSENCE_PATTERNS = Object.freeze([
  /\b(?:do not|don't|without) (?:add(?:ing)?|introduc(?:e|ing)|enabl(?:e|ing)|chang(?:e|ing)|modify(?:ing)?|touch(?:ing)?) (?:any )?(?:auth(?:entication)?|authorization|access controls?)\b/gi,
]);

function protectedDetectionText(text) {
  return SAFE_PROTECTED_ABSENCE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, " "),
    text,
  );
}

function explicitlyNegatedModules(text) {
  return new Set(
    Object.entries(NEGATED_MODULE_PATTERNS)
      .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
      .map(([moduleId]) => moduleId),
  );
}

function addInference(evidence, moduleId, reason, playbook = "context") {
  const target = evidence.get(moduleId);
  if (!target) return;
  target.matchedTriggers.push(`inferred:${reason}`);
  target.playbooks.push(playbook);
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Everyday senses of the payments and sign-in words (task-observer observation
 * 55, approved by the owner on 13 October 2026 with the rule that a request in
 * doubt keeps the higher care and is asked about).
 *
 * In 5.12.1 "git checkout main" routed CRITICAL with the payments checklist,
 * and "login with bitwarden mcp" routed CRITICAL as sign-in work. Each phrase
 * below shows the everyday sense from the words next to the protected word: a
 * git checkout, or signing in to a developer tool. Only these phrases are
 * removed before the protected patterns, the specialists and the libraries read
 * the request, so all three agree. A protected word with no everyday phrase
 * next to it is still read as protected work.
 */
const SIGN_IN_WORD = "(?:login|log\\s*in|sign[ -]?in)";
// Tools a person signs in to while working, never a sign-in method in a
// product. Google, Apple, GitHub, Slack, Supabase and Vercel are left out
// because "login with Google" and "sign in with Vercel" are product sign-in.
const DEVELOPER_TOOL =
  "(?:claude|codex|cursor|npm|wrangler|openrouter|bitwarden|bw|1password|docker|gcloud|eas|posthog|sentry|dataforseo|langfuse|apify|substack|testflight|[\\w.-]{1,40}\\s+(?:mcp|cli))";
// A command such as "vercel login" or "firebase login" is a developer signing in.
const LOGIN_COMMAND = `(?:${DEVELOPER_TOOL}|vercel|firebase|netlify|heroku|railway)`;
// "login to X" names where someone signs in, so hosted dashboards count too.
const SIGN_IN_DESTINATION =
  `(?:${DEVELOPER_TOOL}|vercel|github|gitlab|supabase|firebase|cloudflare|aws|gmail|google\\s+cloud|app\\s+store\\s+connect|render|railway|netlify|heroku)`;
const EVERYDAY_SENSES = Object.freeze([
  // A git checkout: the command, a branch or commit after the word, or a
  // working copy before it ("the main checkout", "a fresh checkout").
  /\bgit\s+checkout\b/gi,
  /\bcheckout\s+(?=-b\b|-B\b|--\s|(?:main|master|develop|dev|head|origin\/\S+)\b|(?:the|a|that|this|our|my|your)\s+(?:(?:new|feature|main|other|right|release|latest|previous)\s+)?(?:branch|commit|tag|revision)\b|[0-9a-f]{7,40}\b)/gi,
  /\b(?:main|shared|captured|clean|fresh|local|primary|separate|marketplace|repo|repository|working|sparse|detached|original|second)[\s_-]+checkouts?\b/gi,
  /\bcheckouts?\s+(?:of|from)\s+(?:the\s+|this\s+|that\s+)?(?:repo|repository|main|master|branch|source|project|revision|commit)\b/gi,
  /\b(?:inside|outside|escapes?|escaping|from)\s+(?:the|a|this|that)\s+checkout\b/gi,
  /\bcheckouts?\s+(?:is|was|are|were)\s+(?:at|on|detached|clean|dirty|behind|ahead)\b/gi,
  // Signing in to a developer tool, or asking the assistant to sign in.
  new RegExp(`\\b${LOGIN_COMMAND}\\s+(?:mcp\\s+|auth\\s+)?${SIGN_IN_WORD}\\b`, "gi"),
  new RegExp(`\\b(?:mcp|cli)\\s+${SIGN_IN_WORD}\\b`, "gi"),
  new RegExp(`\\b${SIGN_IN_WORD}\\s+(?:with|via|using|through)\\s+(?:the\\s+|my\\s+|your\\s+)?${DEVELOPER_TOOL}\\b`, "gi"),
  new RegExp(`\\b${SIGN_IN_WORD}\\s+(?:to|into|on)\\s+(?:the\\s+|my\\s+|your\\s+)?${SIGN_IN_DESTINATION}\\b`, "gi"),
  new RegExp(`\\b(?:can|could|will|would)\\s+you\\s+(?:please\\s+)?${SIGN_IN_WORD}\\b`, "gi"),
  new RegExp(`\\b(?:see\\s+if\\s+)?you(?:'ll|\\s+will)?\\s+(?:need\\s+to|can)\\s+${SIGN_IN_WORD}\\s+(?:to|into|via|with)\\s+(?:it|this|that|them)\\b`, "gi"),
  new RegExp(`\\byou(?:'ll|\\s+will)\\s+need\\s+to\\s+${SIGN_IN_WORD}\\s+(?:via|with|using|through)\\b`, "gi"),
  new RegExp(`\\bopen\\s+(?:the\\s+)?[\\w.-]{1,40}\\s+(?:for|to)\\s+${SIGN_IN_WORD}\\b`, "gi"),
  /(?:^|\s)\/login\b/gi,
  // A password kept in a password manager.
  /\b(?:password\s+managers?|master\s+password|find-(?:generic|internet)-password)\b/gi,
]);

/**
 * The one everyday sense of an access-control word that 6.5 removes: the
 * host's own permission switch, typed as the whole message ("bypass
 * permissions on", "approved permission"). A message that is only that phrase
 * asks for no work on the product.
 *
 * A replay of 3,107 real requests found 24 routed CRITICAL through "role" and
 * "permission" with no access-control work among them, mostly "role" meaning
 * a job. Three ways of removing those phrases were built and withdrawn, each
 * after an attack showed real work falling to QUICK:
 *
 * 1. "<adjective> role" anywhere: "add a manager role that can delete users".
 * 2. The same behind a list of access words: "the hr role can change payroll".
 * 3. Only phrases that state a job sense, such as "apply for a role" and "role
 *    play": "people apply for a role and once accepted they can wipe the
 *    workspace", "role-play mode must not let a student read another student's
 *    transcript".
 *
 * A phrase inside a longer request can always sit beside real protected work,
 * and no pattern can tell. So nothing is removed from inside a request. A job
 * role keeps the higher care, as a request in doubt always has.
 */
const ACCESS_NEVER = Object.freeze([
  /^\s*(?:bypass\s+permissions(?:\s+(?:on|off|mode))?|(?:approved|granted)\s+permissions?|permissions?\s+(?:approved|granted))\s*[.!]?\s*$/gi,
]);
const removeAll = (text, patterns) => patterns.reduce((current, pattern) => current.replace(pattern, " "), text);

/**
 * A payment word in a named document is document editing when nothing in the
 * request names software: "update the pricing section of the BHEL proposal
 * pdf", "purchase order template". A document named together with a software
 * word keeps the route, and so does a request that names neither, because a
 * missing word never lowers a route. Moving money is never document editing:
 * "pay the invoices in the attached pdf" keeps its route and asks.
 */
const MONEY_ACTION =
  /\b(?:pay|paying|refund|refunding|charge|charging|transfer|transferring|reimburse|reimbursing)\b|\b(?:process|processing|issue|issuing|collect|collecting|send|sending|approve|approving|settle|settling)\s+(?:\w+\s+){0,2}(?:payments?|invoices?|refunds?|bills?|dues|fees?|salar(?:y|ies))\b/i;
const DOCUMENT =
  /\b(?:pdfs?|docx?|word\s+(?:doc|document|file)s?|google\s+(?:doc|sheet)s?|spreadsheets?|excel|xlsx|pptx?|powerpoint|slide\s+decks?|decks?|proposals?|quotations?|contracts?|agreements?|letters?|memos?|brochures?|handouts?|purchase\s+orders?|teaching\s+notes?|case\s+stud(?:y|ies)|exhibits?)\b/i;
const SOFTWARE =
  /\b(?:build|building|implement|implementing|integrate|integrating|develop|developing|ship|shipping|deploy|deploying|design|designing|redesign|overhaul|add|adding|create|creating|wire\s+up|hook\s+up|refactor|migrate|apps?|application|screens?|pages?|site|website|web\s*app|apis?|endpoints?|webhooks?|backend|frontend|server|database|db|schema|code|codebase|components?|functions?|modules?|sdks?|flows?|forms?|buttons?|ui|ux|modals?|cart|paywall|users?|customers?|students?|ios|android|mobile|stripe|razorpay|revenuecat|paddle|upi|in-app|apple\s+pay|google\s+pay)\b/i;
const PAYMENT_WORD =
  /\b(?:payments?|pay|paid|billing|checkouts?|cardholders?|refunds?|subscriptions?|subscribe|invoices?|purchases?|pricing|price)\b/gi;

/** The request with every everyday sense of a payments or sign-in word removed. */
export function everydayText(text) {
  const withoutSenses = removeAll(removeAll(String(text ?? ""), EVERYDAY_SENSES), ACCESS_NEVER);
  return DOCUMENT.test(withoutSenses) && !SOFTWARE.test(withoutSenses) && !MONEY_ACTION.test(withoutSenses)
    ? withoutSenses.replace(PAYMENT_WORD, " ")
    : withoutSenses;
}

/**
 * The words still left that could mean either the product's own payments or
 * sign-in, or everyday wording, with nothing next to them saying which:
 * "update checkout", "change the login", "payment should be 50 percent before
 * and 50 after". These requests keep the route the word gives, and the hook
 * asks the owner one plain question. Product words such as "checkout page",
 * "login screen", "password reset", "pay with" or any software word settle the
 * reading as product work, and other sign-in words such as "auth" or "oauth"
 * were never narrowed, so neither asks.
 */
const PAYMENT_PRODUCT =
  /\b(?:checkouts?\s+(?:pages?|flows?|sessions?|screens?|forms?|buttons?|steps?|experience|process|links?|urls?|redirect|success|summary|sheet)|(?:at|to)\s+checkout|pay\s+(?:with|by|via|using|through|now|later|online|button)|payment\s+(?:gateway|methods?|options?|links?|intents?|providers?|processing))\b/i;
const AUTH_NARROWED = /\b(?:login|log\s*in|sign[ -]?in|signin|passwords?)\b/gi;
const AUTH_OTHER =
  /\b(?:auth(?:entication)?|authenticated|oauth|passkey|multi-factor|mfa|two-factor|2fa|single sign-on|sso|access token|refresh token|session token|biometric unlock)\b/i;
const AUTH_PRODUCT = new RegExp(
  `\\b(?:${SIGN_IN_WORD}|password)\\s+(?:screens?|pages?|flows?|forms?|buttons?|fields?|endpoints?|apis?|routes?|sessions?|attempts?|errors?|redirects?|options?|methods?|providers?|modals?|states?|handlers?|middleware|rules|strength|hash(?:es|ing)?|reset)\\b`
    + `|\\b(?:reset|forgot|change|hash(?:ing)?)\\s+(?:your\\s+)?passwords?\\b`
    + `|\\b(?:bcrypt|argon2?|scrypt|hashed\\s+passwords?)\\b`
    + `|\\b(?:google|apple|email|phone|otp|social|magic\\s+link|user|student|customer|admin)\\s+${SIGN_IN_WORD}\\b`
    + `|\\b${SIGN_IN_WORD}\\s+with\\s+(?:google|apple|email|phone|otp|a\\s+magic\\s+link|facebook|microsoft)\\b`,
  "i",
);

function ambiguousDomains(text, protectedIds, archetypeIds) {
  const domains = [];
  if ((protectedIds.includes("payments") || archetypeIds.includes("payments-subscription"))
    && !PAYMENT_PRODUCT.test(text) && !SOFTWARE.test(text)) {
    domains.push("payments");
  }
  if ((protectedIds.includes("authentication") || archetypeIds.includes("authentication"))
    && new RegExp(AUTH_NARROWED.source, "i").test(text) && !AUTH_OTHER.test(text)
    && !AUTH_PRODUCT.test(text) && !SOFTWARE.test(text)) {
    domains.push("authentication");
  }
  return domains;
}

/** The request with the ambiguous words removed, to say what the route would be if the owner means everyday wording. */
function withoutAmbiguousWords(text, domains) {
  let result = text;
  if (domains.includes("payments")) result = result.replace(PAYMENT_WORD, " ");
  if (domains.includes("authentication")) result = result.replace(AUTH_NARROWED, " ");
  return result;
}

function protectedDomains(input, text) {
  const detectionText = protectedDetectionText(text);
  const explicit = Array.isArray(input.protectedDomains)
    ? input.protectedDomains.map(String)
    : [];
  const detected = PROTECTED_DOMAIN_PATTERNS.filter(({ pattern }) =>
    pattern.test(detectionText),
  ).map(({ id }) => id);
  if (input.destructive === true) detected.push("destructive_action");
  if (input.privileged === true) detected.push("privileged_access");
  return unique([...explicit, ...detected]).sort();
}

function inferCrossCuttingEvidence(evidence, text, protectedIds) {
  const has = (phrase) => phrasePattern(phrase).test(text);
  const fullStack = has("full stack") || has("full-stack") || has("end to end");
  if (fullStack) {
    addInference(evidence, "product-ui-ux-motion", "full_stack", "visible");
    addInference(evidence, "frontend-client", "full_stack", "client");
    addInference(evidence, "backend-api", "full_stack", "service");
    addInference(evidence, "data-migrations", "full_stack", "storage");
  }

  const migration = has("migration") || has("backfill") || has("schema change");
  if (migration) {
    addInference(evidence, "data-migrations", "migration", "storage");
    addInference(
      evidence,
      "compatibility-integrations",
      "mixed_version_migration",
      "integration",
    );
    addInference(
      evidence,
      "reliability-recovery",
      "migration_recovery",
      "failure",
    );
    addInference(evidence, "delivery-release", "migration_rollout", "release");
  }

  const highVolume = has("high volume") || has("high-volume") || has("throughput");
  const service =
    has("service") || has("api") || has("endpoint") || has("backend");
  if (highVolume && service) {
    addInference(evidence, "backend-api", "high_volume_service", "service");
    addInference(
      evidence,
      "scale-performance-cost",
      "high_volume_service",
      "capacity",
    );
    addInference(
      evidence,
      "reliability-recovery",
      "high_volume_failure_modes",
      "failure",
    );
    addInference(
      evidence,
      "observability-operations",
      "high_volume_runtime",
      "operations",
    );
  }

  // Maintenance work ("rename the realtime toggle") gains none of these.
  const maintenance = isMaintenanceOnly(text);
  if (!maintenance && statesDemand(text)) {
    addInference(evidence, "scale-performance-cost", "stated_demand", "capacity");
    addInference(evidence, "backend-api", "stated_demand", "service");
  }

  if (!maintenance && builtInClause(text, LIVE_SYSTEM, { needVerb: true })) {
    addInference(evidence, "backend-api", "live_updates", "service");
    addInference(evidence, "scale-performance-cost", "live_updates", "capacity");
    addInference(evidence, "reliability-recovery", "live_updates", "failure");
  }

  if (!maintenance && builtInClause(text, REMEMBERING_AGENT)) {
    addInference(evidence, "ai-llm", "remembering_agent", "model");
    addInference(evidence, "data-migrations", "remembering_agent", "storage");
  }

  if (!maintenance && builtInClause(text, SIMULATION)) {
    addInference(evidence, "scale-performance-cost", "simulation_compute", "capacity");
  }

  if (has("rate limit") || has("rate limiting") || has("rate-limit") || has("rate-limiting")) {
    addInference(evidence, "security-privacy-abuse", "rate_limiting", "trust");
  }

  if (protectedIds.length > 0) {
    addInference(
      evidence,
      "security-privacy-abuse",
      "protected_domain",
      "trust",
    );
    addInference(
      evidence,
      "delivery-release",
      "protected_change_delivery",
      "release",
    );
  }

  if (protectedIds.includes("irreversible_action") || protectedIds.includes("destructive_migration")) {
    addInference(evidence, "data-migrations", "protected_data_change", "storage");
    addInference(evidence, "reliability-recovery", "protected_change_recovery", "failure");
  }

  if (protectedIds.includes("credential_rotation")) {
    addInference(evidence, "compatibility-integrations", "credential_coexistence", "integration");
    addInference(evidence, "reliability-recovery", "credential_rotation_recovery", "failure");
  }
}

function inferDimensions(input, text, candidateCount, isProtected) {
  const changedFileCount = input.changedFiles?.length ?? 0;
  const highImpact =
    /\b(?:customer-facing|user-facing|production|critical|high impact)\b/i.test(
      text,
    );
  const uncertain = /\b(?:unknown|uncertain|investigate|ambiguous|unproven)\b/i.test(
    text,
  );
  const novel = /\b(?:new|introduce|first|novel|greenfield)\b/i.test(text);
  const irreversible = PROTECTED_DOMAIN_PATTERNS.some(
    ({ id, pattern }) =>
      ["destructive_migration", "irreversible_action"].includes(id) &&
      pattern.test(text),
  );

  return {
    impact: normaliseRisk(input.impact, highImpact ? 4 : candidateCount > 0 ? 2 : 1),
    uncertainty: normaliseRisk(input.uncertainty, uncertain ? 4 : 1),
    novelty: normaliseRisk(input.novelty, novel ? 3 : 1),
    irreversibility: normaliseRisk(
      input.irreversibility,
      irreversible ? 5 : isProtected ? 3 : 1,
    ),
    boundaries: normaliseRisk(
      input.boundaries,
      Math.min(5, Math.max(1, candidateCount, changedFileCount > 4 ? 3 : 0)),
    ),
    evidenceGaps: normaliseRisk(
      input.evidenceGaps,
      input.profileStatus === "UNKNOWN" ? 4 : input.profileStale ? 3 : 1,
    ),
  };
}

function dimensionsFor(moduleId, globalDimensions, input) {
  const overrides = input.moduleSignals?.[moduleId] ?? {};
  return Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [
      dimension,
      normaliseRisk(overrides[dimension], globalDimensions[dimension]),
    ]),
  );
}

function isSmallSafeTask(input, text, candidateCount, protectedIds) {
  if (protectedIds.length > 0 || input.destructive || input.privileged) return false;
  if (input.smallSafe === true) return true;
  if (input.material === false) return true;
  if (input.material === true) return false;
  const files = input.changedFiles ?? [];
  const documentationOnly =
    files.length > 0 && files.every((file) => SAFE_FILE_PATTERN.test(file));
  const trivialWords = /\b(?:typo|spelling|punctuation|formatting only)\b/i.test(text);
  return documentationOnly || (trivialWords && candidateCount === 0);
}

function chooseMode({ input, specialists, dimensions, protectedIds, smallSafe }) {
  if (protectedIds.length > 0 || input.destructive || input.privileged) {
    return "CRITICAL";
  }
  if (smallSafe) return "SMALL_SAFE";
  const maximumRisk = Math.max(...Object.values(dimensions));
  if (specialists.length <= 1 && maximumRisk <= 2) return "QUICK";
  if (specialists.length <= 2 && maximumRisk <= 4) return "FOCUSED";
  return "FULL";
}

/**
 * Exposed only so the v4.1 guard test can prove the critical boundary is
 * unchanged by the question floor. `chooseMode` itself is deliberately
 * untouched — the two concerns are independent, and conflating them would undo
 * routing correctness that already exists.
 */
export const chooseModeForTest = chooseMode;

function taskSurfaceMap(specialists, input) {
  const selected = new Set(specialists.map(({ id }) => id));
  return {
    visibleProduct: selected.has("product-ui-ux-motion"),
    client: selected.has("frontend-client"),
    service: selected.has("backend-api"),
    storedData: selected.has("data-migrations"),
    trustBoundary: selected.has("security-privacy-abuse"),
    capacity: selected.has("scale-performance-cost"),
    failureRecovery: selected.has("reliability-recovery"),
    sharedArchitecture: selected.has("architecture-maintainability"),
    externalCompatibility: selected.has("compatibility-integrations"),
    productionOperations: selected.has("observability-operations"),
    modelBehavior: selected.has("ai-llm"),
    delivery: selected.has("delivery-release"),
    changedFiles: [...(input.changedFiles ?? [])],
  };
}

/**
 * Route a task without using registry position as importance. A shuffled module
 * registry produces the same selected modules, scores, and deterministic order.
 */
/**
 * The owner calling the work a prototype (references/prototype-track.md). The
 * word has to sit in a phrase about making one: "build a quick prototype",
 * "as an experiment", "this is just a spike", "prototype this". A bare
 * "prototype" does not count, because "open the prototype" names the design
 * package's prototype and "Object.prototype" is code.
 */
const PROTOTYPE_NOUN = "(?:prototype|proof[- ]of[- ]concept|poc|spike|throwaway|experiment)";
// The word must end the phrase. "an experiment framework" and "a spike
// detector" name products, so another noun after the word rules it out.
const PROTOTYPE_END = "(?=\\s*(?:$|[.,:;!?)\\n]|(?:of|for|to|that|which|so|with|and|on|in|here|first|only|before)\\b))";
const PROTOTYPE = new RegExp(
  [
    `\\b(?:build|make|create|write|do|try|hack|sketch|knock|put|whip|spin|mock)\\b[^.?!\\n]{0,40}?\\b(?:a|an)\\s+(?:(?:quick|rough|small|little|tiny|simple|throwaway|throw-away)\\s+){0,2}${PROTOTYPE_NOUN}\\b${PROTOTYPE_END}`,
    `\\b(?:as|just|only|purely)\\s+(?:a|an)\\s+(?:(?:quick|rough|small|little|tiny|simple|throwaway)\\s+)?${PROTOTYPE_NOUN}\\b${PROTOTYPE_END}`,
    `\\bthis\\s+is\\s+(?:just\\s+|only\\s+)?(?:a|an)\\s+(?:(?:quick|rough|small|little|tiny|simple|throwaway)\\s+)?${PROTOTYPE_NOUN}\\b${PROTOTYPE_END}`,
    `^\\s*(?:please\\s+|let'?s\\s+|can\\s+you\\s+|could\\s+you\\s+)?(?:quickly\\s+)?(?:prototype|spike)\\s+(?:this|it|that|the|a|an|out)\\b`,
    `\\bthrow[- ]?away\\s+(?:code|version|build|script|spike|prototype)\\b`,
  ].join("|"),
  "i",
);
// Words that put the work in front of real people, real money or stored data.
// A request holding one gets no prototype line. The list is a courtesy and is
// known to be incomplete; nothing depends on it, because the signal changes
// nothing in the route and the hook skips nothing for it.
const NOT_AN_EXPERIMENT =
  /\b(?:production|prod|live|deploy(?:s|ed|ing|ment)?|release[sd]?|publish(?:es|ed|ing)?|real|database|db|tables?|schema|migrat(?:e|es|ed|ing|ion)s?|delet(?:e|es|ed|ing)|drop(?:s|ped|ping)?|stripe|razorpay|upi|charg(?:e|es|ed|ing)|cards?|customers?|notif(?:y|ies|ication)s?|emails?|sms|send(?:s|ing)?)\b/i;
/** True when the request calls the work a prototype, a spike, an experiment or throwaway, and names nothing real. */
export const namesPrototype = (text) => {
  const head = String(text ?? "").slice(0, 4000);
  return PROTOTYPE.test(head) && !NOT_AN_EXPERIMENT.test(head);
};

export function routeTask(input = {}, options = {}) {
  const registry = options.moduleRegistry ?? SPECIALIST_MODULES;
  const everyday = everydayText(normaliseText(input));
  const text = options.readAsEveryday ? withoutAmbiguousWords(everyday, options.readAsEveryday) : everyday;
  const detectedProtectedDomains = protectedDomains(input, text);
  const evidence = new Map(
    registry.map((module) => [module.id, moduleEvidence(module, text)]),
  );
  inferCrossCuttingEvidence(evidence, text, detectedProtectedDomains);

  const negatedModules = explicitlyNegatedModules(text);
  for (const moduleId of negatedModules) {
    const result = evidence.get(moduleId);
    if (result) {
      result.matchedTriggers = [];
      result.playbooks = [];
    }
  }

  for (const explicitModuleId of input.modules ?? []) {
    if (!SPECIALIST_BY_ID[explicitModuleId] || !evidence.has(explicitModuleId)) {
      throw new Error(`Unknown specialist module: ${explicitModuleId}`);
    }
    addInference(evidence, explicitModuleId, "explicit_task_surface");
  }

  // Project facts read from the repository (src/project-facts.mjs). A project
  // with a deploy config runs somewhere people use it, so the change has to be
  // observable there whatever the request says (observation 0262).
  if (input.facts?.deploys === true && evidence.has("observability-operations")) {
    addInference(evidence, "observability-operations", "deployed_project", "operations");
  }

  /**
   * A request can name something people look at without using an interface
   * word. "Build a new writing editor" and "Add a dashboard that shows weekly
   * recordings" matched no trigger, so they selected no specialist and the
   * product UI playbooks were never read for them. When the change shape
   * says the thing being built, redesigned or replaced is a visible surface,
   * the product UI specialist is added through the same inference path as any
   * other context. A request that explicitly rules out UI work keeps it out.
   */
  const changeShape = classifyChangeShape(text, {
    protectedDomains: detectedProtectedDomains,
  });
  if (
    VISIBLE_SURFACE_SHAPES.has(changeShape.shape) &&
    changeShape.reasons.includes("visible_surface") &&
    !negatedModules.has("product-ui-ux-motion")
  ) {
    addInference(evidence, "product-ui-ux-motion", "visible_surface", "visible");
  }
  if (
    changeShape.shape !== "maintenance" &&
    changesScreenElement(text) &&
    !negatedModules.has("product-ui-ux-motion")
  ) {
    addInference(evidence, "product-ui-ux-motion", "screen_element", "visible");
  }

  let candidateIds = [...evidence.entries()]
    .filter(([, result]) => result.matchedTriggers.length > 0)
    .map(([id]) => id);
  const smallSafe = isSmallSafeTask(
    input,
    text,
    candidateIds.length,
    detectedProtectedDomains,
  );

  /**
   * Archetypes apply only once SMALL_SAFE is ruled out, so renaming an upload
   * helper never summons the capture-and-upload specialists.
   *
   * They match on product nouns — "voice", "recording", "refunds" — which is
   * the vocabulary someone describing a feature actually uses. `triggerGroups`
   * matches engineering vocabulary nobody types when asking for a feature,
   * which is why a plainly worded request previously selected no specialist at
   * all and left nobody in the room to anticipate anything.
   */
  /**
   * Archetypes fill an empty room; they do not crowd a full one — but "crowd"
   * was only ever about *specialists*.
   *
   * Until 5.5.0 a full room suppressed the match itself, so the known failure
   * modes for the work never surfaced and the allowance stayed at the tier
   * ceiling. That inverted the intent: a task worded in enough engineering
   * vocabulary to select three specialists is usually the task whose edge cases
   * matter most, and it was exactly the task anticipation switched off for.
   * "Migrate the recordings table and backfill it" selected four specialists,
   * matched the migration library on three separate words, and asked none of
   * its six questions.
   *
   * The two concerns are now separate. Specialists decide which playbooks are
   * read, and a full room still declines the bulk-add that unbalanced routing.
   * Failure modes decide which edge cases are raised, and those always apply.
   */
  const roomIsEmpty = candidateIds.length < ARCHETYPE_ROOM_THRESHOLD;
  const matchedArchetypes =
    smallSafe || isMaintenanceOnly(text, { protectedDomains: detectedProtectedDomains })
      ? []
      : detectArchetypes(text, options.archetypeLibrary ?? loadArchetypes());
  for (const archetype of roomIsEmpty ? matchedArchetypes : []) {
    for (const moduleId of archetype.modules) {
      // Explicit negation outranks an archetype. "Change deterministic API
      // validation without a model" mentions a model only to rule it out, and
      // an anticipation layer that ignores what the user just excluded is worse
      // than one that never fires.
      if (negatedModules.has(moduleId)) continue;
      addInference(evidence, moduleId, `archetype:${archetype.id}`, "archetype");
    }
  }
  if (matchedArchetypes.length > 0) {
    candidateIds = [...evidence.entries()]
      .filter(([, result]) => result.matchedTriggers.length > 0)
      .map(([id]) => id);
  }

  const globalDimensions = inferDimensions(
    input,
    text,
    candidateIds.length,
    detectedProtectedDomains.length > 0,
  );

  const specialists = candidateIds
    .map((id) => {
      const module = registry.find((candidate) => candidate.id === id);
      const result = evidence.get(id);
      const dimensions = dimensionsFor(id, globalDimensions, input);
      const score = SCORE_DIMENSIONS.reduce(
        (total, dimension) => total + dimensions[dimension],
        0,
      );
      return {
        id,
        name: module.name,
        score,
        dimensions,
        matchedTriggers: unique(result.matchedTriggers).sort(),
        playbooks: unique(result.playbooks).sort(),
      };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const baseMode = chooseMode({
    input,
    specialists,
    dimensions: globalDimensions,
    protectedIds: detectedProtectedDomains,
    smallSafe,
  });

  /**
   * Change shape is classified independently of archetypes, on purpose. The
   * room rule skips archetypes once evidence has already chosen three
   * specialists, which would drop the activation question on exactly the large
   * coordinated features that most need it.
   *
   * The floor only ever raises depth, and never disturbs SMALL_SAFE or
   * CRITICAL: a typo stays quiet, and a protected boundary keeps its ceiling.
   */
  const flooredMode = applyDepthFloor(baseMode, changeShape.depthFloor);
  const ambiguous = options.readAsEveryday
    ? []
    : ambiguousDomains(text, detectedProtectedDomains, matchedArchetypes.map(({ id }) => id));

  // The experiment track (references/prototype-track.md). The owner's word
  // adds a signal and changes nothing else in the route, and the hook adds
  // one line and skips nothing. Whether the work touches anything real is a
  // judgement, and the session makes it with the track's limits in front of
  // it. A version that lowered the depth here let "build a prototype that
  // posts to our LinkedIn page" fall to QUICK, and a version that skipped the
  // brief interview also skipped the scope-change and correction lines.
  const prototype =
    !["SMALL_SAFE", "CRITICAL"].includes(flooredMode) &&
    detectedProtectedDomains.length === 0 &&
    ambiguous.length === 0 &&
    namesPrototype(text);
  const mode = flooredMode;
  const routeArchetypes = matchedArchetypes;

  const selectedSpecialists = mode === "SMALL_SAFE" ? [] : specialists;
  const scores = Object.fromEntries(
    selectedSpecialists.map((specialist) => [
      specialist.id,
      {
        score: specialist.score,
        reasons: [
          ...SCORE_DIMENSIONS.map(
            (dimension) => `${dimension}:${specialist.dimensions[dimension]}`,
          ),
          ...specialist.matchedTriggers.map((trigger) => `trigger:${trigger}`),
          ...specialist.playbooks.map((playbook) => `playbook:${playbook}`),
        ],
      },
    ]),
  );
  const signals = [
    ...(prototype ? ["prototype"] : []),
    ...detectedProtectedDomains.map((domain) => `protected:${domain}`),
    ...ambiguous.map((domain) => `ambiguous:${domain}`),
    ...routeArchetypes.map((archetype) => `archetype:${archetype.id}`),
    ...Object.entries(taskSurfaceMap(selectedSpecialists, input))
      .filter(([, active]) => active === true)
      .map(([surface]) => `surface:${surface}`),
  ].sort();

  // Before a thing exists is the one moment when asking is cheapest and a wrong
  // assumption is most expensive, so an archetype route raises the ceiling
  // rather than truncating exactly the questions worth asking. The floor and
  // the mechanical audit are unchanged, and the budget still binds.
  const questionBudget =
    routeArchetypes.length > 0 && mode !== "SMALL_SAFE"
      ? Math.max(QUESTION_BUDGETS[mode], ARCHETYPE_QUESTION_BUDGET)
      : QUESTION_BUDGETS[mode];

  return {
    schema_version: CONTRACT_VERSION,
    task_id: String(input.task_id ?? input.taskId ?? "unbound-task"),
    mode,
    material: mode !== "SMALL_SAFE",
    change_shape: {
      shape: changeShape.shape,
      activation: changeShape.activation && mode !== "SMALL_SAFE",
      depth_floor: changeShape.depthFloor,
      reasons: changeShape.reasons,
    },
    question_budget: questionBudget,
    archetypes: routeArchetypes.map(({ id, name, matchedOn }) => ({ id, name, matchedOn })),
    selected_modules: selectedSpecialists.map(({ id }) => id),
    scores,
    signals,
  };
}

export function selectedModuleIds(decision) {
  return [...decision.selected_modules];
}
