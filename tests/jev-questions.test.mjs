import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SPECIALIST_MODULES } from "../src/constants.mjs";
import {
  AREAS,
  DEPTHS,
  DESIGN_KEYS,
  DOMAINS,
  LIBRARIES,
  LIBRARIES_AFTER_STUDY,
  QUESTION_SET_VERSION,
  areaKey,
  buildQuestions,
  domainKey,
  libraryKey,
} from "../src/jev/questions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUDY = path.join(os.homedir(), "dev", "jev-study-2026-10-07");
const ROUTE_CHECK = path.join(
  os.homedir(),
  "Python Projects",
  "Super-outer-Experimental",
  "super-outer-experimental",
  "skills",
  "jev-route-check",
  "scripts",
  "route-check.mjs",
);

// A copy of the frozen wording, written out here so that CI, which has
// neither the study files nor Super-outer Experimental, still checks every
// string. The tests further down compare the same questions with the source
// files when this machine has them.
const yesOrNo = (instructions, whenTrue, whenFalse) => ({ type: "noul", instructions, criteria: { true: whenTrue, false: whenFalse } });
const EXPECTED_FIXED = {
  surface_made: yesOrNo(
    "The request asks for a part of the product that its users see and use, such as a screen, page, view, form, editor, dashboard, app or website, to be created, redesigned or replaced.",
    "The writer wants that part of the product created, redesigned or replaced",
    "The writer wants something else, such as a fix, a small adjustment, a server or data change, a build or deployment step, tests, documentation or a developer tool",
  ),
  small_adjustment: yesOrNo(
    "The request asks for a small adjustment or a fix to something that already exists, such as spacing, a colour, wording, one added button or a faster query.",
    "The requested change is a small adjustment or a fix to something that already exists",
    "The requested change creates, redesigns or replaces something",
  ),
  screens_unchanged: yesOrNo(
    "The request says that what users see on screen stays as it is.",
    "The writer states that the screens, the interface or the visuals stay the same, or that the work is backend only",
    "The writer says nothing about keeping the screens the same",
  ),
  developer_artefact: yesOrNo(
    "The thing the request asks to build is used only by engineers: a build output, an API or endpoint, a database view, a script, a test, a configuration file or a monitoring dashboard.",
    "It is one of those engineering artefacts",
    "It is something people use inside the product, including screens for the product's own staff or admins, or the request builds nothing",
  ),
  code_only: yesOrNo(
    "The request changes only how the code is written, organised, formatted or built, and nothing that users see or do changes.",
    "Only the code, its structure, its formatting or its build changes",
    "Something users see or do changes",
  ),
  maintenance: yesOrNo(
    "The request asks only for tests, documentation, renaming, formatting, comments or a routine rebuild.",
    "Every part of the request is tests, documentation, renaming, formatting, comments or a routine rebuild",
    "At least one part of the request changes what the product does or how it looks",
  ),
  protected: yesOrNo(
    "The requested work touches payments, sign-in or secrets, production delivery or infrastructure, deletion or irreversible change of stored data, or git history.",
    "The work itself changes or operates on one of those things",
    "The work leaves all of those things as they are, even if one of them is mentioned",
  ),
  depth: {
    type: "choice",
    instructions: "How much review does the requested work need before it starts?",
    criteria: {
      SMALL_SAFE: "A typo, wording, formatting or documentation-only edit with no change in behaviour",
      QUICK: "A small contained change in one area with low risk, such as one rule, one endpoint or one component",
      FOCUSED: "A change in one or two areas with moderate risk or some novelty, such as a new behaviour with its own failure path",
      FULL: "A new feature, a new subsystem, an overhaul, or a change across several areas such as interface, service and stored data",
      CRITICAL:
        "A change to payments, sign-in or secrets, production delivery or infrastructure, deletion or irreversible change of stored data, or git history",
    },
  },
};
const EXPECTED_LIBRARIES = [
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
];
const EXPECTED_AREAS = [
  ["product-ui-ux-motion", "Product UI/UX and Motion", "the product's visible screens, interaction design, motion or animation"],
  ["frontend-client", "Frontend and Client Engineering", "client-side application code that runs on the person's device: web, mobile or desktop"],
  ["backend-api", "Backend and API Engineering", "server-side code: APIs, endpoints, services or business rules that run on a server"],
  ["data-migrations", "Data and Migrations", "stored data: a database schema, a migration, a backfill or a change to information already stored"],
  ["security-privacy-abuse", "Security, Privacy and Abuse", "security, privacy, sign-in, permissions, secrets or the prevention of abuse"],
  ["scale-performance-cost", "Scale, Performance and Cost", "load, latency, throughput, capacity or running cost"],
  ["reliability-recovery", "Reliability and Recovery", "failure handling, retries, backups, recovery or keeping a service available"],
  ["architecture-maintainability", "Architecture and Maintainability", "code structure, module boundaries, refactoring or long-term maintainability"],
  ["compatibility-integrations", "Compatibility and Integrations", "third-party integrations, SDKs, platform or operating system versions, or compatibility across clients"],
  ["observability-operations", "Observability and Operations", "logging, metrics, tracing, alerts or the operation of a running system"],
  ["ai-llm", "AI and LLM Systems", "a language model or AI feature: prompts, model calls, agents or the evaluation of model output"],
  ["delivery-release", "Delivery and Release", "building, packaging, versioning, releasing, deploying or installing software"],
];
const EXPECTED_DOMAINS = [
  ["mcp-ai-connectors", "a way for AI assistants such as Claude or ChatGPT to use the product, such as an MCP server, a connector or an app inside an AI assistant"],
  ["ai-coding-plugins", "a plugin, skill, hook or command for an AI coding tool such as Claude Code, Codex or Cursor"],
  ["scheduled-jobs", "work that runs on a timetable, such as scheduled posts, nightly jobs or reminders sent at set times"],
  ["habit-loops", "features that bring people back to the product, such as streaks, daily nudges or summaries of their own progress"],
];
// Revision 1 of the study builds each library question this way, and the
// domain questions are built the same way.
const builtFromSubject = (subject) =>
  yesOrNo(
    `The requested work builds or changes ${subject}.`,
    `The work builds or changes ${subject}`,
    "The work is about something else, and a word from that subject only appears in passing or with another meaning",
  );
// The route check builds each area question this way.
const builtFromArea = (subject) =>
  yesOrNo(
    `The requested work involves ${subject}.`,
    `The work changes, or directly depends on, ${subject}`,
    `The work does not touch ${subject}, even if a word from it appears`,
  );
// The key functions of the study and the route check, which replace each run
// of other characters with one underscore.
const studyKey = (prefix, id) => `${prefix}_${id.replace(/[^a-z0-9]+/g, "_")}`;

const ORDER_WITHOUT_RECORD = [
  ...DESIGN_KEYS,
  "protected",
  "depth",
  ...EXPECTED_LIBRARIES.map(([id]) => studyKey("library", id)),
];
const ORDER_WITH_RECORD = [
  ...DESIGN_KEYS,
  "maintenance",
  "protected",
  "depth",
  ...EXPECTED_LIBRARIES.map(([id]) => studyKey("library", id)),
  ...EXPECTED_AREAS.map(([id]) => studyKey("area", id)),
  ...EXPECTED_DOMAINS.map(([id]) => studyKey("domain", id)),
];

test("the question set is version 5.8.0-r1, with the five depths and the five design answers in their fixed order", () => {
  assert.equal(QUESTION_SET_VERSION, "5.8.0-r1");
  assert.deepEqual(DEPTHS, ["SMALL_SAFE", "QUICK", "FOCUSED", "FULL", "CRITICAL"]);
  assert.deepEqual(DESIGN_KEYS, ["surface_made", "small_adjustment", "screens_unchanged", "developer_artefact", "code_only"]);
});

test("without the record each call asks 24 questions: five about the design line, protected, depth and one for each of the 17 libraries", () => {
  assert.deepEqual(Object.keys(buildQuestions()), ORDER_WITHOUT_RECORD);
  assert.deepEqual(Object.keys(buildQuestions({ record: false })), ORDER_WITHOUT_RECORD);
  assert.equal(ORDER_WITHOUT_RECORD.length, 24);
});

test("with the record each call also asks maintenance, the 12 areas and the 4 domains, 41 questions in all", () => {
  assert.deepEqual(Object.keys(buildQuestions({ record: true })), ORDER_WITH_RECORD);
  assert.equal(ORDER_WITH_RECORD.length, 41);
});

test("no question from the study that 5.8.0 does not use is asked", () => {
  for (const record of [false, true]) {
    const keys = Object.keys(buildQuestions({ record }));
    for (const dropped of ["is_engineering", "change_shape", "change_shape_reversed", "for_developers"]) {
      assert.equal(keys.includes(dropped), false, `${dropped} with record ${record}`);
    }
  }
});

test("every fixed question's instructions and criteria equal the frozen wording exactly", () => {
  const questions = buildQuestions({ record: true });
  for (const [key, expected] of Object.entries(EXPECTED_FIXED)) assert.deepEqual(questions[key], expected, key);
});

test("the lists of libraries, areas and domains hold the frozen ids and subjects", () => {
  assert.deepEqual(LIBRARIES.map((pair) => [...pair]), EXPECTED_LIBRARIES);
  assert.deepEqual(AREAS.map(({ id, name, subject }) => [id, name, subject]), EXPECTED_AREAS);
  assert.deepEqual(DOMAINS.map((pair) => [...pair]), EXPECTED_DOMAINS);
});

test("every library, area and domain question is built from its subject in the frozen wording", () => {
  const questions = buildQuestions({ record: true });
  for (const [id, subject] of EXPECTED_LIBRARIES) assert.deepEqual(questions[studyKey("library", id)], builtFromSubject(subject), id);
  for (const [id, , subject] of EXPECTED_AREAS) assert.deepEqual(questions[studyKey("area", id)], builtFromArea(subject), id);
  for (const [id, subject] of EXPECTED_DOMAINS) assert.deepEqual(questions[studyKey("domain", id)], builtFromSubject(subject), id);
});

test("each key replaces every character outside a to z and 0 to 9 with an underscore, which gives the study's key for every id", () => {
  assert.equal(libraryKey("admin-support-tools"), "library_admin_support_tools");
  assert.equal(areaKey("product-ui-ux-motion"), "area_product_ui_ux_motion");
  assert.equal(domainKey("mcp-ai-connectors"), "domain_mcp_ai_connectors");
  assert.equal(libraryKey("Odd--Id"), "library__dd___d");
  for (const [id] of LIBRARIES) assert.equal(libraryKey(id), studyKey("library", id), id);
  for (const { id } of AREAS) assert.equal(areaKey(id), studyKey("area", id), id);
  for (const [id] of DOMAINS) assert.equal(domainKey(id), studyKey("domain", id), id);
});

test("every yes or no question describes both answers, and the depth question offers exactly the five depths", () => {
  for (const [key, question] of Object.entries(buildQuestions({ record: true }))) {
    if (key === "depth") {
      assert.equal(question.type, "choice");
      assert.deepEqual(Object.keys(question.criteria), [...DEPTHS]);
      continue;
    }
    assert.equal(question.type, "noul", key);
    assert.deepEqual(Object.keys(question.criteria), ["true", "false"], key);
    assert.ok(question.criteria.true.length > 10 && question.criteria.false.length > 10, key);
  }
});

test("each call returns new objects, so changing one result leaves the next call as it was", () => {
  const first = buildQuestions({ record: true });
  first.surface_made.instructions = "changed";
  first.library_retirement.criteria.true = "changed";
  delete first.depth;
  const second = buildQuestions({ record: true });
  assert.deepEqual(second.surface_made, EXPECTED_FIXED.surface_made);
  assert.deepEqual(second.depth, EXPECTED_FIXED.depth);
  assert.equal(second.library_retirement.criteria.true, "The work builds or changes switching off a feature that people use, or shutting down the whole product or app for its users");
  assert.throws(() => LIBRARIES.push(["extra", "extra"]));
  assert.throws(() => {
    AREAS[0].subject = "changed";
  });
});

test("the library ids are the ids of Super-outer's own library files, and the area ids and names are its specialists'", () => {
  const folder = path.join(ROOT, "skills", "super-outer", "references", "archetypes");
  const files = fs.readdirSync(folder).filter((name) => name.endsWith(".json"));
  const ids = files.map((name) => JSON.parse(fs.readFileSync(path.join(folder, name), "utf8")).id).sort();
  assert.deepEqual([...LIBRARIES.map(([id]) => id), ...LIBRARIES_AFTER_STUDY].sort(), ids);
  assert.deepEqual(AREAS.map(({ id, name }) => [id, name]), SPECIALIST_MODULES.map(({ id, name }) => [id, name]));
});

test("the design, maintenance and library questions equal the study's own files, when they are on this machine", async (t) => {
  const roundOneFile = path.join(STUDY, "questions.mjs");
  const revisionOneFile = path.join(STUDY, "questions-r1.mjs");
  if (!fs.existsSync(roundOneFile) || !fs.existsSync(revisionOneFile)) {
    return t.skip(`the study files are not in ${STUDY}, so only the copied wording above is checked`);
  }
  const roundOne = (await import(pathToFileURL(roundOneFile).href)).buildQuestions();
  const revisionOne = await import(pathToFileURL(revisionOneFile).href);
  const study = revisionOne.buildQuestions();
  const ours = buildQuestions({ record: true });
  for (const key of ["surface_made", "small_adjustment", "screens_unchanged", "maintenance"]) assert.deepEqual(ours[key], roundOne[key], key);
  for (const key of ["surface_made", "small_adjustment", "screens_unchanged", "developer_artefact", "code_only", "maintenance"]) {
    assert.deepEqual(ours[key], study[key], key);
  }
  assert.deepEqual(LIBRARIES.map((pair) => [...pair]), revisionOne.LIBRARIES);
  for (const [id] of revisionOne.LIBRARIES) {
    assert.equal(libraryKey(id), revisionOne.libraryKey(id), id);
    assert.deepEqual(ours[libraryKey(id)], study[revisionOne.libraryKey(id)], id);
  }
});

test("the protected, depth and area questions equal the route check's own, when Super-outer Experimental is on this machine", async (t) => {
  if (!fs.existsSync(ROUTE_CHECK)) return t.skip(`Super-outer Experimental's route-check.mjs is not at ${ROUTE_CHECK}, so only the copied wording above is checked`);
  const routeCheck = await import(pathToFileURL(ROUTE_CHECK).href);
  const theirs = routeCheck.buildQuestions([]);
  const ours = buildQuestions({ record: true });
  assert.deepEqual(ours.protected, theirs.protected);
  assert.deepEqual(ours.depth, theirs.depth);
  assert.deepEqual(DEPTHS, routeCheck.DEPTHS);
  assert.deepEqual(AREAS.map((area) => ({ ...area })), routeCheck.AREAS.map((area) => ({ ...area })));
  for (const { id } of AREAS) assert.deepEqual(ours[areaKey(id)], theirs[areaKey(id)], id);
});
