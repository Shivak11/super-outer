import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { typedText } from "../src/host-blocks.mjs";
import { inventory, summarise } from "../src/inventory.mjs";
import { combineRoute, decideV6 } from "../src/jev/combine.mjs";
import { askV6, MID_BUILD_CHARACTERS, midBuildSummary } from "../src/jev/judge.mjs";
import { buildV6Questions, V6_KINDS } from "../src/jev/questions.mjs";
import { readV6Answer } from "../src/jev/reading.mjs";
import { checkLessonFiles, checkLessons, KIT_LESSONS, LIMIT, parseLessons } from "../src/lessons.mjs";
import { namesPrototype, routeTask } from "../src/router.mjs";
import { AFTER_RELEASE_PATH, dueLooks, LOOK_EXPIRY_DAYS, sessionStartLine } from "../src/session-start.mjs";
import { readsAsCorrection } from "../src/work-under-way.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

// 6.5: learning from mistakes, a finish line for all work, the experiment
// track, standing answers and the look after release
// (docs/plans/super-outer-v6.5-frontier-engineering.md).

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const CLI = path.resolve("bin/super-outer.mjs");
const temp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const write = (root, file, text) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};

// ---------------------------------------------------------------- lessons

const LESSON = `## Tokens in request URLs

- Learned: 22 October 2026, Personal Agent.
- Trigger: a project calls an API that puts a secret in the URL
  and someone proposes request tracing.
- What goes wrong: the trace stores the secret.
- What to do: redact the URL before tracing is switched on.
`;

test("a lesson is read with its continuation lines", () => {
  const [lesson] = parseLessons(`# Lessons\n\n${LESSON}`);
  assert.equal(lesson.heading, "Tokens in request URLs");
  assert.equal(lesson.fields.Trigger, "a project calls an API that puts a secret in the URL and someone proposes request tracing.");
  assert.deepEqual(checkLessons(LESSON), { count: 1, over_limit: false, malformed: [], duplicates: [], retirable: [] });
});

test("a lesson missing a line, a repeated trigger and a retire line are each listed", () => {
  const text = [
    LESSON,
    "## No action\n\n- Learned: 1 November 2026, X.\n- Trigger: something else happens\n- What goes wrong: it breaks.\n",
    LESSON.replace("Tokens in request URLs", "The same trigger again"),
    "## A workaround\n\n- Learned: 2 November 2026, X.\n- Trigger: a hidden pane\n- What goes wrong: animations stall.\n- What to do: check the pane.\n- Assumption: panes pause when hidden.\n",
    "## A retirable workaround\n\n- Learned: 2 November 2026, X.\n- Trigger: a slow server\n- What goes wrong: stale file.\n- What to do: fetch it again.\n- Assumption: the server lags.\n- Retire when: the served file matches the disk.\n",
  ].join("\n");
  const result = checkLessons(text);
  assert.equal(result.count, 5);
  assert.deepEqual(result.malformed.map((item) => [item.heading, item.missing]), [["No action", ["What to do"]], ["A workaround", ["Retire when"]]]);
  assert.deepEqual(result.duplicates.map((item) => [item.heading, item.on]), [["The same trigger again", "trigger"]]);
  assert.deepEqual(result.retirable.map((item) => item.heading), ["A retirable workaround"]);
});

test("a heading inside a code fence is not a lesson, and a long file is flagged", () => {
  assert.equal(parseLessons("```markdown\n## <heading>\n```\n").length, 0);
  const many = Array.from({ length: LIMIT + 1 }, (_, i) => LESSON.replace("Tokens in request URLs", `Lesson ${i}`).replace("puts a secret", `puts secret ${i}`)).join("\n");
  assert.equal(checkLessons(many).over_limit, true);
});

test("lessons titled in another script are not read as one, and a very long field is read in linear time", () => {
  const hindi = (title, trigger) => `## ${title}\n\n- Learned: 1 November 2026, X.\n- Trigger: ${trigger}\n- What goes wrong: it breaks.\n- What to do: check it.\n`;
  assert.deepEqual(checkLessons(`${hindi("भुगतान दो बार", "एक ही अनुरोध दो बार आता है")}\n${hindi("लॉगिन विफल", "पासवर्ड बदलने के बाद")}`).duplicates, []);
  const long = `## Long\n\n- Learned: today.\n- Trigger: t\n${"  more words on a continuation line\n".repeat(12000)}- What goes wrong: w\n- What to do: d\n`;
  const started = performance.now();
  assert.equal(checkLessons(long).malformed.length, 0);
  assert.ok(performance.now() - started < 2000, "a 400 KB field took too long");
});

test("the kit's own lessons follow the shape", () => {
  const result = checkLessons(fs.readFileSync(KIT_LESSONS, "utf8"));
  assert.ok(result.count >= 6);
  assert.deepEqual(result.malformed, []);
  assert.deepEqual(result.duplicates, []);
});

test("lessons check reads the project's file and exits 1 on a malformed lesson", () => {
  const root = temp("so-lessons-");
  const run = () => spawnSync(process.execPath, [CLI, "lessons", "check", root], { encoding: "utf8", env: isolatedEnv() });
  let out = run();
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).files.find((file) => file.scope === "project").present, false);
  write(root, ".engineering/super-outer/lessons.md", "## Broken\n\n- Learned: today.\n");
  out = run();
  assert.equal(out.status, 1);
  const result = JSON.parse(out.stdout);
  assert.equal(result.valid, false);
  assert.match(result.summary, /1 missing a line/);
  assert.equal(checkLessonFiles(root).files[1].malformed[0].heading, "Broken");
});

// ---------------------------------------------------------------- inventory

test("a bare runnable project lists every readiness gap, and the summary names them", () => {
  const root = temp("so-ready-");
  write(root, "package.json", JSON.stringify({ name: "bare", scripts: { start: "node index.js" } }));
  write(root, "index.js", "console.log(1);\n");
  const result = inventory(root);
  assert.deepEqual(result.readiness.gaps.map((gap) => gap.id), ["conventions", "test-command", "setup-command", "secret-scan", "review-on-pull-requests"]);
  assert.match(summarise(result), /Readiness gaps: no conventions file/);
  assert.match(summarise(result), /Standing answers: none; project lessons: none/);
});

test("a prepared project has no readiness gap and names its standing answers and lessons", () => {
  const root = temp("so-ready-");
  write(root, "package.json", JSON.stringify({ name: "ready", scripts: { test: "node --test", setup: "node scripts/setup.mjs" } }));
  write(root, "index.js", "console.log(1);\n");
  write(root, "AGENTS.md", "# Conventions\n");
  write(root, ".gitleaks.toml", "title = 'scan'\n");
  write(root, ".github/workflows/review.yml", "name: review\non:\n  pull_request:\njobs:\n  review:\n    steps:\n      - run: echo code review\n");
  write(root, ".engineering/super-outer/standing-answers.md", "# Standing answers\n");
  write(root, ".engineering/super-outer/lessons.md", "# Lessons\n");
  const result = inventory(root);
  assert.deepEqual(result.readiness.gaps, []);
  assert.equal(result.standingAnswers, ".engineering/super-outer/standing-answers.md");
  assert.equal(result.lessons, ".engineering/super-outer/lessons.md");
  assert.match(summarise(result), /Readiness gaps: none found/);
});

test("a workflow that only runs on push, or only says reviewed in a comment, is not a pull request review", () => {
  const root = temp("so-ready-");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, ".github/workflows/docs.yml", "on:\n  push:\njobs:\n  a:\n    steps:\n      - uses: some/code-review@v1\n");
  write(root, ".github/workflows/ci.yml", "on:\n  pull_request:\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4 # reviewed 2026-10-01\n");
  assert.ok(inventory(root).readiness.gaps.some((gap) => gap.id === "review-on-pull-requests"));
});

test("a large workflow file of blank lines is read in linear time", () => {
  const root = temp("so-ready-");
  write(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  write(root, ".github/workflows/big.yml", `${"\n".repeat(250000)}on:\n  push:\n`);
  const started = performance.now();
  inventory(root);
  assert.ok(performance.now() - started < 3000, "the pull request pattern took too long");
});

test("a folder of prose has no readiness gaps", () => {
  const root = temp("so-ready-");
  write(root, "chapter.md", "# Chapter\n");
  assert.deepEqual(inventory(root).readiness.gaps, []);
});

// ---------------------------------------------------------------- after release

const NOW = new Date("2026-11-12T09:00:00Z");
const released = (entries) => {
  const root = temp("so-after-");
  fs.mkdirSync(path.join(root, ".git"));
  write(root, AFTER_RELEASE_PATH, JSON.stringify({ entries }));
  return root;
};

test("a released change whose first date has passed is due one look", () => {
  const root = released([{ id: "refunds", what: "SECRET-TITLE refunds page", due: ["2026-11-11", "2026-11-17"], looks: [] }]);
  assert.equal(dueLooks(root, NOW), 1);
  const line = sessionStartLine(root, { now: NOW });
  assert.match(line, /one released change is due a look at the live product/);
  assert.match(line, /completion-contract\.md/);
  assert.doesNotMatch(line, /SECRET-TITLE/, "the line never quotes the record");
});

test("a recorded look clears the line until the second date passes", () => {
  const entry = { id: "refunds", due: ["2026-11-11", "2026-11-17"], looks: [{ at: "2026-11-11", finding: "no errors" }] };
  assert.equal(sessionStartLine(released([entry]), { now: NOW }), null);
  assert.equal(dueLooks(released([entry]), new Date("2026-11-18T09:00:00Z")), 1);
});

test("a record that is not a regular file is never opened, and an old missed look stops being named", () => {
  const root = temp("so-after-");
  fs.mkdirSync(path.join(root, ".engineering/super-outer"), { recursive: true });
  execFileSync("mkfifo", [path.join(root, AFTER_RELEASE_PATH)]);
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { dueLooks } from ${JSON.stringify(path.resolve("src/session-start.mjs"))}; console.log(dueLooks(${JSON.stringify(root)}, new Date()));`,
  ], { encoding: "utf8", timeout: 5000 });
  assert.equal(probe.status, 0, "reading a pipe would hang until the timeout");
  assert.equal(probe.stdout.trim(), "0");
  const old = released([{ id: "a", due: ["2024-01-05"], looks: [] }]);
  assert.equal(dueLooks(old, new Date(Date.parse("2024-01-05") + (LOOK_EXPIRY_DAYS - 1) * 86400000)), 1);
  assert.equal(dueLooks(old, NOW), 0);
});

test("an old metrics snapshot does not hide a look that is due", () => {
  const root = released([{ id: "a", due: ["2026-11-11"], looks: [] }]);
  write(root, ".engineering/super-outer/ledger.json", JSON.stringify({ entries: [{ id: "queue", prompt: "Move sends to a queue", status: "DEFERRED", revisitWhen: [], measuredWhen: [{ metric: "daily_users", comparison: ">=", threshold: 100, ladder: "100" }] }] }));
  write(root, ".engineering/super-outer/metrics.json", JSON.stringify({ measured_at: "2026-09-01", metrics: { daily_users: 3 } }));
  assert.match(sessionStartLine(root, { now: NOW }), /due a look at the live product/);
  write(root, ".engineering/super-outer/metrics.json", JSON.stringify({ measured_at: "2026-11-10", metrics: { daily_users: 140 } }));
  assert.match(sessionStartLine(root, { now: NOW }), /measured trigger fired/);
});

test("a look due comes before the tool check, and a broken record gives no line", () => {
  const root = released([{ id: "a", due: ["2026-11-01"] }, { id: "b", due: ["2026-11-02"] }]);
  write(root, "package.json", JSON.stringify({ dependencies: { expo: "~54.0.12" } }));
  assert.match(sessionStartLine(root, { now: NOW }), /2 released changes are due a look/);
  const broken = temp("so-after-");
  write(broken, AFTER_RELEASE_PATH, "{ not json");
  assert.equal(dueLooks(broken, NOW), 0);
  assert.equal(dueLooks(released("nope"), NOW), 0);
  assert.equal(dueLooks(released([{ due: "2026-11-01" }, null, { due: ["not a date"] }]), NOW), 0);
});

// ---------------------------------------------------------------- corrections

test("the owner's corrections read as corrections", () => {
  for (const text of [
    "I just asked you...didn't ask you to put it",
    "that's wrong, you missed the second file",
    "no, that is not what I meant",
    "why did you delete the tests",
    "I told you before not to commit on main",
    "you forgot the Cursor copy",
    "still not working",
    "stop adding disclaimers",
  ]) assert.equal(readsAsCorrection(text), true, text);
});

test("ordinary instructions and approvals do not read as corrections", () => {
  for (const text of [
    "yes go ahead",
    "add a button to the settings page",
    "can you check whether the upload works on phones",
    "merge and install for all hosts",
    "what did the test say",
    "I asked my manager for the sales report format and she sent this",
    "",
  ]) assert.equal(readsAsCorrection(text), false, text);
});

// ---------------------------------------------------------------- Jev

test("the two 6.5 questions are recorded only and never decide", () => {
  for (const kind of ["scope_change", "owner_correction"]) {
    assert.ok(V6_KINDS.includes(kind));
    const questions = buildV6Questions(kind);
    assert.deepEqual(Object.keys(questions), [`v6_${kind}`]);
    assert.equal(questions[`v6_${kind}`].type, "noul");
    const reading = readV6Answer(kind, { [`v6_${kind}`]: { noul: 0.9 } });
    assert.deepEqual(reading, { yes: 0.9 });
    assert.equal(readV6Answer(kind, { [`v6_${kind}`]: { noul: 3 } }), null);
    const decided = decideV6({ kind, local: false, reading });
    assert.equal(decided.decided, false, "the word list decides");
    assert.equal(decided.recordedOnly, true);
    assert.equal(decided.jev, true);
    assert.equal(decided.agrees, false);
    assert.equal(decideV6({ kind, local: true, reading }).agrees, true);
  }
});

test("askV6 keeps the local answer with Jev off, and makes no call when the record is off", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("no network in tests"); };
  try {
    const off = await askV6({ kind: "scope_change", summary: "i'd also like epubs", local: true, env: { SUPER_OUTER_JEV: "off" } });
    assert.equal(off.decided, true);
    assert.equal(off.status, "skipped");
    const config = temp("so-jev-config-");
    const noRecord = await askV6({
      kind: "owner_correction", summary: "that is wrong", local: true, onlyWhenRecorded: true,
      env: { SUPER_OUTER_JEV: "on", SUPER_OUTER_JEV_RECORD: "off", SUPER_OUTER_OPENROUTER_KEY: "sk-or-v1-test-key-not-real-000000000000", SUPER_OUTER_CONFIG_DIR: config, SUPER_OUTER_DATA_DIR: config },
    });
    assert.equal(noRecord.decided, true);
    assert.equal(noRecord.status, "skipped");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------- the experiment track

test("a request to make a prototype carries the signal and keeps the route it earned", () => {
  for (const description of [
    "build a quick prototype of the onboarding screen",
    "as an experiment, add a leaderboard to the dashboard",
    "this is just a spike: try llama parse on three pdfs",
    "prototype this with a new recommendations feed and a redesigned home screen",
    "write some throwaway code to compare the two parsers",
  ]) assert.ok(routeTask({ description }).signals.includes("prototype"), description);
  // The signal never lowers a route: the same product routes the same with and without the word.
  const product = "a new app from scratch: a flashcards product with spaced repetition for students, with a teacher dashboard";
  const plain = routeTask({ description: `build ${product}` });
  const called = routeTask({ description: `build a quick prototype of ${product}` });
  assert.notEqual(plain.mode, "QUICK");
  assert.equal(called.mode, plain.mode);
  assert.deepEqual(called.selected_modules, plain.selected_modules);
  assert.deepEqual(called.archetypes.map(({ id }) => id), plain.archetypes.map(({ id }) => id));
  assert.equal(called.question_budget, plain.question_budget);
  assert.deepEqual(called.change_shape, plain.change_shape);
  assert.deepEqual(called.scores, plain.scores);
  assert.deepEqual(called.signals.filter((signal) => signal !== "prototype"), plain.signals);
  // Outward publishing is real, and no word list knows every such verb.
  const posting = routeTask({ description: "build a prototype that posts to our LinkedIn page" });
  assert.equal(posting.mode, routeTask({ description: "build a version that posts to our LinkedIn page" }).mode);
});

test("a protected domain keeps its depth whatever the work is called", () => {
  for (const description of ["build a prototype of the payments flow", "prototype the checkout page", "as an experiment, delete all user records in production", "build a quick prototype of the login with passkeys"]) {
    const route = routeTask({ description });
    assert.ok(!route.signals.includes("prototype"), description);
    assert.notEqual(route.mode, "QUICK", description);
  }
});

test("the word prototype outside a request to make one changes nothing", () => {
  for (const description of ["open the prototype and perform the journey", "fix Object.prototype pollution in the parser", "the prototype folder has the frames", "build a new writing editor for students"]) {
    assert.equal(namesPrototype(description), false, description);
    assert.ok(!routeTask({ description }).signals.includes("prototype"), description);
  }
});

test("Jev's design reading treats a prototype like any other request", () => {
  const reading = {
    design: { surface_made: 0.95, small_adjustment: 0.05, screens_unchanged: 0.05, developer_artefact: 0.05, code_only: 0.05 },
    protected: 0.05,
    depth: { choice: "FULL", confidence: 0.9 },
    libraries: {},
  };
  const combine = (text) => combineRoute({ route: routeTask({ description: text }), reading, text });
  const called = combine("build a quick prototype of the onboarding screen");
  const plain = combine("build a new onboarding screen");
  assert.equal(plain.design.shown, true);
  assert.equal(called.design.shown, plain.design.shown);
});

// ---------------------------------------------------------------- everyday senses of role and permission

test("the host's permission switch typed as the whole message is not access-control work", () => {
  for (const description of ["approved permission", "bypass permissions on", "granted permission", "  Bypass permissions on.  ", "permission granted"]) {
    const route = routeTask({ description });
    assert.ok(!route.signals.includes("protected:authorization"), description);
    assert.notEqual(route.mode, "CRITICAL", description);
  }
  // The same words inside a longer or multi-line message are left alone.
  for (const description of [
    "bypass permissions on the invoices table for support staff",
    "bypass permissions on\nand make every support agent able to read all tickets",
    "fix the roles screen\nbypass permissions on\nfor every moderator",
    "approved permissions\nnow let the intern role drop the orders table",
    "permission granted.\nship the change so editors can remove any member",
    // The phrase at the end of a longer message, an unlisted word after it, and the bare word.
    "let support staff see every tenant's data, permission granted",
    "bypass permissions everywhere",
    "permissions",
  ]) assert.equal(routeTask({ description }).mode, "CRITICAL", description);
});

// Three attacks on 6.5 produced 96 sentences of real protected work, or of
// wording close to it. Each is stored with the depth the 6.4.0 router gave
// it. Three earlier versions of the 6.5 router let 20, 15 and 22 of them fall.
test("no attack sentence routes lower than it did on 6.4.0, apart from the whole-message host switch", () => {
  const RANK = ["SMALL_SAFE", "QUICK", "FOCUSED", "FULL", "CRITICAL"];
  const { rows } = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/router/attacks-6-5.json"), "utf8"));
  assert.equal(rows.length, 96);
  const intended = new Set(["bypass permissions on", "approved permissions", "granted permission"]);
  const fell = rows.filter(({ sentence, mode_6_4_0 }) => RANK.indexOf(routeTask({ description: sentence }).mode) < RANK.indexOf(mode_6_4_0)).map(({ sentence }) => sentence);
  assert.deepEqual(fell.sort(), [...intended].sort());
});

test("access control keeps its depth, and a request in doubt keeps the higher care", () => {
  for (const description of [
    "add roles and permissions to the admin panel",
    "the admin role should be able to delete users",
    "change user roles so editors can publish",
    "grant permission to editors to publish drafts",
    "the app keeps asking for permission to read contacts",
    "handle role changes for team members",
    "add role-based access to the reports",
    "clean up that vault and configure TOTP, I am giving write permissions to you",
  ]) assert.equal(routeTask({ description }).mode, "CRITICAL", description);
});

test("the host's note about side sessions is not routed as a typed request", () => {
  const event = "<side-sessions-event>None of the sessions you started is working now; their notes are above. Billing fix: done.</side-sessions-event>";
  assert.equal(typedText(event).trim(), "");
  assert.equal(typedText(`carry on with the export ${event}`).trim(), "carry on with the export");
});

// The review of 6.5 found each sentence below routed lower than on 6.4.0 by the
// first version of this change. They are real access-control or production
// work, and they keep their depth whatever else changes.
test("real access-control work phrased with a job word or a host word keeps its depth", () => {
  for (const description of [
    "add a manager role that can delete users",
    "senior roles get delete access to customer records",
    "let the consultant role view patient records",
    "the hr role should see salary data",
    "skip permission checks for superusers on the delete endpoint",
    "bypass permissions check in the API",
    "bypass permissions on the admin endpoint",
    "fix permission denied when a non-owner edits another tenant's document",
    "approve permissions for a team member to delete projects",
    "positions and roles decide who can approve payouts",
    "sales roles should not see other regions",
    "management roles can export all data",
    "permission prompts in the app should ask before sharing location",
    "waiting for permission from the admin before a user can join a team",
    // A second attack, on a version that kept job phrases behind a list of
    // access words. None of these holds a word from that list.
    "the sales role must not open the pricing settings",
    "senior roles can publish without review",
    "the manager role gets the settings page",
    "the hr role can change payroll",
    "add a management role with the power to remove accounts",
    "junior roles are read-only everywhere",
    "the analyst role can run reports on everything",
    "create a marketing role that can send campaigns",
    "the manager role can promote others to manager",
    "add a senior role above editor",
    "permission mode for editors should be stricter",
    "waiting for permission to publish should lock the post",
    "make a manager role",
    "positions and roles screen for assigning rights",
    "you score highest on people roles, is this directly from the database",
  ]) {
    const route = routeTask({ description });
    assert.equal(route.mode, "CRITICAL", description);
    assert.ok(route.signals.includes("protected:authorization"), description);
  }
});

test("work on production, real people or real money is never an experiment, and neither is a product named with the word", () => {
  for (const description of [
    "build a prototype that deletes all rows in production",
    "this is just a prototype, deploy it to production",
    "build a quick prototype that charges real cards through Stripe",
    "run an experiment that sends push notifications to all real users",
    "create an experiment framework with sticky bucketing for the pricing page",
    "build a spike detector for the latency dashboard and page the on-call",
    "as an experiment, migrate the users table to the new schema",
    "build a quick prototype that emails every customer",
  ]) {
    assert.equal(namesPrototype(description), false, description);
    assert.ok(!routeTask({ description }).signals.includes("prototype"), description);
  }
  // The depths these had on 6.4.0, which the first version lowered to QUICK.
  assert.equal(routeTask({ description: "build a prototype that deletes all rows in production" }).mode, "FOCUSED");
  assert.equal(routeTask({ description: "build a quick prototype that charges real cards through Stripe" }).mode, "FULL");
  assert.equal(routeTask({ description: "create an experiment framework with sticky bucketing for the pricing page" }).mode, "FULL");
});

// ---------------------------------------------------------------- what the recorded readings may send

test("a recorded reading sends a short remark and nothing the route reading refuses", () => {
  assert.equal(midBuildSummary("  i'd also like   epubs,\nincluding on phones  "), "i'd also like epubs, including on phones");
  const secret = ["sk", "-proj-", "abcdefghijklmnopqrstuvwxyz0123456789ABCD"].join("");
  for (const [name, typed] of [
    ["a paste", `use this page: ${"word ".repeat(200)}`],
    ["machine text", '{"event":"push","repository":"demo","commits":[{"id":"abc"}]}'],
    ["a slash command", "/model opus and then carry on"],
    ["a secret past the cut", `${"please keep going with the export work ".repeat(6)} ${secret}`],
    ["a secret across the cut", `${"x".repeat(190)} ${secret}`],
    ["too short", "ok"],
    ["not text", 42],
  ]) assert.equal(midBuildSummary(typed), null, name);
  const longest = midBuildSummary(`also add ${"a ".repeat(MID_BUILD_CHARACTERS / 2 - 20)} too`);
  assert.ok(typeof longest === "string" && longest.length <= 200);
});

// ---------------------------------------------------------------- the prompt hook

const project = () => {
  const root = temp("so-frontier-repo-");
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  write(root, "package.json", JSON.stringify({ name: "demo", dependencies: { next: "16.0.0" } }));
  write(root, "src/app.ts", "export const a = 1;\n");
  return root;
};
const prompter = () => {
  const root = project();
  const stateDir = temp("so-frontier-state-");
  let turn = 0;
  return (prompt, session = "session-1") => {
    const result = spawnSync(process.execPath, [HOOK, "UserPromptSubmit"], {
      cwd: root,
      input: JSON.stringify({ cwd: root, client: "codex", session_id: session, turn_id: `user-${(turn += 1)}`, prompt }),
      encoding: "utf8",
      env: isolatedEnv({ SUPER_OUTER_STATE_DIR: stateDir, SUPER_OUTER_CLIENT: "codex" }),
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput?.additionalContext ?? "" : "";
  };
};

test("the hook adds one line for a prototype and skips nothing", () => {
  const product = "a new app from scratch: a flashcards product with spaced repetition for students, with a teacher dashboard";
  const context = prompter()(`build a quick prototype of ${product}`);
  const real = prompter()(`build ${product}`);
  assert.match(context, /The owner called this a prototype/);
  assert.match(context, /decide first whether the work touches anything real/);
  assert.match(context, /prototype-track\.md/);
  assert.doesNotMatch(real, /The owner called this a prototype/);
  // Everything the plain request is told, the prototype is told as well.
  assert.match(real, /No product brief yet/);
  assert.match(context, /No product brief yet/);
  const depth = (text) => /routed this request as (\w+)/.exec(text)?.[1];
  assert.equal(depth(context), depth(real));
  const without = context.replace(/The owner called this a prototype\..*?at its real depth\. /, "");
  assert.equal(without.replace("a quick prototype of ", ""), real.replace("a quick prototype of ", ""));
});

test("a prototype word inside a protected task gets no experiment-track offer", () => {
  const ask = prompter();
  assert.match(ask("add razorpay payments for the yearly plan and store the customer's card token"), /routed this request as CRITICAL/);
  const followUp = ask("as an experiment, skip the signature check for now");
  assert.match(followUp, /CRITICAL/);
  assert.doesNotMatch(followUp, /The owner called this a prototype/);
  // In a task with nothing protected, the same follow-up keeps the line.
  const plain = prompter();
  plain("build a new app from scratch: a flashcards product with spaced repetition for students, with a teacher dashboard");
  assert.match(plain("as an experiment, try a darker theme for it"), /The owner called this a prototype/);
});

test("a correction or a scope change worded as a prototype still gets its line", () => {
  const ask = prompter();
  const corrected = ask("that's wrong, I asked you to make a quick prototype of the export screen and you changed the real one");
  assert.match(corrected, /This message reads as a correction/);
});

test("the hook asks for the source of a mistake once a session when the owner corrects it", () => {
  const ask = prompter();
  const first = ask("that's wrong, you missed the second file in the export module");
  assert.match(first, /This message reads as a correction/);
  assert.match(first, /learning-loop\.md/);
  assert.doesNotMatch(ask("you forgot the header again in the export module"), /reads as a correction/);
  assert.match(ask("why did you rename the export module", "session-2"), /reads as a correction/);
  assert.doesNotMatch(prompter()("add a csv export to the reports module"), /reads as a correction/);
});

// ---------------------------------------------------------------- the skill's text

const text = (file) => fs.readFileSync(path.resolve(file), "utf8");
const SKILL = "skills/super-outer/SKILL.md";
const REFERENCES = "skills/super-outer/references";

test("the main skill file stays inside the size a long session keeps", () => {
  const skill = text(SKILL);
  assert.ok(skill.match(/\n/g).length <= 405, "at most 405 lines");
  // 3,161 words at 6.4.0. Claude Code re-attaches the first 5,000 tokens of a
  // skill after it shortens a session, so 6.5 added its rules without growth.
  assert.ok(skill.split(/\s+/).filter(Boolean).length <= 3161, "no more words than 6.4.0");
});

test("every 6.5 rule is in the skill's own text, so it holds on a host with no hook", () => {
  const skill = text(SKILL);
  for (const reference of ["learning-loop.md", "prototype-track.md", "standing-answers.md"]) {
    assert.ok(fs.existsSync(path.resolve(REFERENCES, reference)), reference);
    assert.ok(skill.includes(`(references/${reference})`), `SKILL.md links ${reference}`);
  }
  assert.match(skill, /A question about what is possible gets an answer; build only when asked/);
  assert.match(skill, /do not fetch the\s+same information through another tool/);
  assert.match(skill, /`Done when`/);
  assert.match(text(`${REFERENCES}/engineering-approach.md`), /Done when: <results another person can check>/);
  assert.match(text(`${REFERENCES}/engineering-approach.md`), /## Decisions taken/);
  assert.match(text(`${REFERENCES}/completion-contract.md`), /## Decisions taken for the owner/);
  assert.match(text(`${REFERENCES}/completion-contract.md`), /## After release/);
  assert.match(text(`${REFERENCES}/completion-contract.md`), /super-outer lessons check/);
  assert.match(text(`${REFERENCES}/proof-and-recorded-inputs.md`), /## Tests that outlive the code/);
  assert.match(text(`${REFERENCES}/parallel-agents.md`), /append-only edit log/);
  assert.match(text(`${REFERENCES}/requirement-changes.md`), /## When scope is cut/);
});

test("one notice rule remains: no shipped instruction asks for a large warning panel", () => {
  for (const file of [SKILL, "skills/super-outer/modules/delivery-release.md", "docs/reference.md", "docs/evidence-boundaries.md", "docs/architecture.md"]) {
    assert.doesNotMatch(text(file), /ASCII|multi-line (?:panel|rendering)|\|\s+BEWARE\s+\|/, file);
  }
});

const slug = (heading) => heading.trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
test("every relative link in the skill file and the changed references reaches a file and a heading that exist", () => {
  const files = [SKILL, ...["learning-loop.md", "prototype-track.md", "standing-answers.md", "lessons.md", "completion-contract.md", "engineering-approach.md", "working-method.md", "proof-and-recorded-inputs.md"].map((name) => `${REFERENCES}/${name}`)];
  let anchors = 0;
  for (const file of files) {
    for (const [, target, anchor] of text(file).matchAll(/\]\(([^)#\s]*)(?:#([^)\s]*))?\)/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      const resolved = target ? path.resolve(path.dirname(file), target) : path.resolve(file);
      assert.ok(fs.existsSync(resolved), `${file} links ${target}`);
      if (!anchor || fs.statSync(resolved).isDirectory()) continue;
      anchors += 1;
      const headings = [...fs.readFileSync(resolved, "utf8").matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => slug(heading));
      assert.ok(headings.includes(anchor), `${file} links #${anchor} in ${target || "itself"}`);
    }
  }
  assert.ok(anchors >= 10, "the anchor check read some anchors");
});

test("the after-release example in the reference is the shape the session-start check reads", () => {
  const contract = text(`${REFERENCES}/completion-contract.md`);
  const example = /## After release[\s\S]*?```json\n([\s\S]*?)```/.exec(contract)[1];
  const root = temp("so-after-example-");
  write(root, AFTER_RELEASE_PATH, example);
  assert.equal(dueLooks(root, new Date("2026-11-10T09:00:00Z")), 0);
  assert.equal(dueLooks(root, new Date("2026-11-12T09:00:00Z")), 1);
});
