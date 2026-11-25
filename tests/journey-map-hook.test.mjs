import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LEDGER_PATH } from "../src/sequencing.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

// 6.6: the planning line and the plan notice that name a missing story walk
// also name a missing journey map. A repository with a recorded walk gets no
// line, as in 6.5, and one with a recorded map and no walk gets the 6.5
// wording unchanged. Every hook run here has Jev switched off.

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const SKILL_DIR = path.resolve("skills/super-outer");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const WALK_TABLE = "| Moment for Meera | What goes wrong | What we add | When |\n|---|---|---|---|\n| Returns after three days | It forgot | A summary per activity | Now |\n";
const MAP_TABLE = "| Phase for Meera, a teacher | What happens | What she can do here, and how she can tell | Where she could get stuck, or what could break | Data it creates, and who can see it | What the product needs | When |\n|---|---|---|---|---|---|---|\n| Signs up | Signs in with her college email | Type her email and get a code | The code arrives late | Email: Meera and the owner | Sign-in by one-time code | Launch |\n";

const repo = ({ walk = false, map = false, files = {} } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-journey-repo-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  const all = {
    "package.json": `${JSON.stringify({ name: "course-app", dependencies: { next: "16.0.0", ai: "7.0.0", workflow: "4.0.0" } }, null, 2)}\n`,
    "src/server.ts": "export const save = () => db.from('activities').update({});\n",
    ".engineering/super-outer/intent/judgement-activity.md": "# Product intent: judgement-activity\nVersion: 7 (14 October 2026)\n\nStudents work through a case step by step.\n",
    ...(walk ? { ".engineering/super-outer/intent/faculty-builder.md": `# Product intent: faculty-builder\nVersion: 6\n\n${WALK_TABLE}` } : {}),
    ...(map ? { ".engineering/super-outer/intent/faculty-journey.md": `# Product intent: faculty-journey\nVersion: 1\n\n## Journey\n\n${MAP_TABLE}` } : {}),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  return { root, stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-journey-state-")) };
};

let turn = 0;
const callHook = ({ root, stateDir }, event, payload, session = "journey-session") => {
  const result = spawnSync(process.execPath, [HOOK, event], {
    cwd: root,
    input: JSON.stringify({ cwd: root, client: "codex", session_id: session, turn_id: `user-${(turn += 1)}`, ...payload }),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_STATE_DIR: stateDir, SUPER_OUTER_CLIENT: "codex", SUPER_OUTER_JEV: "off" }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
};
const say = (fx, prompt, session) => callHook(fx, "UserPromptSubmit", { prompt }, session).hookSpecificOutput?.additionalContext ?? "";
const writePlan = (fx, file, session) =>
  callHook(fx, "PreToolUse", { tool_name: "Write", tool_input: { file_path: path.join(fx.root, file), content: "# Build plan\n" } }, session);
const noticeOf = (out) => out.hookSpecificOutput?.additionalContext ?? "";

const OPENING = "Build a conversational builder for the course app where teachers talk to an AI agent that edits their activity";
const PLAN = "yes same database, go ahead plan the build";
// The session starts new work, then asks for the plan.
const planningContext = (fx, session) => {
  say(fx, OPENING, session);
  return say(fx, PLAN, session);
};

const JOURNEY_WORDING = /journey map|journey-map\.md/;
// The 6.5 texts, which a repository with a recorded map and no walk still gets.
const WALK_DUE_6_5 = /No customer story walk is recorded for the new work this session is planning\. Before the plan, Super-outer walks one customer's week through the design with the owner and saves the walk table to the product brief or the intent record \([^)]+story-walk\.md\)\. Not yet covered by the code or a recorded walk: [^.]+\. The owner is asked only the choices that are theirs, in the customer's terms\./;
const PLAN_NOTICE_6_5 = /^Super-outer: This build plan is being saved before anyone walked a customer's story through the design\. Not yet covered by the code or a recorded walk: [^.]+\. Ask Claude to walk these with you before building, or carry on if they are settled\.$/;

test("planning with no journey map and no story walk: one line names both, once a session", () => {
  const fx = repo();
  const context = planningContext(fx);
  assert.match(context, /No customer story walk is recorded for the new work this session is planning, and no journey map is recorded either\./);
  // The map comes first, then the walk, and each names its reference file.
  assert.match(context, /Before the plan, Super-outer writes the journey map with the owner phase by phase \([^)]+journey-map\.md\), then walks one customer's week through the design with the owner \([^)]+story-walk\.md\), and saves both tables to the product brief or the intent record\./);
  assert.match(context, /Not yet covered by the code or a recorded walk: [^.]*coming back to unfinished work three days later/);
  // One line, with one opening sentence, and no second line about the map.
  assert.equal(context.match(/No customer story walk is recorded/g)?.length, 1, context);
  assert.equal(context.match(/journey-map\.md/g)?.length, 1, context);
  // Said once a session.
  assert.doesNotMatch(say(fx, "ok plan the build in phases then"), /No customer story walk is recorded|journey map/);
});

test("planning with a recorded story walk and no journey map: no line", () => {
  const context = planningContext(repo({ walk: true }));
  // The hook did answer this message, as part of the task the opening started.
  assert.match(context, /Super-outer read this message as part of the FULL task already in progress/);
  assert.doesNotMatch(context, /No customer story walk is recorded/);
  assert.doesNotMatch(context, JOURNEY_WORDING);
});

test("planning with a recorded journey map and no story walk: the 6.5 line, with no word about a map", () => {
  const context = planningContext(repo({ map: true }));
  assert.match(context, WALK_DUE_6_5);
  assert.doesNotMatch(context, JOURNEY_WORDING);
});

test("planning with both recorded: no line", () => {
  const context = planningContext(repo({ walk: true, map: true }));
  // The hook did answer this message, as part of the task the opening started.
  assert.match(context, /Super-outer read this message as part of the FULL task already in progress/);
  assert.doesNotMatch(context, /No customer story walk is recorded/);
  assert.doesNotMatch(context, JOURNEY_WORDING);
});

test("saving a plan with no journey map and no story walk: one notice names both and never stops the tool", () => {
  const fx = repo();
  planningContext(fx);
  const first = writePlan(fx, "docs/plans/faculty-builder-build.md");
  assert.equal(first.decision, undefined);
  assert.equal(first.hookSpecificOutput?.permissionDecision, undefined);
  const notice = noticeOf(first);
  assert.match(notice, /^Super-outer: This build plan is being saved before anyone walked a customer's story through the design\. No journey map is recorded for this work either \([^)]+journey-map\.md\)\. Not yet covered by the code or a recorded walk: [^.]+\. Ask Claude to write the journey map and walk these with you before building, or carry on if they are settled\.$/);
  // The owner sees the same notice as a warning.
  assert.match(first.systemMessage, /No journey map is recorded for this work either/);
  assert.equal(first.systemMessage.match(/This build plan is being saved/g)?.length, 1);
  // Once per plan file in a session.
  const second = writePlan(fx, "docs/plans/faculty-builder-build.md");
  assert.equal(noticeOf(second), "");
  assert.doesNotMatch(second.systemMessage ?? "", /build plan|journey map/);
});

test("leaving plan mode with no journey map and no story walk gets the same notice", () => {
  const fx = repo();
  planningContext(fx);
  const out = callHook(fx, "PreToolUse", { tool_name: "ExitPlanMode", tool_input: { plan: "# Build plan\n" } });
  assert.equal(out.hookSpecificOutput?.permissionDecision, undefined);
  assert.match(noticeOf(out), /No journey map is recorded for this work either \([^)]+journey-map\.md\)\./);
});

test("saving a plan with a recorded story walk and no journey map: no notice", () => {
  const fx = repo({ walk: true });
  planningContext(fx);
  const out = writePlan(fx, "docs/plans/faculty-builder-build.md");
  assert.equal(noticeOf(out), "");
  assert.doesNotMatch(out.systemMessage ?? "", /build plan|journey map/);
});

test("saving a plan with a recorded journey map and no story walk: the 6.5 notice, with no word about a map", () => {
  const fx = repo({ map: true });
  planningContext(fx);
  const out = writePlan(fx, "docs/plans/faculty-builder-build.md");
  assert.match(noticeOf(out), PLAN_NOTICE_6_5);
  assert.doesNotMatch(noticeOf(out), JOURNEY_WORDING);
  assert.doesNotMatch(out.systemMessage, JOURNEY_WORDING);
});

test("saving a plan with both recorded: no notice", () => {
  const fx = repo({ walk: true, map: true });
  planningContext(fx);
  const out = writePlan(fx, "docs/plans/faculty-builder-build.md");
  assert.equal(noticeOf(out), "");
  assert.doesNotMatch(out.systemMessage ?? "", /build plan|journey map/);
});

test("a fix or maintenance request gets no journey wording, at the prompt or when its plan is saved", () => {
  for (const prompt of [
    "Fix the crash when the agent panel loads an empty activity",
    "Fix the crash when the agent panel loads an empty activity, go ahead and implement the fix",
    "The agent chat stopped saving edits since yesterday, plan the fix",
    "Rename the helper in the agent module",
    "Rename the helper in the agent module and implement it everywhere",
  ]) {
    const fx = repo();
    const context = say(fx, prompt, "fix-session");
    assert.doesNotMatch(context, JOURNEY_WORDING, prompt);
    assert.doesNotMatch(context, /No customer story walk is recorded|No product brief yet/, prompt);
    const out = writePlan(fx, "docs/plans/crash-fix-plan.md", "fix-session");
    assert.equal(noticeOf(out), "", prompt);
    assert.doesNotMatch(out.systemMessage ?? "", /build plan|journey map/, prompt);
  }
});

// Claude Code keeps at most 10,000 characters of a prompt hook's added context
// and saves the rest to a file. These are the longest outputs a realistic
// request produces, in a repository with no brief, three intent records and
// deferred parts that have come due. Both ask for a new AI agent product and
// its plan in one message, change the scope and correct the assistant, so each
// gets the brief line, the planning line with every agent moment open, the
// scope line, the correction line, the design path and the due deferrals.
// The first names sixteen failure-mode libraries and is CRITICAL. The second
// is FULL and adds the prototype line, which a CRITICAL request never gets.
const LONGEST_PROMPTS = Object.freeze({
  CRITICAL: "Build a new marketplace app from scratch where students talk to an AI agent tutor that remembers each student across the semester. It needs Google sign-in, card payments with monthly subscriptions and refunds, voice note and video recording uploads with transcription, email from our own sending domain, SMS and push notifications, invitations so a teacher can invite teammates with team roles, an admin panel with product analytics, a help centre, a landing page, a new onboarding flow, account deletion so a student can delete their account, and a database migration from the old system, for 50k users at launch. I asked you for this before and you missed it. We also need it to work on phones, for teachers too. Go ahead and plan the build and release it to production.",
  FULL: "Build a quick prototype of a new app from scratch where people talk to an AI agent that plans their week, with voice notes and transcription, a landing page, a help centre, a new onboarding flow, an admin panel and product analytics. I asked you for this before and you missed it. We also need it to work on phones too. Go ahead and plan the build.",
});
const deferred = (id, term) => ({
  id,
  prompt: `Add ${id.replace(/-/g, " ")} once more than one teacher shares a class`,
  why: "Two teachers editing one class would overwrite each other's changes",
  archetype: null,
  status: "DEFERRED",
  revisitWhen: [term],
  recorded_at: "2026-10-12T09:30:00.000Z",
});
const busyRepo = () => repo({
  files: {
    ".engineering/super-outer/intent/faculty-builder.md": "# Product intent: faculty-builder\nVersion: 6\n\nFaculty edit an activity by talking to it.\n",
    ".engineering/super-outer/intent/student-report.md": "# Product intent: student-report\nVersion: 2\n\nStudents download a report.\n",
    "src/classes.ts": "export const sharedClassEditors = [];\nexport const classInviteLink = '';\n",
    [LEDGER_PATH]: `${JSON.stringify({
      schema_version: "1.0.0",
      entries: [
        deferred("edit-locking", "sharedClassEditors"),
        deferred("invite-expiry", "classInviteLink"),
        { ...deferred("database-read-replica", "term-nobody-wrote"), measuredWhen: [{ metric: "db_peak_busy_percent", comparison: ">", threshold: 60 }] },
      ],
    }, null, 2)}\n`,
  },
});
// Every file the hook names sits under the installed skill folder, whose path
// differs per machine. Claude Code's plugin folder on Shiva's machine is 106
// characters long; the check allows 120.
const INSTALLED_FOLDER_CHARACTERS = 120;

test("the longest prompt-hook output stays under Claude Code's 10,000-character limit", () => {
  for (const [mode, prompt] of Object.entries(LONGEST_PROMPTS)) {
    const context = say(busyRepo(), prompt, "longest-session");
    // The input really is the long case, with the new wording present.
    assert.match(context, new RegExp(`routed this request as ${mode}\\.`));
    assert.match(context, /No product brief yet, and this request reads as new work/);
    assert.match(context, /writes the journey map with the owner phase by phase, walks one customer's story/);
    assert.match(context, /no journey map is recorded either/);
    assert.match(context, /possible change to the product's scope/);
    assert.match(context, /This message reads as a correction/);
    assert.match(context, /This may be a user-facing new feature or redesign/);
    assert.match(context, /2 parts the owner deferred are now due/);
    assert.match(context, /1 deferred part waits on numbers nobody has supplied/);
    const libraries = (context.match(/archetypes\/[a-z-]+\.json/g) ?? []).length;
    if (mode === "CRITICAL") assert.ok(libraries >= 16, `only ${libraries} libraries were named`);
    else assert.match(context, /The owner called this a prototype/);

    const named = context.split(SKILL_DIR).length - 1;
    const installed = context.length + named * (INSTALLED_FOLDER_CHARACTERS - SKILL_DIR.length);
    assert.ok(installed < 10_000, `with a ${INSTALLED_FOLDER_CHARACTERS}-character skill folder the longest ${mode} output is ${installed} characters`);
    console.log(`longest ${mode} prompt-hook output: ${context.length} characters with a ${SKILL_DIR.length}-character skill folder named ${named} times; ${installed} with ${INSTALLED_FOLDER_CHARACTERS} characters; it fits up to a ${SKILL_DIR.length + Math.floor((9_999 - context.length) / named)}-character folder`);
  }
});
