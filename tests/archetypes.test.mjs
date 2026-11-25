import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  loadArchetypes,
  detectArchetypes,
  archetypeDecisions,
  isMaintenanceOnly,
  archetypePolicy,
} from "../src/archetypes.mjs";
import { routeTask } from "../src/router.mjs";
import { ARCHETYPE_QUESTION_BUDGET } from "../src/constants.mjs";

const route = (text, extra = {}) =>
  routeTask({ title: text, description: text, ...extra });

// The defect this release exists to fix: a plainly worded feature request
// selected no specialist at all, so nobody was in the room to anticipate
// anything. These fail on 4.2.0.
test("a plainly worded feature request puts specialists in the room", () => {
  const decision = route("Build a voice recording pipeline for the app");
  assert.ok(
    decision.selected_modules.length >= 3,
    `expected several specialists, got ${JSON.stringify(decision.selected_modules)}`,
  );
  for (const expected of ["reliability-recovery", "frontend-client", "data-migrations"]) {
    assert.ok(
      decision.selected_modules.includes(expected),
      `${expected} must be selected for capture-and-upload work`,
    );
  }
  assert.equal(decision.archetypes[0].id, "mobile-capture-upload");
});

test("archetypes match product nouns, not engineering vocabulary", () => {
  // Neither sentence contains "retry", "idempotency" or any trigger token, which
  // is exactly why the old router found nothing.
  for (const text of [
    "Add voice notes so people can record their thoughts",
    "Let users subscribe to a paid plan",
    "Add an assistant that summarises a recording",
  ]) {
    const decision = route(text);
    assert.ok(decision.archetypes.length > 0, `no archetype for: ${text}`);
    assert.ok(decision.selected_modules.length > 0, `no specialists for: ${text}`);
  }
});

test("an archetype route earns a larger budget", () => {
  const greenfield = route("Build a voice recording pipeline for the app");
  assert.equal(greenfield.question_budget, ARCHETYPE_QUESTION_BUDGET);
  const ordinary = route("Adjust the padding on the settings row");
  assert.ok(ordinary.question_budget <= 7);
  assert.equal(ordinary.archetypes.length, 0);
});

// The guard against the over-asking v4.0.2 removed.
test("maintenance work never summons an archetype", () => {
  for (const text of [
    "Rename a local variable in the upload helper",
    "Fix a typo in the recording screen",
    "Reorder comments in the voice module",
  ]) {
    const decision = route(text);
    assert.equal(decision.archetypes.length, 0, `archetype fired on: ${text}`);
    assert.ok(decision.question_budget <= 7);
  }
});

test("an explicit redesign outranks a maintenance verb", () => {
  assert.equal(isMaintenanceOnly("Redesign the folder screen and rename the tabs"), false);
  assert.equal(isMaintenanceOnly("rename the tabs"), true);
});

test("a protected domain outranks a maintenance verb", () => {
  // Renaming a column on the payments table is still payments work.
  assert.equal(isMaintenanceOnly("rename the payments column", { protectedDomains: ["payments"] }), false);
  assert.equal(isMaintenanceOnly("rename the helper", { protectedDomains: [] }), true);
  const decision = route("Reformat the payments module");
  assert.equal(decision.mode, "CRITICAL");
});

// Plural bug: "Handle refunds" routed QUICK with zero specialists on 4.2.0.
test("protected domains survive the plural form", () => {
  const pairs = [
    ["Add a payment screen", "Add a payments screen"],
    ["Handle a refund", "Handle refunds"],
    ["Store a user secret", "Store user secrets"],
    ["Change a permission", "Change permissions"],
  ];
  for (const [singular, plural] of pairs) {
    const one = route(singular);
    const many = route(plural);
    assert.equal(many.mode, one.mode, `${plural} routed ${many.mode}, ${singular} routed ${one.mode}`);
    assert.ok(
      many.selected_modules.includes("security-privacy-abuse"),
      `${plural} must still reach the security specialist`,
    );
  }
});

test("widening plurals does not over-trigger on lookalike words", () => {
  for (const text of [
    "Update the secretary contact page",
    "Refund policy copy is out of date in the marketing site footer",
  ]) {
    const decision = route(text);
    // "secretary" must not read as "secret".
    if (text.includes("secretary")) {
      assert.ok(!decision.signals.includes("protected:sensitive_data"), text);
    }
  }
});

// Reported on 2026-09-20: "lets plan first" routed FULL with twelve questions
// and four specialists, and the hook pointed the assistant at double charges.
// The payments library listed "plan" and "pay" as match words on their own, so
// a request about planning, or "pay attention to the header", read as payments
// work. Both words now have to arrive inside a phrase that carries the payments
// meaning.
const matchesPayments = (text) =>
  route(text).archetypes.find((archetype) => archetype.id === "payments-subscription");

test("planning language is not payments work", () => {
  for (const text of [
    "lets plan first",
    "write a plan for the migration",
    "lets implement this in the experimental version of super-router that you created. lets plan first if needed",
  ]) {
    assert.equal(matchesPayments(text), undefined, `payments library matched: ${text}`);
  }
});

test("one planning word no longer selects four specialists or raises the allowance", () => {
  const decision = route("lets plan first");
  assert.deepEqual(decision.archetypes, []);
  assert.deepEqual(decision.selected_modules, []);
  assert.ok(decision.question_budget < ARCHETYPE_QUESTION_BUDGET);
});

test("everyday uses of pay are not payments work", () => {
  for (const text of [
    "pay attention to the header spacing",
    "this refactor will pay off later",
    "pay down the tech debt in the upload helper first",
    // Safe before this change as well, because matching is on whole words.
    "inspect the payload of the request",
  ]) {
    assert.equal(matchesPayments(text), undefined, `payments library matched: ${text}`);
  }
});

test("a plan someone pays for still reaches the payments library", () => {
  for (const text of [
    "add a paid plan with monthly billing",
    "let users upgrade their subscription plan",
  ]) {
    assert.ok(matchesPayments(text), `payments library missed: ${text}`);
  }
});

test("payment phrases match without another payments word beside them", () => {
  const cases = [
    ["Add a paid plan", "paid plan"],
    ["Offer a free plan with three recordings a week", "free plan"],
    ["Handle plan upgrades in the middle of a month", "plan upgrade"],
    ["Let people upgrade their plan from the settings screen", "upgrade their plan"],
    ["Let people pay with UPI", "pay with"],
    ["Let parents pay for a course from the app", "pay for"],
    ["Add Apple Pay to the app", "apple pay"],
  ];
  for (const [text, phrase] of cases) {
    const match = matchesPayments(text);
    assert.ok(match, `payments library missed: ${text}`);
    assert.ok(
      match.matchedOn.includes(phrase),
      `${text} matched on ${JSON.stringify(match.matchedOn)}, not "${phrase}"`,
    );
  }
});

// Found while reviewing the same list. The plural helper turns "purchases" into
// "purcha" and leaves "purchase" whole, so the two never met: "Handle in-app
// purchases on Android" routed QUICK with no specialists, while the singular
// routed FULL. The list now names the plural, as it already does for payments
// and refunds.
test("purchases in the plural still reach the payments library", () => {
  for (const text of [
    "Restore purchases after reinstall",
    "Handle in-app purchases on Android",
  ]) {
    assert.ok(matchesPayments(text), `payments library missed: ${text}`);
  }
});

// Found by the first plugin eval on 2026-10-11. "Fix the button on the pricing
// page." routed FULL with six specialists and the twelve-question allowance,
// because bare "pricing" matched the payments library and "pricing page"
// matched the launch-surfaces library. The page was only where the button sat.
// The same layout fix on the about page routed QUICK.
test("a layout fix on the pricing page is not payments or launch work", () => {
  for (const text of [
    "Fix the button on the pricing page.",
    "The Buy button on the pricing page sits off-centre on phones.",
    "The plan cards in the pricing page overlap on small screens",
  ]) {
    const decision = route(text);
    assert.deepEqual(decision.archetypes, [], `archetype matched: ${text}`);
    assert.ok(["QUICK", "FOCUSED"].includes(decision.mode), `${text} routed ${decision.mode}`);
    assert.ok(decision.question_budget <= 4, `${text} allowed ${decision.question_budget} questions`);
    for (const module of ["security-privacy-abuse", "backend-api", "reliability-recovery"]) {
      assert.ok(!decision.selected_modules.includes(module), `${text} selected ${module}`);
    }
  }
  // The control the eval compared against.
  assert.equal(route("The Sign up button on the about page sits off-centre on phones.").mode, "QUICK");
});

test("changing what people pay still reaches the payments library", () => {
  const cases = [
    ["Change the Pro plan price from 499 to 599 rupees.", "pro plan"],
    ["Add a yearly plan with a discount to our pricing.", "yearly plan"],
    ["Raise the price of the annual plan for new users", "annual plan"],
    ["Charge users when they upgrade to the Pro plan", "pro plan"],
    ["Add a coupon field so students get 20% off", "coupon"],
    ["Show a price increase notice before the next renewal", "price increase"],
  ];
  for (const [text, phrase] of cases) {
    const match = matchesPayments(text);
    assert.ok(match, `payments library missed: ${text}`);
    assert.ok(
      match.matchedOn.includes(phrase),
      `${text} matched on ${JSON.stringify(match.matchedOn)}, not "${phrase}"`,
    );
  }
});

test("building a pricing page still reaches the launch-surfaces library", () => {
  for (const text of [
    "Create a pricing page that shows the three plans",
    "Make the pricing page show prices in rupees and dollars",
  ]) {
    assert.ok(
      route(text).archetypes.some((archetype) => archetype.id === "launch-surfaces"),
      `launch-surfaces library missed: ${text}`,
    );
  }
});

// The payments fault was general. An audit on 2026-09-20 aimed 36 everyday
// sentences at the six other libraries and all 36 matched, each with the
// twelve-question allowance: "do not push without asking" read as notification
// work, "write this post in my voice" as recording work, "rebuild the package"
// as a rollout across the app and the server. Of 1,094 prompts Shiva typed in
// 45 days, 146 matched some library, and most of those were everyday language.
// Each bare everyday word now has to arrive inside a phrase that names the
// product feature. The sentences below are the audit, kept as tests, beside
// plainly worded feature requests that must keep matching.
const libraryCases = {
  "notifications-messaging": {
    featureRequests: [
      "Send a weekly reminder email to people who have not recorded",
      "Add push notifications for new readings",
      "Send a nudge when someone has not recorded for three days",
      "Email a weekly digest of their recordings",
      "Notify users when a reading is ready",
    ],
    everydayLanguage: [
      "do not push without asking",
      "push the branch and open a pull request",
      "resync the developer payload digest",
      "alert me if the build fails",
      "nudge the button 2px to the left",
      "broadcast the change to the team in the standup notes",
      "verify and activate my non-blocking language reminder in Claude Code",
    ],
  },
  "llm-feature": {
    featureRequests: [
      "Add an assistant that summarises a recording",
      "Add an AI assistant to the app",
      "Use an LLM to tag each recording",
      "Build a chatbot for course questions",
      "Tighten the system prompt for the reading generator",
    ],
    everydayLanguage: [
      "summarise what you found in the repo",
      "summarize the diff for me",
      "spawn an agent to research this",
      "prompt the user to confirm before deleting",
      "the prompt hook is too noisy, quiet it down",
      "the assistant replied twice, check the transcript",
      "embedding a youtube video on the landing page",
      "check the user agent string in the request log",
      "search styleref mcp and agent skills and install it",
      "install this : npx assistant-ui@latest create --native my-app",
    ],
  },
  "mobile-capture-upload": {
    featureRequests: [
      "Build a voice recording pipeline for the app",
      "Add voice notes so people can record their thoughts",
      "Let people record audio in the background",
      "Ask for microphone permission before the first recording",
      "Let people upload a video from the camera roll",
    ],
    everydayLanguage: [
      "rewrite the landing copy in our brand voice",
      "write this post in my voice",
      "fix the three.js camera so it orbits the model",
      "slow the camera movement in the Kling prompt",
      "transcribe this youtube video and give me the key points",
      "here is a recording of the meeting, pull the action items",
      "Simulator Recording - iPhone 17 Pro.mp4 its still there",
    ],
  },
  "data-migration": {
    featureRequests: [
      "Migrate the recordings table to add an owner column and backfill it",
      "Run a database schema migration",
      "Write a migration that adds an owner to every recording",
      "Change the data model so every recording has an owner",
    ],
    everydayLanguage: [
      "make the pricing table a two column layout",
      "add FAQ schema markup to the blog page for SEO",
      "validate the task record against the JSON schema",
      "migrate the blog from CRA to Next",
      "migrate the site to Vercel",
      "write a plan for the migration",
    ],
  },
  "cross-system-rollout": {
    featureRequests: [
      "Redesign the onboarding flow across the app and server",
      "Rebuild the whole flow for recording and review",
      "Overhaul the app's home experience",
    ],
    everydayLanguage: [
      "rebuild the package and resync the digest",
      "rebuild the search index",
      "test it end to end before you report",
      "map the participant journey for the MDP",
      "design the onboarding courses for the young professional series",
      "overhaul the README",
    ],
  },
  authentication: {
    featureRequests: [
      "Add a sign up flow with email and OTP",
      "Let people sign in with Google",
    ],
    everydayLanguage: ["add a newsletter sign up form to the footer"],
  },
};

for (const [id, { featureRequests, everydayLanguage }] of Object.entries(libraryCases)) {
  const matched = (text) => route(text).archetypes.find((archetype) => archetype.id === id);

  test(`everyday language does not match the ${id} library`, () => {
    for (const text of everydayLanguage) {
      const hit = matched(text);
      assert.equal(hit, undefined, `${id} matched on ${JSON.stringify(hit?.matchedOn)}: ${text}`);
    }
  });

  test(`plainly worded feature requests still match the ${id} library`, () => {
    for (const text of featureRequests) {
      assert.ok(matched(text), `${id} missed: ${text}`);
    }
  });
}

// One everyday word used to be enough for the largest allowance. None of these
// sentences names a product feature, so none may receive it.
test("everyday sentences no longer receive the twelve-question allowance", () => {
  for (const text of [
    "do not push without asking",
    "summarise what you found in the repo",
    "write this post in my voice",
    "rebuild the package and resync the digest",
    "test it end to end before you report",
  ]) {
    const decision = route(text);
    assert.deepEqual(decision.archetypes, [], text);
    assert.ok(decision.question_budget < ARCHETYPE_QUESTION_BUDGET, `${text} received ${decision.question_budget}`);
  }
});

test("SMALL_SAFE stays silent", () => {
  const decision = route("Rename a local constant", { changedFiles: ["src/util.ts"] });
  assert.equal(decision.archetypes.length, 0);
});

test("the core library loads and every failure mode carries its evidence path", () => {
  const library = loadArchetypes();
  assert.ok(library.archetypes.length >= 4);
  assert.equal(library.vaultLoaded, false);
  for (const archetype of library.archetypes) {
    assert.ok(archetype.failureModes.length > 0, `${archetype.id} has no failure modes`);
    for (const mode of archetype.failureModes) {
      // Suppression is the load-bearing half: a failure mode without a place to
      // look would over-ask by construction.
      assert.ok(Array.isArray(mode.lookFor) && mode.lookFor.length > 0, `${archetype.id}:${mode.id} has no lookFor`);
      assert.ok(mode.why, `${archetype.id}:${mode.id} has no consequence`);
      assert.equal(mode.options.length >= 2, true);
      assert.ok(mode.recommended);
    }
  }
});

test("a vault archetype enriches and overrides the core, and absence is silent", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "so-arch-"));
  fs.writeFileSync(
    path.join(directory, "rehearsal-rhythm.json"),
    JSON.stringify({
      id: "rehearsal-rhythm",
      name: "Rehearsal rhythm corpus",
      matches: ["rhythm", "corpus"],
      modules: ["data-migrations"],
      failureModes: [
        {
          id: "partial-corpus",
          prompt: "If only part of the corpus loads, should we show it or wait?",
          why: "a partial view reads as data loss",
          options: [
            { label: "Show what loaded", consequence: "fast, can look wrong" },
            { label: "Wait for all", consequence: "correct, slower" },
          ],
          recommended: "Wait for all",
          lookFor: ["corpus"],
        },
      ],
    }),
  );
  const library = loadArchetypes({ vaultArchetypeDirectory: directory });
  assert.equal(library.vaultLoaded, true);
  assert.ok(detectArchetypes("fix the rhythm corpus", library).some((a) => a.id === "rehearsal-rhythm"));

  const absent = loadArchetypes({ vaultArchetypeDirectory: "/nonexistent/vault" });
  assert.equal(absent.vaultLoaded, false);
  assert.ok(absent.archetypes.length >= 4, "core must survive a missing vault");
});

test("the repository suppresses questions it already answers", () => {
  const library = loadArchetypes();
  const [capture] = detectArchetypes("build a voice recording pipeline", library);

  // Nothing found: every failure mode becomes a question.
  const none = archetypeDecisions([capture], { root: "/tmp", search: () => null });
  assert.equal(none.settled.length, 0);
  assert.equal(none.decisions.length, capture.failureModes.length);

  // Repository answers everything: nothing is asked, everything is disclosed.
  const all = archetypeDecisions([capture], { root: "/tmp", search: () => "src/upload.ts" });
  assert.equal(all.decisions.length, 0);
  assert.equal(all.settled.length, capture.failureModes.length);
  assert.equal(all.settled[0].evidence, "src/upload.ts");
});

test("archetype detection is deterministic and never writes to the vault", () => {
  const library = loadArchetypes();
  const runs = [0, 1, 2, 3].map(() =>
    detectArchetypes("build a voice recording pipeline", library).map((a) => a.id).join(","),
  );
  assert.equal(new Set(runs).size, 1);
  assert.equal(archetypePolicy.semanticSearch, false);
  assert.equal(archetypePolicy.writesToVault, false);
});
