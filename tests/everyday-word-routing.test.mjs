// 5.14.0: everyday senses of the payments and sign-in words stop raising the
// route, and a word that could go either way keeps the higher route and asks
// (task-observer observations 55 and 15; Shiva's rule of 13 October 2026: in
// doubt, keep the higher care and ask). Every expected route below was first
// measured on 5.12.1, so each "before" value is what that release gave.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { everydayText, routeTask } from "../src/router.mjs";
import { isMaintenanceOnly } from "../src/archetypes.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

const route = (text, options) => routeTask({ description: text }, options);
const libraries = (decision) => decision.archetypes.map((archetype) => archetype.id);
const ambiguousIn = (decision) =>
  decision.signals.filter((signal) => signal.startsWith("ambiguous:")).map((signal) => signal.slice(10));

test("the clear everyday requests from the observation no longer route as payments or sign-in work", () => {
  // 5.12.1: CRITICAL, CRITICAL, FULL, CRITICAL, CRITICAL, CRITICAL, CRITICAL.
  for (const text of [
    "git checkout main",
    "git checkout main and pull the latest",
    "checkout the feature branch and run the tests",
    "never commit in the main checkout, give the keyboard flag a fail-open exit and add a test",
    "purchase order template",
    "claude mcp login openrouter",
    "login with bitwarden mcp",
    "open dataforseo for login",
    "vercel login",
    "see if you can login to it",
    "update the invoice section of the BHEL proposal pdf",
  ]) {
    const decision = route(text);
    assert.notEqual(decision.mode, "CRITICAL", text);
    assert.deepEqual(decision.signals.filter((signal) => /^(?:protected|ambiguous):/.test(signal)), [], text);
    assert.deepEqual(libraries(decision).filter((id) => ["payments-subscription", "authentication"].includes(id)), [], text);
  }
});

test("a word that could go either way keeps the 5.12.1 route and is marked to ask", () => {
  const cases = {
    "update checkout": ["CRITICAL", 12, ["payments-subscription"], ["payments"]],
    "fix the checkout": ["CRITICAL", 12, ["payments-subscription"], ["payments"]],
    "change the login": ["CRITICAL", 12, ["authentication"], ["authentication"]],
    "the login is broken": ["CRITICAL", 12, ["authentication"], ["authentication"]],
    "reset the password": ["CRITICAL", 12, ["authentication"], ["authentication"]],
    "login with github": ["CRITICAL", 12, ["authentication"], ["authentication"]],
    "update the invoice template": ["CRITICAL", 7, [], ["payments"]],
    "payment should be 50 percent before and 50 after": ["CRITICAL", 12, ["payments-subscription"], ["payments"]],
    "it says password data for new item": ["CRITICAL", 12, ["authentication"], ["authentication"]],
    // Moving money named beside a document is never read as document editing.
    "pay the invoices in the attached pdf": ["CRITICAL", 7, [], ["payments"]],
    "process the refunds listed in the spreadsheet": ["CRITICAL", 12, ["payments-subscription"], ["payments"]],
    // "Sign in with Vercel" is a product sign-in method; "vercel login" is a command.
    "sign in with vercel": ["CRITICAL", 12, ["authentication"], ["authentication"]],
  };
  for (const [text, [mode, allowance, libs, ambiguous]] of Object.entries(cases)) {
    const decision = route(text);
    assert.equal(decision.mode, mode, text);
    assert.equal(decision.question_budget, allowance, text);
    assert.deepEqual(libraries(decision), libs, text);
    assert.deepEqual(ambiguousIn(decision), ambiguous, text);
    // Read as everyday wording, the same request routes lower. That is the
    // route the owner's answer can choose; it is never chosen without asking.
    const everyday = route(text, { readAsEveryday: ambiguous });
    assert.notEqual(everyday.mode, "CRITICAL", text);
    assert.deepEqual(ambiguousIn(everyday), [], text);
  }
});

test("real payments and sign-in requests keep their route and do not ask", () => {
  for (const text of [
    "add a checkout page with Stripe",
    "build the login screen",
    "Overhaul the checkout page",
    "Design the checkout",
    "Create a login page",
    "add password reset",
    "add Google login to the app",
    "Add a payments screen",
    "The checkout page is broken on Safari, please fix it",
    "add rate limiting to the login endpoint",
    "let users pay with UPI at checkout",
    "Move from Stripe Checkout to our own payment page",
    "replace the current login screen with a phone number login screen",
    "the login page headline has a typo in it, change the wording",
    "store the api password in the keychain instead of the env file",
    "checkout the feature branch and add Stripe checkout to the app",
    "gh auth login",
    "store passwords with bcrypt",
  ]) {
    const decision = route(text);
    assert.equal(decision.mode, "CRITICAL", text);
    assert.deepEqual(ambiguousIn(decision), [], text);
  }
  assert.deepEqual(libraries(route("add a checkout page with Stripe")), ["payments-subscription"]);
  assert.deepEqual(libraries(route("build the login screen")), ["authentication"]);
});

test("a named document keeps its route when the request also names software", () => {
  // A missing software word never lowers a route; only a named document with
  // no software word does.
  assert.equal(route("add a payment button to the proposal pdf generator in the app").mode, "CRITICAL");
  assert.equal(route("payment terms should be net 30").mode, "CRITICAL");
  assert.deepEqual(ambiguousIn(route("payment terms should be net 30")), ["payments"]);
});

test("only the everyday phrase is removed, and the rest of the request is read as before", () => {
  assert.doesNotMatch(everydayText("git checkout main"), /checkout/);
  assert.match(everydayText("git checkout main, then fix the checkout"), /fix the checkout/);
  assert.equal(route("git checkout main, then fix the checkout").mode, "CRITICAL");
  assert.deepEqual(ambiguousIn(route("git checkout main, then fix the checkout")), ["payments"]);
});

test("move counts as tidy-up work unless stored data follows it in the same clause", () => {
  assert.equal(isMaintenanceOnly("move the save button 8px to the left"), true);
  assert.equal(isMaintenanceOnly("move the editor into its own file"), true);
  assert.equal(isMaintenanceOnly("Move every recording to the new storage format and backfill the owner"), false);
  assert.equal(isMaintenanceOnly("move the users to the new table"), false);
  // 5.12.1: FULL with an allowance of 7 and no library.
  const decision = route("Move every recording to the new storage format and backfill the owner");
  assert.equal(decision.mode, "FULL");
  assert.deepEqual(libraries(decision), ["data-migration"]);
  assert.equal(decision.question_budget, 12);
});

test("the move check reads a long request once", () => {
  // A check that searched forward from every "move" took about 280 ms on
  // 50,000 characters and grows with the square of the length.
  const text = `${"move ".repeat(40000)}data`;
  const started = performance.now();
  isMaintenanceOnly(text);
  assert.ok(performance.now() - started < 1500, `${Math.round(performance.now() - started)} ms`);
});

// The prompt hook: the question for an ambiguous word, and follow-ups in a task.
const HOOK = path.resolve("hooks/super-outer-hook.mjs");

const hookRun = (stateDir, root, prompt, session = "everyday-session") => {
  const result = spawnSync(process.execPath, [HOOK, "UserPromptSubmit"], {
    cwd: root,
    input: JSON.stringify({ cwd: root, client: "codex", session_id: session, turn_id: `t-${Math.random()}`, prompt }),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_STATE_DIR: stateDir, SUPER_OUTER_CLIENT: "codex", SUPER_OUTER_JEV: "off" }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}").hookSpecificOutput?.additionalContext ?? "";
};

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-everyday-repo-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  return { root, stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-everyday-state-")) };
};

test("the hook keeps the higher route for an ambiguous word and asks one plain question", () => {
  const { root, stateDir } = fixture();
  const context = hookRun(stateDir, root, "update checkout");
  assert.match(context, /routed this request as CRITICAL/);
  assert.match(context, /one plain question to the owner before any other step: "Is this about how customers pay in your product/);
  assert.match(context, /Until the owner answers, the request is treated as CRITICAL; as everyday wording it is QUICK\./);
  const signIn = hookRun(stateDir, root, "change the login", "another-session");
  assert.match(signIn, /"Is this about how people sign in to your product, or about signing in to a tool or account yourself\?"/);
  // A clear request does not ask.
  assert.doesNotMatch(hookRun(stateDir, root, "add a checkout page with Stripe", "third-session"), /one plain question/);
});

test("a short follow-up in a task belongs to that task, and anything that needs more care is routed afresh", () => {
  const { root, stateDir } = fixture();
  const task = "Migrate the recordings table to add an owner column and backfill it";
  assert.match(hookRun(stateDir, root, task), /routed this request as FULL/);

  const followUp = hookRun(stateDir, root, "do that stuck note recording one also");
  assert.match(followUp, /part of the FULL task already in progress in this session/);
  assert.match(followUp, /no new question allowance and no new engineering approach stage/);
  assert.doesNotMatch(followUp, /Question allowance/);

  // The same request sent again gets its full route again.
  assert.match(hookRun(stateDir, root, task), /routed this request as FULL/);

  // A follow-up that brings in payments is routed afresh, at the higher depth.
  assert.match(hookRun(stateDir, root, "also add refunds to the checkout page"), /routed this request as CRITICAL/);

  // Another session starts with no task.
  assert.doesNotMatch(hookRun(stateDir, root, "do that stuck note recording one also", "other-session"), /already in progress/);
});

test("a follow-up after a QUICK route, or a long message, is routed as before", () => {
  const { root, stateDir } = fixture();
  hookRun(stateDir, root, "fix the typo in the footer link");
  assert.doesNotMatch(hookRun(stateDir, root, "rename the helper in the upload module"), /already in progress/);

  const second = fixture();
  hookRun(second.stateDir, second.root, "Migrate the recordings table to add an owner column and backfill it");
  const long = `${"please also check the spacing on the panel ".repeat(5)}and tell me`;
  assert.doesNotMatch(hookRun(second.stateDir, second.root, long), /already in progress/);
});

test("the saved task route holds no typed words", () => {
  const { root, stateDir } = fixture();
  hookRun(stateDir, root, "Migrate the recordings table to add an owner column and backfill it");
  const folder = path.join(stateDir, "session-routes");
  const [file] = fs.readdirSync(folder);
  const saved = fs.readFileSync(path.join(folder, file), "utf8");
  assert.doesNotMatch(saved, /recordings|owner|backfill|Migrate/);
  assert.deepEqual(Object.keys(JSON.parse(saved)).sort(), ["at", "libraries", "mode", "protected", "request"]);
});
