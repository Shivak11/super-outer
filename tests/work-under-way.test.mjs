import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadArchetypes } from "../src/archetypes.mjs";
import { routeTask } from "../src/router.mjs";
import {
  AGENT_PHRASES, asksToPlanOrBuild, detectAgentProduct, isPlanFile, journeyMapRecorded, readsAsRequirementChange, readsAsScopeChange, uncoveredMoments, walkRecorded,
} from "../src/work-under-way.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

// 5.17: Super-outer follows the work under way in a session. These tests
// replay a build session modelled on one from 15 October 2026, in which a
// build plan for an AI agent product was written after an "ok, plan the build"
// message without any walk of the agent's needs over time. The messages are
// written for this test in the style of that session; none is a real message.

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const courseBuilderLike = ({ agentSdk = true, records = true } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-work-repo-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
    name: "course-app", dependencies: { next: "16.0.0", ...(agentSdk ? { ai: "7.0.0", workflow: "4.0.0" } : {}) },
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src/server.ts"), "export const save = () => db.from('activities').update({});\n");
  if (records) {
    fs.mkdirSync(path.join(root, ".engineering/super-outer/intent"), { recursive: true });
    fs.writeFileSync(path.join(root, ".engineering/super-outer/intent/judgement-activity.md"),
      "# Product intent: judgement-activity\nVersion: 7 (14 October 2026)\n\nStudents work through a case step by step.\n");
  }
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  return { root, stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-work-state-")) };
};

const callHook = ({ root, stateDir }, event, payload, session = "course-session") => {
  const result = spawnSync(process.execPath, [HOOK, event], {
    cwd: root,
    input: JSON.stringify({ cwd: root, client: "codex", session_id: session, ...payload }),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_STATE_DIR: stateDir, SUPER_OUTER_CLIENT: "codex", SUPER_OUTER_JEV: "off" }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
};

let turn = 0;
const say = (fx, prompt, session) =>
  callHook(fx, "UserPromptSubmit", { turn_id: `user-${(turn += 1)}`, prompt }, session).hookSpecificOutput?.additionalContext ?? "";
const writePlan = (fx, file, session) =>
  callHook(fx, "PreToolUse", { tool_name: "Write", tool_input: { file_path: path.join(fx.root, file), content: "# Build plan\n" } }, session);

const OPENING = "Build a conversational builder for the course app where teachers talk to an AI agent that edits their activity";

test("the course-builder session: the brief line once, a changed requirement sent to the records, the walk due at planning", () => {
  const fx = courseBuilderLike();

  const opening = say(fx, OPENING);
  assert.match(opening, /No product brief yet/);
  assert.match(opening, /ai-agent-product/);

  // Said once: on 5.16.3 this message printed the brief line again.
  const finalized = say(fx, "looks good, approved...this is the start of our design system....so where were we and what comes next");
  assert.doesNotMatch(finalized, /No product brief yet/);

  assert.doesNotMatch(say(fx, "maybe all blue on this"), /changes something already decided/);

  const branch = say(fx, "maybe a separate branch...one that is also deployed to the host");
  assert.match(branch, /A change to something already decided for the work under way is sorted first.*A detail .*gets a dated change line in \.engineering\/super-outer\/intent\/judgement-activity\.md/);
  assert.match(branch, /one line to the owner on what changed and what it affects/);

  // On 5.16.3 this message was routed QUICK with no library and no walk, and the whole plan followed it.
  const plan = say(fx, "yes keep the same database, go ahead plan the build");
  assert.match(plan, /No customer story walk is recorded for the new work/);
  assert.match(plan, /coming back to unfinished work three days later/);
  assert.match(plan, /someone saying "this is not working" with no detail/);
  assert.match(plan, /a habit stated once/);
  assert.match(plan, /ai-agent-product/);
  // Said once a session.
  assert.doesNotMatch(say(fx, "ok plan the build in phases then"), /No customer story walk is recorded for the new work/);
});

test("saving the plan shows the owner one notice naming what nobody checked, and never stops the tool", () => {
  const fx = courseBuilderLike();
  say(fx, OPENING);
  say(fx, "yes keep the same database, go ahead plan the build");

  const first = writePlan(fx, "docs/plans/faculty-builder-build-2026-10-15.md");
  assert.equal(first.decision, undefined);
  assert.equal(first.hookSpecificOutput?.permissionDecision, undefined);
  assert.match(first.systemMessage, /This build plan is being saved before anyone walked a customer's story through the design/);
  assert.match(first.systemMessage, /a run that takes minutes while the person closes the tab/);
  // The session sees it too, as context, with no permission decision.
  assert.match(first.hookSpecificOutput?.additionalContext ?? "", /^Super-outer: This build plan is being saved/);

  // Once per plan file in a session.
  assert.doesNotMatch(writePlan(fx, "docs/plans/faculty-builder-build-2026-10-15.md").systemMessage ?? "", /build plan is being saved/);
  // A code file is never a plan.
  assert.doesNotMatch(callHook(fx, "PreToolUse", { tool_name: "Write", tool_input: { file_path: path.join(fx.root, "src/contract.ts") } }).systemMessage ?? "", /build plan/);

  // Once a walk table is saved in an intent record, a new plan raises nothing.
  fs.writeFileSync(path.join(fx.root, ".engineering/super-outer/intent/faculty-builder.md"),
    "# Product intent: faculty-builder\nVersion: 6\n\n| Moment for Meera | What goes wrong | What we add | When |\n|---|---|---|---|\n| Returns after three days | It forgot | A summary per activity | Now |\n");
  assert.doesNotMatch(writePlan(fx, "docs/plans/faculty-builder-phase-2.md").systemMessage ?? "", /build plan/);
  assert.doesNotMatch(say(fx, "go ahead plan the build", "next-session"), /No customer story walk/);
});

test("a moment the code already handles is left out of the notice", () => {
  const fx = courseBuilderLike();
  fs.writeFileSync(path.join(fx.root, "src/chat.ts"), "import { createResumableStreamContext } from 'resumable-stream';\n");
  git(fx.root, "add", ".");
  git(fx.root, "commit", "-m", "resumable streams");
  const moments = uncoveredMoments({ isAgent: true, root: fx.root, library: loadArchetypes() });
  assert.ok(!moments.some((moment) => /closes the tab/.test(moment)), moments.join(" | "));
  assert.ok(moments.some((moment) => /three days later/.test(moment)));
});

test("a bug fix in an AI SDK repository gets no walk, no agent checklist and no plan notice", () => {
  const fx = courseBuilderLike();
  const fix = say(fx, "Fix the crash when the agent panel loads an empty activity", "fix-session");
  assert.doesNotMatch(fix, /story walk|ai-agent-product|No product brief yet/);
  assert.doesNotMatch(writePlan(fx, "docs/plans/crash-fix-plan.md", "fix-session").systemMessage ?? "", /build plan/);
  // A plain AI feature is not an agent product, even with the AI SDK installed.
  assert.equal(detectAgentProduct({ description: "Add an AI summary to the orders page", root: fx.root }).isAgent, false);
  assert.equal(detectAgentProduct({ description: "Add a chat assistant to the orders page", root: fx.root }).isAgent, true);
  assert.equal(detectAgentProduct({ description: "Add a chat assistant to the orders page", root: courseBuilderLike({ agentSdk: false, records: false }).root }).isAgent, false);
});

test("a changed requirement with no work under way and no records says nothing", () => {
  const fx = courseBuilderLike({ records: false });
  assert.doesNotMatch(say(fx, "let's have the save button on the right instead", "quiet-session"), /changes something already decided/);
});

test("the plain-language readers on session-style messages", () => {
  for (const [text, expected] of [
    ["yes keep the same database, go ahead plan the build", true],
    ["go ahead start steps 1 and 2 together", true],
    ["maybe all blue on this", false],
    ["what is the plan?", false],
  ]) assert.equal(asksToPlanOrBuild(text), expected, text);
  for (const [text, expected] of [
    ["maybe a separate branch...one that is also deployed to the host", true],
    ["no make it as familiar as possible to the tools people are used to", true],
    ["test on main without docker....also the side strip should be on the right side", true],
    ["looks good, approved...this is the start of our design system", false],
    ["any updates?", false],
  ]) assert.equal(readsAsRequirementChange(text), expected, text);
  for (const [file, expected] of [
    ["docs/plans/faculty-builder-build-2026-10-15.md", true],
    ["/Users/someone/.claude/plans/i-want-you-to-parsed-sparkle.md", true],
    ["build-plan.md", true],
    ["docs/explanation.md", false],
    ["src/planner.ts", false],
  ]) assert.equal(isPlanFile(file), expected, file);
});

test("the agent library is one list with the detector, loads, and matches an agent product", () => {
  const library = loadArchetypes();
  const agent = library.archetypes.find((archetype) => archetype.id === "ai-agent-product");
  assert.ok(agent);
  assert.deepEqual(agent.matches, [...AGENT_PHRASES]);
  for (const mode of agent.failureModes) assert.equal(typeof mode.moment, "string", mode.id);
  assert.ok(routeTask({ description: OPENING }).archetypes.some((archetype) => archetype.id === "ai-agent-product"));
  // The coding assistant's own agents are not an agent product.
  assert.ok(!routeTask({ description: "spawn a subagent that reviews the parser" }).archetypes.some((archetype) => archetype.id === "ai-agent-product"));
});

test("a walk counts when its table is in the product brief", () => {
  const fx = courseBuilderLike({ records: false });
  assert.equal(walkRecorded(fx.root), false);
  fs.mkdirSync(path.join(fx.root, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(fx.root, ".engineering/super-outer/product-brief.md"), "# Product brief\n\n| Moment for Priya | x | y | Now |\n");
  assert.equal(walkRecorded(fx.root), true);
});

// 6.6: a journey map is recorded once a table whose header row starts
// "| Phase for <name>" is saved in the product brief or an intent record.
test("a journey map counts when its table is in the product brief or an intent record", () => {
  const none = courseBuilderLike({ records: false });
  assert.equal(journeyMapRecorded(none.root), false);
  assert.equal(journeyMapRecorded(""), false);
  // An intent record with no table is not a map.
  assert.equal(journeyMapRecorded(courseBuilderLike().root), false);

  const map = "| Phase for Priya, a student | What happens | What she can do here, and how she can tell | Where she could get stuck, or what could break | Data it creates, and who can see it | What the product needs | When |\n|---|---|---|---|---|---|---|\n| Signs up | Signs in with her phone number | Type her number and get a code | The code arrives late | Phone number: Priya and you | Sign-in by one-time code | Launch |\n";
  const inBrief = courseBuilderLike({ records: false });
  fs.mkdirSync(path.join(inBrief.root, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(inBrief.root, ".engineering/super-outer/product-brief.md"), `# Product brief\n\n## Journey\n\n${map}`);
  assert.equal(journeyMapRecorded(inBrief.root), true);
  // A map is not a story walk.
  assert.equal(walkRecorded(inBrief.root), false);

  const inIntent = courseBuilderLike();
  fs.writeFileSync(path.join(inIntent.root, ".engineering/super-outer/intent/study-buddy.md"), `# Product intent: study-buddy\n\n${map}`);
  assert.equal(journeyMapRecorded(inIntent.root), true);

  // A story walk table alone is not a map, and prose that names a phase is not a table.
  const walkOnly = courseBuilderLike({ records: false });
  fs.mkdirSync(path.join(walkOnly.root, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(walkOnly.root, ".engineering/super-outer/product-brief.md"),
    "# Product brief\n\nThe first phase for Priya is finding it.\n\n| Moment for Priya | x | y | Now |\n");
  assert.equal(walkRecorded(walkOnly.root), true);
  assert.equal(journeyMapRecorded(walkOnly.root), false);
});

test("a scope change reopens the interview and the plan; a detail gets one line (5.18)", () => {
  const fx = courseBuilderLike();
  say(fx, OPENING, "scope-session");
  // A new audience joins the product in passing.
  const scope = say(fx, "teachers would also be on the same route...they too have practice apps", "scope-session");
  assert.match(scope, /This message reads as a possible change to the product's scope\./);
  assert.match(scope, /reopens only the interview questions it opens/);
  assert.match(scope, /The affected parts wait for the owner's ok before they are built/);
  assert.match(scope, /blast-radius estimate layer by layer from the code/);
  assert.match(scope, /requirement-changes\.md/);
  // A detail still gets the instruction, without the scope flag.
  const detail = say(fx, "no make the strip sit on the right side instead", "scope-session");
  assert.match(detail, /is sorted first/);
  assert.doesNotMatch(detail, /possible change to the product's scope/);
  // Design feedback is neither.
  assert.doesNotMatch(say(fx, "too many boxes and lines....not keen on that", "scope-session"), /is sorted first/);
});

test("the scope reader on session-style messages", () => {
  for (const [text, expected] of [
    ["teachers would also be on the same route...they too have practice apps", true],
    ["maybe a separate branch...one that is also deployed to the host", true],
    ["we should also let students download the report", true],
    ["too many boxes and lines....not keen on that", false],
    ["now it is too colourful...use /polish", false],
    ["maybe all blue on this", false],
  ]) assert.equal(readsAsScopeChange(text), expected, text);
});

// Follow-ups in the style of a reading-library build (27 Oct 2026). Each widens
// the product and none matched the old wording. Further paraphrases guard
// against fitting only the first few.
test("the scope reader catches wishes, new needs, stack choices and new devices (6.3)", () => {
  for (const text of [
    "Also we'd need some service to parse larger pdfs and ebooks because that is what goes in most of the time",
    "I'd also like my highlights to be synced and a knowledge graph of the books to be created",
    "think of it like a highlights tool...also if it can sync highlights from my reading app it would be great...that sync is already on for me so try not to duplicate it",
    "ideally i'd want the entire reading experience within it, including phones",
    "for the parser use a hosted parsing service",
    "i would love it if teachers could see this too",
    "we will need a way to export the notes",
    "can it also read kindle files?",
    "would be nice to have offline mode",
    "for the database go with postgres",
    "it should work on mobile as well",
    "make it work on phones",
  ]) {
    assert.equal(readsAsScopeChange(text), true, text);
    assert.equal(readsAsRequirementChange(text), true, text);
  }
  for (const text of [
    "ok go ahead",
    "is it deployed?",
    "the button label has a typo",
    "looks good, approved...this is the start of our design system",
    "now it is too colourful...use /polish",
    "too many boxes and lines....not keen on that",
    "what failed in the last run?",
    "i like this version better",
    "would be good to know why it failed",
    "see if you can reach bitwarden",
    "check if it can find the file",
    "fix it if you can",
    "I'd like you to run the tests",
    "can you also run lint",
  ]) assert.equal(readsAsRequirementChange(text), false, text);
});

test("a bug report that also asks for a new capability still gets the scope-change line (6.3)", () => {
  const fx = courseBuilderLike();
  say(fx, OPENING, "mixed-session");
  const mixed = say(fx, "the upload is broken for big files, also i'd like it to support epubs", "mixed-session");
  assert.match(mixed, /possible change to the product's scope/);
  // A fix with a soft wish word and nothing added stays a fix.
  assert.doesNotMatch(say(fx, "the upload is broken, ideally fix it today", "mixed-session"), /is sorted first/);
});
