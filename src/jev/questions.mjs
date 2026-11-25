// The protected, depth and area questions are ported from Super-outer Experimental's jev-route-check (scripts/route-check.mjs); the design, maintenance and library questions come from the Jev study of 7 October 2026 (questions.mjs and questions-r1.mjs).
/**
 * The questions put to Jev on every call, frozen for 5.8.0.
 *
 * Jev reads a question literally and takes a negation at face value, so each
 * question states the thing being looked for, and each yes or no question
 * describes both answers in the words of the request. The wording is copied
 * from the study and the route check without change, because the study's
 * held-out results hold only for the wording they were measured with. Any new
 * or reworded question needs a newly frozen held-out set before its first run.
 */

export const QUESTION_SET_VERSION = "5.8.0-r1";

export const DEPTHS = Object.freeze(["SMALL_SAFE", "QUICK", "FOCUSED", "FULL", "CRITICAL"]);

/** The five answers that decide the design line, in the order they are asked. */
export const DESIGN_KEYS = Object.freeze(["surface_made", "small_adjustment", "screens_unchanged", "developer_artefact", "code_only"]);

const pairs = (list) => Object.freeze(list.map((pair) => Object.freeze(pair)));

/** Super-outer's seventeen libraries, each with the subject written for Jev in revision 1 of the study. */
export const LIBRARIES = pairs([
  ["admin-support-tools", "screens the product's own staff use to look up, help or moderate customers"],
  ["authentication", "how people sign in to the product and get back into their account"],
  ["cross-system-rollout", "a change that the app and the server must ship together"],
  ["data-migration", "changing the structure or contents of information the product has already stored"],
  ["data-rights", "people's rights over their own data in the product, such as deleting their account, exporting their data or consent"],
  ["email-deliverability", "making sure the product's emails reach inboxes, including sending domains, spam, bounces and unsubscribe links"],
  ["help-and-release-notes", "help pages, guides and release notes that the product shows its own users"],
  ["launch-surfaces", "the product's public marketing pages, pricing page, legal pages and app store listings"],
  ["llm-feature", "a product feature that calls an AI model"],
  ["mobile-capture-upload", "recording or capturing media on a phone and uploading it in the background"],
  ["new-product-setup", "starting a new product or app from nothing, including choosing its technology"],
  ["notifications-messaging", "emails, push notifications or messages the product sends to its users"],
  ["payments-subscription", "charging people money, such as payments, subscriptions, plans and refunds"],
  ["product-analytics", "measuring how people use the product, such as events, funnels and usage metrics"],
  ["retirement", "switching off a feature that people use, or shutting down the whole product or app for its users"],
  ["safe-activation", "turning on a new version for some people first, or running the old and new versions side by side"],
  ["teams-and-roles", "teams inside the product, such as inviting members, workspaces, roles and permissions"],
]);

/**
 * Libraries added after the 5.8.0-r1 study. Jev is not asked about them until a
 * new study revision measures the question; the hook finds them from the words
 * and from the work under way instead.
 */
export const LIBRARIES_AFTER_STUDY = Object.freeze(["ai-agent-product"]);

/** Super-outer's twelve specialist areas, with the subjects the route check wrote for Jev. */
export const AREAS = Object.freeze(
  [
    { id: "product-ui-ux-motion", name: "Product UI/UX and Motion", subject: "the product's visible screens, interaction design, motion or animation" },
    { id: "frontend-client", name: "Frontend and Client Engineering", subject: "client-side application code that runs on the person's device: web, mobile or desktop" },
    { id: "backend-api", name: "Backend and API Engineering", subject: "server-side code: APIs, endpoints, services or business rules that run on a server" },
    { id: "data-migrations", name: "Data and Migrations", subject: "stored data: a database schema, a migration, a backfill or a change to information already stored" },
    { id: "security-privacy-abuse", name: "Security, Privacy and Abuse", subject: "security, privacy, sign-in, permissions, secrets or the prevention of abuse" },
    { id: "scale-performance-cost", name: "Scale, Performance and Cost", subject: "load, latency, throughput, capacity or running cost" },
    { id: "reliability-recovery", name: "Reliability and Recovery", subject: "failure handling, retries, backups, recovery or keeping a service available" },
    { id: "architecture-maintainability", name: "Architecture and Maintainability", subject: "code structure, module boundaries, refactoring or long-term maintainability" },
    { id: "compatibility-integrations", name: "Compatibility and Integrations", subject: "third-party integrations, SDKs, platform or operating system versions, or compatibility across clients" },
    { id: "observability-operations", name: "Observability and Operations", subject: "logging, metrics, tracing, alerts or the operation of a running system" },
    { id: "ai-llm", name: "AI and LLM Systems", subject: "a language model or AI feature: prompts, model calls, agents or the evaluation of model output" },
    { id: "delivery-release", name: "Delivery and Release", subject: "building, packaging, versioning, releasing, deploying or installing software" },
  ].map((area) => Object.freeze(area)),
);

/**
 * The four candidate domains the owner named on 7 October 2026, which have no
 * library yet. Jev's answers about them are kept in the private record and
 * counted, so that the next libraries come from real work.
 */
export const DOMAINS = pairs([
  ["mcp-ai-connectors", "a way for AI assistants such as Claude or ChatGPT to use the product, such as an MCP server, a connector or an app inside an AI assistant"],
  ["ai-coding-plugins", "a plugin, skill, hook or command for an AI coding tool such as Claude Code, Codex or Cursor"],
  ["scheduled-jobs", "work that runs on a timetable, such as scheduled posts, nightly jobs or reminders sent at set times"],
  ["habit-loops", "features that bring people back to the product, such as streaks, daily nudges or summaries of their own progress"],
]);

// Every character outside a to z and 0 to 9 becomes an underscore. For every
// id above this gives the same key as the study's and the route check's own
// key functions.
const keyFor = (prefix) => (id) => `${prefix}_${String(id).replace(/[^a-z0-9]/g, "_")}`;
export const libraryKey = keyFor("library");
export const areaKey = keyFor("area");
export const domainKey = keyFor("domain");

const noul = (instructions, whenTrue, whenFalse) => ({
  type: "noul",
  instructions,
  criteria: { true: whenTrue, false: whenFalse },
});

// Round one of the study, kept unchanged in revision 1.
const surfaceMade = () =>
  noul(
    "The request asks for a part of the product that its users see and use, such as a screen, page, view, form, editor, dashboard, app or website, to be created, redesigned or replaced.",
    "The writer wants that part of the product created, redesigned or replaced",
    "The writer wants something else, such as a fix, a small adjustment, a server or data change, a build or deployment step, tests, documentation or a developer tool",
  );
const smallAdjustment = () =>
  noul(
    "The request asks for a small adjustment or a fix to something that already exists, such as spacing, a colour, wording, one added button or a faster query.",
    "The requested change is a small adjustment or a fix to something that already exists",
    "The requested change creates, redesigns or replaces something",
  );
const screensUnchanged = () =>
  noul(
    "The request says that what users see on screen stays as it is.",
    "The writer states that the screens, the interface or the visuals stay the same, or that the work is backend only",
    "The writer says nothing about keeping the screens the same",
  );
const maintenance = () =>
  noul(
    "The request asks only for tests, documentation, renaming, formatting, comments or a routine rebuild.",
    "Every part of the request is tests, documentation, renaming, formatting, comments or a routine rebuild",
    "At least one part of the request changes what the product does or how it looks",
  );

// Revision 1 of the study.
const developerArtefact = () =>
  noul(
    "The thing the request asks to build is used only by engineers: a build output, an API or endpoint, a database view, a script, a test, a configuration file or a monitoring dashboard.",
    "It is one of those engineering artefacts",
    "It is something people use inside the product, including screens for the product's own staff or admins, or the request builds nothing",
  );
const codeOnly = () =>
  noul(
    "The request changes only how the code is written, organised, formatted or built, and nothing that users see or do changes.",
    "Only the code, its structure, its formatting or its build changes",
    "Something users see or do changes",
  );
const subjectOfWork = (subject) =>
  noul(
    `The requested work builds or changes ${subject}.`,
    `The work builds or changes ${subject}`,
    "The work is about something else, and a word from that subject only appears in passing or with another meaning",
  );

// The route check.
const protectedBoundary = () =>
  noul(
    "The requested work touches payments, sign-in or secrets, production delivery or infrastructure, deletion or irreversible change of stored data, or git history.",
    "The work itself changes or operates on one of those things",
    "The work leaves all of those things as they are, even if one of them is mentioned",
  );
const depth = () => ({
  type: "choice",
  instructions: "How much review does the requested work need before it starts?",
  criteria: {
    SMALL_SAFE: "A typo, wording, formatting or documentation-only edit with no change in behaviour",
    QUICK: "A small contained change in one area with low risk, such as one rule, one endpoint or one component",
    FOCUSED:
      "A change in one or two areas with moderate risk or some novelty, such as a new behaviour with its own failure path",
    FULL: "A new feature, a new subsystem, an overhaul, or a change across several areas such as interface, service and stored data",
    CRITICAL:
      "A change to payments, sign-in or secrets, production delivery or infrastructure, deletion or irreversible change of stored data, or git history",
  },
});
const areaInvolved = (subject) =>
  noul(
    `The requested work involves ${subject}.`,
    `The work changes, or directly depends on, ${subject}`,
    `The work does not touch ${subject}, even if a word from it appears`,
  );

/**
 * Every call asks the five design questions, the protected-boundary question,
 * the depth question and one question for each library. With the record
 * switched on it also asks the maintenance question, one question for each
 * specialist area and one for each candidate domain; those answers are only
 * recorded and change nothing in the route. The order is fixed, and each call
 * returns new objects.
 */
export function buildQuestions({ record = false } = {}) {
  const questions = {
    surface_made: surfaceMade(),
    small_adjustment: smallAdjustment(),
    screens_unchanged: screensUnchanged(),
    developer_artefact: developerArtefact(),
    code_only: codeOnly(),
  };
  if (record) questions.maintenance = maintenance();
  questions.protected = protectedBoundary();
  questions.depth = depth();
  for (const [id, subject] of LIBRARIES) questions[libraryKey(id)] = subjectOfWork(subject);
  if (record) {
    for (const { id, subject } of AREAS) questions[areaKey(id)] = areaInvolved(subject);
    for (const [id, subject] of DOMAINS) questions[domainKey(id)] = subjectOfWork(subject);
  }
  return questions;
}

/**
 * Question set 6.5.0-r3 keeps every 6.0.0-r2 question unchanged and adds two
 * kinds, scope_change and owner_correction, asked about a message typed while
 * work is under way (docs/plans/super-outer-v6.5-frontier-engineering.md,
 * section 5). Both are recorded only.
 *
 * Question set 6.0.0-r2: closed decisions for 6.0 (plan sections 11 and 12).
 * Every answer is recorded only and compared with the local answer; the local
 * answer decides until agreement is measured on real prompts. The one
 * exception is diagram-kinds (added in r2), where a confident Jev answer
 * decides from the start, because a wrong pick costs only a redraw. The state sent
 * is the typed request or a one-line activity summary, never code, file
 * contents or keys.
 */
export const V6_QUESTION_SET_VERSION = "6.5.0-r3";
export const V6_KINDS = Object.freeze(["dimensions", "agents", "suggestion_real", "sweep_order", "diagram-kinds", "scope_change", "owner_correction"]);
export const V6_DIAGRAM_KINDS = Object.freeze(["architecture", "pipeline", "code-flow", "one-problem"]);
export const diagramKey = (kind) => `v6_diagram_${kind.replace(/-/g, "_")}`;
export const V6_DIMENSIONS = Object.freeze([...AREAS.map(({ id }) => id), "run-operate"]);
export const v6Key = keyFor("v6");

const RUN_OPERATE_SUBJECT = "running a live service: model deprecations, secret age, backups and restore drills, cost alarms or incident handling";
const subjectOf = (id) => AREAS.find((area) => area.id === id)?.subject ?? RUN_OPERATE_SUBJECT;

const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });

export function buildV6Questions(kind) {
  if (kind === "dimensions") {
    const questions = {};
    for (const id of V6_DIMENSIONS) questions[v6Key(`dim_${id}`)] = areaInvolved(subjectOf(id));
    return questions;
  }
  if (kind === "agents") {
    return {
      v6_agent_count: choice("How many helper agents does the requested work need?", {
        NONE: "None: one small contained change",
        TWO: "One or two read-only scouts to look things up",
        FOUR: "Scouts and a few builders working on separate files",
        SIX: "Scouts, builders and reviewers, the most allowed",
      }),
      v6_reviewer_model: choice("Which model should review the finished work?", {
        sonnet: "Ordinary risk: a mistake is cheap to correct",
        opus: "High risk: payments, sign-in, secrets, stored data or production",
      }),
    };
  }
  if (kind === "suggestion_real") {
    return {
      v6_suggestion_real: noul(
        "The activity described is manual work that an existing service or tool already does, such as monitoring, scheduling, queues, retries or logging.",
        "The activity repeats by hand what such a service does",
        "The activity is ordinary one-off work, such as a single check or a normal edit",
      ),
    };
  }
  if (kind === "diagram-kinds") {
    const when = {
      architecture: ["The work sets up a product or changes its parts: a service, store, outside service or model added, removed or renamed", "The parts of the product and how they connect stay the same"],
      pipeline: ["The work adds an AI or data process, or changes its stages", "No AI or data process gains, loses or changes a stage"],
      "code-flow": ["The work adds or changes an endpoint or backend flow that a developer will maintain", "No endpoint or backend flow that a developer maintains is added or changed"],
      "one-problem": ["The person asked for a diagram of one problem or of why a change took several attempts", "Nobody asked for a diagram of one problem"],
    };
    return Object.fromEntries(V6_DIAGRAM_KINDS.map((id) => [diagramKey(id), noul(`Which diagrams does this work need? This question is about the ${id} diagram.`, ...when[id])]));
  }
  if (kind === "scope_change") {
    return {
      v6_scope_change: noul(
        "The message was sent while a product is being built, and it adds to or changes what the product is: who it serves, what it can do, which devices or file formats it handles, what it connects to, or which named tool or service it uses.",
        "The writer asks for something beyond what was being built, or names a different audience, device, format, tool or service",
        "The writer comments on, corrects, answers or approves the work already under way without widening it",
      ),
    };
  }
  if (kind === "owner_correction") {
    return {
      v6_owner_correction: noul(
        "The message tells an assistant that something it just did or said was wrong, unwanted or not what was asked for.",
        "The writer is correcting or objecting to what the assistant did or said",
        "The writer gives a new instruction, answers a question or approves, without saying the assistant got something wrong",
      ),
    };
  }
  if (kind === "sweep_order") {
    return {
      v6_sweep_first: choice(
        "Which area should a milestone review cover first?",
        Object.fromEntries(V6_DIMENSIONS.map((id) => [id, `The work most needs review of ${subjectOf(id)}`])),
      ),
    };
  }
  return {};
}

/**
 * Question set 6.1.0-r1: a closed question that another plugin asks through
 * `super-outer jev ask`. The plugin names a kind and two to eight options,
 * all short slugs, and sends the typed request. Each option gets one
 * yes-or-no question, so a confident answer is one option read at 0.8 or
 * more while every other option reads at 0.2 or less.
 */
export const ASK_QUESTION_SET_VERSION = "6.1.0-r1";
export const ASK_SLUG = /^[a-z0-9-]{1,40}$/;
export const ASK_OPTIONS = Object.freeze({ minimum: 2, maximum: 8 });
export const askKey = (option) => `ask_${option.replace(/-/g, "_")}`;

export function buildAskQuestions(kind, options) {
  const label = (slug) => slug.replace(/-/g, " ");
  return Object.fromEntries(options.map((option) => [askKey(option), noul(
    `The request asks for a ${label(kind)}. This question is about one possible ${label(kind)}: ${label(option)}.`,
    `The best ${label(kind)} for this request is ${label(option)}`,
    `Another ${label(kind)} fits this request better than ${label(option)}`,
  )]));
}
