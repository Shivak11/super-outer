import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * From 5.17 Super-outer follows the work under way in a session, not only the
 * message in front of it.
 *
 * On 15 October 2026 a whole build plan for an AI agent product was written
 * after "yes same database, go ahead plan the build", which the word lists
 * routed QUICK: nothing in that message said what the session was building.
 * The story walk that would have found the agent's needs over time (returning
 * after three days, a long run, a vague complaint) had been suggested 31 times
 * as a line of text and never opened. This module keeps a small record of the
 * work a session has started, knows an AI agent product from the repository as
 * well as from the words, and tells whether a walk has been recorded, so the
 * hook can say the right thing at the moment a plan is made.
 */

const WORK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECORDS_DIR = path.join(".engineering", "super-outer");

// ------------------------------------------------------------------ the record of the work under way

const workFile = ({ session, repository, stateDir }) => {
  if (!session) return null;
  const key = createHash("sha256").update(JSON.stringify([session, repository, "work-under-way"])).digest("hex");
  const stateRoot = stateDir || process.env.SUPER_OUTER_STATE_DIR || path.join(os.tmpdir(), "super-outer-state");
  return path.join(path.resolve(stateRoot), "session-work", `${key}.json`);
};

const EMPTY = Object.freeze({ newWork: false, planning: false, kinds: [], briefShown: false });

/** The work this session has started in this repository, or an empty record. No typed text is kept. */
export function readWork(scope, { now = Date.now() } = {}) {
  try {
    const file = workFile(scope);
    if (!file) return { ...EMPTY };
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!(now - Number(saved.at) < WORK_TTL_MS)) return { ...EMPTY };
    return {
      newWork: saved.newWork === true,
      planning: saved.planning === true,
      kinds: Array.isArray(saved.kinds) ? saved.kinds.map(String) : [],
      briefShown: saved.briefShown === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Adds to the record and never takes away: a later QUICK message does not end
 * the work a session started, which is how one recorded build plan lost its route.
 */
export function noteWork(scope, update, { now = Date.now() } = {}) {
  const current = readWork(scope, { now });
  const next = {
    newWork: current.newWork || update.newWork === true,
    planning: current.planning || update.planning === true,
    kinds: [...new Set([...current.kinds, ...(update.kinds ?? [])])],
    briefShown: current.briefShown || update.briefShown === true,
    at: now,
  };
  try {
    const file = workFile(scope);
    if (!file) return next;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(next), { mode: 0o600 });
  } catch {}
  return next;
}

// ------------------------------------------------------------------ the repository's own records

const listMarkdown = (directory, depth = 3) => {
  const found = [];
  const walk = (folder, level) => {
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory() && level < depth) walk(full, level + 1);
      else if (entry.isFile() && entry.name.endsWith(".md")) found.push(full);
    }
  };
  walk(directory, 0);
  return found;
};

const readSmall = (file, limit = 200_000) => {
  try {
    const stat = fs.statSync(file);
    return stat.size > limit ? "" : fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** The intent records and the product brief that say what this product must do for people. */
export function productRecords(root) {
  if (!root) return [];
  const base = path.join(root, RECORDS_DIR);
  return [
    ...listMarkdown(path.join(base, "intent"), 0),
    ...(fs.existsSync(path.join(base, "product-brief.md")) ? [path.join(base, "product-brief.md")] : []),
  ];
}

// A story walk is recorded once its table is saved where Super-outer looks:
// the product brief or an intent record. Its rows start "| Moment for <name>".
const WALK_TABLE = /^\|\s*Moment for\b/im;
// From 6.6 a journey map is recorded the same way: one table per person, saved
// in the same files, with a header row that starts "| Phase for <name>".
const JOURNEY_TABLE = /^\|\s*Phase for\b/im;

const recordsHold = (root, table) => Boolean(root)
  && listMarkdown(path.join(root, RECORDS_DIR)).some((file) => table.test(readSmall(file)));

export function walkRecorded(root) {
  return recordsHold(root, WALK_TABLE);
}

export function journeyMapRecorded(root) {
  return recordsHold(root, JOURNEY_TABLE);
}

// ------------------------------------------------------------------ an AI agent product

// Phrases that name an agent product, never the word "agent" alone: "use a
// subagent", "user agent" and "spawn an agent that reviews" describe the coding
// assistant or a header, not something a customer talks to. The same list is
// the library's match list in references/archetypes/ai-agent-product.json.
export const AGENT_PHRASES = Object.freeze([
  "ai agent", "agent harness", "agent that edits", "agent that remembers", "talk to an agent",
  "talk to the agent", "talks to an agent", "talks to the agent", "conversational builder", "conversational agent",
  "chat agent", "long-running agent", "long running agent", "agent memory", "workflowagent",
  "assistant that remembers", "copilot for",
]);

const AGENT_PACKAGES = Object.freeze([
  "ai", "workflow", "@openai/agents", "@langchain/langgraph", "@mastra/core", "@anthropic-ai/claude-agent-sdk",
  "@vercel/workflow", "@inngest/agent-kit", "@cloudflare/agents", "agents",
]);
const AGENT_PACKAGE_PREFIXES = Object.freeze(["@ai-sdk/", "@workflow/"]);
const AGENT_PYTHON = /^(?:langgraph|openai-agents|pydantic-ai|claude-agent-sdk|crewai|autogen-agentchat|google-adk)\b/im;
// With an agent package installed, a message still has to be about the agent
// side: "add an AI summary to the orders page" is an AI feature, not an agent.
const MENTIONS_AGENT = /\b(?:agents?|assistants?|chat|conversations?|conversational|harness|copilot|bot)\b/i;
const RECORDS_NAME_AGENT = /\bAI agent\b|\bagent harness\b|\bconversational (?:builder|agent)\b|\btalk(?:s|ing)? to (?:an|the) (?:AI )?agent\b/i;

const lower = (text) => String(text ?? "").toLowerCase();

export function namesAgentProduct(description) {
  const text = ` ${lower(description).replace(/\s+/g, " ")} `;
  return AGENT_PHRASES.some((phrase) => text.includes(phrase));
}

const BUILD_VERB = /\b(?:build|building|create|creating|make|making|add|adding|design|designing|develop|developing|start|set\s+up|turn\s+\w+(?:\s+\w+)?\s+into)\b/i;

/**
 * A request to build an agent product is new work, and a new kind of system,
 * even when the word lists find no new-feature phrase: "Build an AI agent that
 * edits the activity" read as neither in 5.16.3.
 */
export const buildsAgentProduct = (description) => namesAgentProduct(description) && BUILD_VERB.test(String(description ?? ""));

export function dependsOnAgentSdk(root) {
  if (!root) return false;
  try {
    const manifest = JSON.parse(readSmall(path.join(root, "package.json")) || "{}");
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    if (names.some((name) => AGENT_PACKAGES.includes(name) || AGENT_PACKAGE_PREFIXES.some((prefix) => name.startsWith(prefix)))) return true;
  } catch {}
  return ["pyproject.toml", "requirements.txt"].some((file) => AGENT_PYTHON.test(readSmall(path.join(root, file)).replace(/^\s*["']?/gm, "")));
}

export function recordsDescribeAgent(root) {
  return productRecords(root).some((file) => RECORDS_NAME_AGENT.test(readSmall(file)));
}

/**
 * Whether new work is an AI agent product. Only called for new work: a fix in
 * an AI SDK repository is still a fix and gets no agent checklist.
 */
export function detectAgentProduct({ description, root }) {
  if (namesAgentProduct(description)) return { isAgent: true, reason: "words" };
  if (recordsDescribeAgent(root)) return { isAgent: true, reason: "records" };
  if (MENTIONS_AGENT.test(String(description ?? "")) && dependsOnAgentSdk(root)) return { isAgent: true, reason: "packages" };
  return { isAgent: false, reason: null };
}

// ------------------------------------------------------------------ what a message is doing

const PLANNING = /\b(?:plan(?:ning)?\s+(?:the|a|this|our|its)\s+(?:build|implementation|work|architecture|rollout)|(?:build|implementation)\s+plan|plan\s+it\b|plan\s+the\s+\w+|go\s+ahead\s+(?:and\s+)?(?:build|implement|plan|start)|start\s+(?:the\s+)?(?:build(?:ing)?|implement(?:ation|ing)?)|let'?s\s+(?:build|implement)|implement\s+(?:it|this|the\s+\w+)|architecture\s+for)\b/i;

/** A message that asks for a plan or for building to start. */
export const asksToPlanOrBuild = (description) => PLANNING.test(String(description ?? ""));

const CHANGE = /\b(?:instead|rather\s+than|no,?\s+make|no,?\s+(?:it|this)\s+should|don'?t\s+want|do\s+not\s+want|switch\s+to|change\s+(?:it|this|that|the)\b|let'?s\s+(?:have|make|use|keep|drop|move)|should\s+(?:also|not|now|be\s+on|be\s+in)|must\s+(?:also|not)|we\s+(?:also\s+)?need|separate\s+(?:branch|deployment|database|app)|not\s+(?:a|the)\s+\w+\s+but|drop\s+the|remove\s+the|replace\s+(?:it|the|this))\b/i;

// Wording that can widen or narrow what the product is: who it serves, what it
// can do, where it runs, where its data lives, what it connects to. A message
// such as "teachers would also use the same route" changed one recorded
// build's scope and matched none of the change words above.
const SCOPE = /\b(?:(?:would|will|could|can|should|must)\s+also|also\s+(?:for|support|need|want|allow|let|add|be\s+able)|as\s+well|in\s+addition|(?:new|another|second)\s+(?:feature|capability|role|user\s+type|audience|module|product|app|platform|integration)|add(?:ing)?\s+(?:support\s+for|a\s+new|another)|integrat(?:e|ion)\s+with|(?:deploy(?:ed)?|host(?:ed)?)\s+(?:to|on|separately|as)|(?:same|separate|shared|different)\s+(?:route|database|deployment|login|sign[- ]?in|app|codebase|branch)|(?:for|to)\s+(?:students|faculty|teachers|admins|everyone|all\s+users|other\s+users)\s+too|(?:they|students|faculty|teachers|users)\s+too|(?:no\s+longer|not)\s+need(?:ed)?\s+(?:the|a|this)|(?:drop|remove|cut)\s+(?:the\s+)?(?:feature|step|role|support))\b/i;

// Wishes, new needs, stack choices and new devices, said casually. Every
// follow-up that widened the Cloudflare reading library ("I'd also like...",
// "ideally i'd want... including phones", "for the parser use llama parse or
// docling") matched none of the wording above, so the parser choice was never
// reopened (Codex, 27 October 2026).
const SCOPE_WISH = /\b(?:i'?d\s+(?:also\s+)?(?:like|love|want|prefer)(?!\s+you\b)|i\s+would\s+(?:also\s+)?(?:like|love|want|prefer)(?!\s+you\b)|ideally|(?:it\s+)?would\s+be\s+(?:great|nice|good|ideal|amazing|cool)\s+(?:if|to\s+have)|it\s+would\s+be\s+(?:great|nice|ideal|amazing|cool)\b|(?<!(?:see|check|find\s+out)\s)if\s+(?:it|we)\s+(?:can|could)\b|can\s+(?:it|we)\s+also|(?:we|i)(?:'?d|'?ll|\s+would|\s+will)\s+(?:also\s+)?need|think\s+of\s+it\s+(?:like|as)|(?:a|an)\s+\w+\s+replacement|for\s+the\s+(?:parser|parsing|database|db|auth|login|hosting|host|storage|search|model|llm|queue|cache|backend|frontend|api|payments?|emails?)\s+(?:use|go\s+with|try|pick|choose)|including\s+(?:phones?|mobile|tablets?|ios|android|ipad)|(?:on|for)\s+(?:phones?|mobile|tablets?|ios|android|ipad)\s+(?:as\s+well|too)|work\s+on\s+(?:phones?|mobile|tablets?|ios|android|ipad))/i;

/** A message whose wording can change the product's scope. The session decides whether it does. */
export const readsAsScopeChange = (description) => {
  const text = String(description ?? "");
  return SCOPE.test(text) || SCOPE_WISH.test(text);
};

/**
 * A scope change stated as an addition. A message that also reads as a fix
 * gets the scope line only on this stronger reading: "the upload is broken,
 * also i'd like epubs" adds something, while "ideally fix it today" does not.
 */
export const readsAsAddedScope = (description) => {
  const text = String(description ?? "");
  return SCOPE.test(text) || (SCOPE_WISH.test(text) && /\b(?:also|as\s+well|plus|too)\b/i.test(text));
};

// The owner telling the assistant that it got something wrong. "I just asked
// you...didn't ask you to put it" was said after a feasibility question had
// been answered with a build. The line this raises asks the session to fix
// the instruction or assumption behind the mistake as well as the output.
const CORRECTION = /\b(?:i\s+(?:just|only)\s+asked|i\s+asked\s+you|did(?:n'?t|\s+not)\s+ask(?:\s+you)?\b|not\s+what\s+i\s+(?:asked|meant|wanted|said)|that(?:'?s|\s+is|\s+was)\s+(?:wrong|incorrect|not\s+(?:right|correct|true|what))|you\s+(?:missed|forgot|ignored|misunderstood|misread|skipped|overlooked|got\s+(?:it|this|that)\s+wrong|should(?:n'?t|\s+not)\s+have|did(?:n'?t|\s+not)\s+(?:read|check|follow|run|listen))|why\s+did\s+you|i\s+(?:already\s+)?(?:told|said)\s+(?:you\s+)?(?:already|before|earlier|not\s+to|never)|as\s+i\s+said|(?:again|still),?\s+(?:wrong|broken|not\s+(?:working|fixed|done))|stop\s+(?:doing|adding|asking|using))\b/i;

/** A message that reads as the owner correcting the assistant. The session decides whether it is one. */
export const readsAsCorrection = (description) => CORRECTION.test(String(description ?? "").slice(0, 4000));

/** A message that reads as changing a requirement, in detail or in scope. The session decides; this only says when to remind it. */
export const readsAsRequirementChange = (description) => CHANGE.test(String(description ?? "")) || readsAsScopeChange(description);

// ------------------------------------------------------------------ the moments a walk would check

// Said as moments in the customer's week, so the line reads as questions about
// people, never as a list of mechanisms.
const GENERAL_MOMENTS = Object.freeze([
  "many people doing this at the same moment",
  "a person coming back days later",
  "something slow or down halfway through",
  "someone misusing it",
  "what each use costs",
  "someone other than a developer needing to change it",
  "data that must be kept or deleted",
]);

// Only code counts as handling a moment, matched with its exact letter case:
// the terms are API names, and "Y.snapshot" in any case matched
// "body.snapshots" in a test. Uncommitted files count, so work in progress is
// seen. Records, docs and the agent pack name
// every API, and a package list or lockfile shows a library is installed, not
// that the feature uses it.
const CODE_ONLY = Object.freeze([
  ":(exclude,glob)**/skills/super-outer/**", ":(exclude,glob)**/skills/draw-system-diagram/**", ":(exclude,glob)**/skills/team-technical-diagram/**",
  ":(exclude,glob)**/skills/jev-opportunities/**", ":(exclude,glob)**/skills/caveman-opportunities/**",
  ":(exclude,glob)**/skills/edge-cases/**",
  ":(exclude,glob).engineering/**", ":(exclude,glob)docs/**",
  ":(exclude,glob)**/*.md", ":(exclude,glob)**/*.mdx", ":(exclude,glob)**/package.json",
  ":(exclude,glob)**/package-lock.json", ":(exclude,glob)**/pnpm-lock.yaml", ":(exclude,glob)**/yarn.lock", ":(exclude,glob)**/bun.lock*",
]);

export const MOMENT_SEARCH_LIMIT_MS = 1500;

// `checked` is false only when the search ran out of time or was given none.
// No match, or a folder git cannot search, counts as checked, as before 5.20.1.
const searchAll = (needles, root, timeoutMs = MOMENT_SEARCH_LIMIT_MS) => {
  if (!root || needles.length === 0) return { found: new Set(), checked: true };
  if (!(timeoutMs > 0)) return { found: new Set(), checked: false };
  try {
    const out = execFileSync(
      "git",
      ["grep", "--untracked", "-F", "-o", "-h", ...needles.flatMap((needle) => ["-e", needle]), "--", ".", ...CODE_ONLY],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
    );
    return { found: new Set(out.split("\n").filter(Boolean)), checked: true };
  } catch (error) {
    const timedOut = error?.code === "ETIMEDOUT" || (error?.signal && error?.status === null);
    return { found: new Set(), checked: !timedOut };
  }
};

/**
 * The moments a walk of this work would check that the repository does not
 * already answer. For an AI agent product they come from the agent library's
 * failure modes, each settled when its code evidence is present; one git grep
 * covers them all so the hook stays inside its time limit.
 *
 * `checked` is false when the search for code evidence did not finish in
 * `budgetMs`. The moments are then unsettled rather than uncovered, so the
 * prompt hook says nothing about them and leaves the notice for a later
 * prompt, instead of claiming that none of them is handled.
 */
export function checkMoments({ isAgent, root, library, budgetMs = MOMENT_SEARCH_LIMIT_MS }) {
  if (!isAgent) return { moments: [...GENERAL_MOMENTS], checked: true };
  const agent = library?.archetypes?.find((archetype) => archetype.id === "ai-agent-product");
  if (!agent) return { moments: [...GENERAL_MOMENTS], checked: true };
  const modes = agent.failureModes.filter((mode) => typeof mode.moment === "string");
  const { found, checked } = searchAll([...new Set(modes.flatMap((mode) => mode.lookFor ?? []))], root, budgetMs);
  return {
    moments: modes
      .filter((mode) => !(mode.lookFor ?? []).some((needle) => found.has(needle)))
      .map((mode) => mode.moment),
    checked,
  };
}

export const uncoveredMoments = (options) => checkMoments(options).moments;

export const momentList = (moments) => moments.join("; ");

// ------------------------------------------------------------------ plan files

// A plans folder, or a file whose name has "plan" as a word: "build-plan.md"
// and "PLAN.md" count, "explanation.md" does not.
const PLAN_PATH = /(?:^|[\\/])plans?[\\/][^\\/]+\.mdx?$|(?:^|[\\/]|[-_.])plans?(?:[-_.][^\\/]*)?\.mdx?$/i;

/** A Markdown plan: docs/plans/*, plans/*, Claude Code's plan files, or a file named for a plan. */
export const isPlanFile = (file) => PLAN_PATH.test(String(file ?? ""));

/** The repository a file sits in, so a plan saved in a sibling worktree is checked against that worktree. */
export function repositoryOf(file, fallback) {
  let folder = path.dirname(path.resolve(String(file ?? "")));
  for (let step = 0; step < 40; step += 1) {
    if (fs.existsSync(path.join(folder, ".git"))) return folder;
    const parent = path.dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return fallback;
}
