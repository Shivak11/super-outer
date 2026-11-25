import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadArchetypes, archetypeDecisions } from "../src/archetypes.mjs";
import { routeTask } from "../src/router.mjs";
import { auditQuestion } from "../src/question-audit.mjs";
import { ARCHETYPE_QUESTION_BUDGET, SPECIALIST_BY_ID } from "../src/constants.mjs";
import { partitionBySequence } from "../src/sequencing.mjs";

// 5.7.0 adds nine archetypes for the parts of a product's life that the first
// eight did not cover: starting from nothing, measuring use, staff tools,
// people's rights over their data, public pages and store listings, help and
// release notes, email delivery, teams and roles, and switching a product off.
//
// Another repository copies these names word for word, so a change to any of
// them has to be made in both places.
const LIFECYCLE_NAMES = {
  "new-product-setup": "Starting a new product with no code yet",
  "product-analytics": "Measuring what people do in the product",
  "admin-support-tools": "Tools the team uses to support customers",
  "data-rights": "People's rights over their own data",
  "launch-surfaces": "Public pages and store listings people see before they sign up",
  "help-and-release-notes": "Telling people how the product works and what changed",
  "email-deliverability": "Getting the product's email into inboxes",
  "teams-and-roles": "Teams, invitations and who can do what",
  retirement: "Switching off a feature or the whole product",
};
const LIFECYCLE_IDS = Object.keys(LIFECYCLE_NAMES);

const readArchetype = (id) =>
  JSON.parse(
    readFileSync(new URL(`../skills/super-outer/references/archetypes/${id}.json`, import.meta.url), "utf8"),
  );
const archetypes = LIFECYCLE_IDS.map(readArchetype);

const route = (text) => routeTask({ title: text, description: text });
const lifecycleMatches = (text) =>
  route(text).archetypes.filter((archetype) => LIFECYCLE_IDS.includes(archetype.id));

const SEQUENCE_RANK = { now: 0, decide: 1, defer: 2 };

// A match raises the question allowance to twelve, so a false match is
// expensive. Each library names product features in phrases, and every
// sentence below must keep behaving the way it does here. The everyday
// sentences are the kind of thing people type while working on any project:
// maintainers updating a changelog, developers restarting a server, someone
// inviting a colleague to a repository.
const lifecycleCases = {
  "new-product-setup": {
    featureRequests: [
      "I want to build an app that helps tutors schedule classes",
      "Build me an app for tracking my running club's races",
      "Help me choose a tech stack for a new booking product",
      "Start a new app for a bakery that takes online orders",
      "Build an MVP of a habit tracker",
      "I have an idea for an app that matches tutors with students",
      "Build a SaaS from scratch for small clinics",
      "Make me a website for my yoga studio",
      "Build a web app for my tuition centre",
    ],
    everydayLanguage: [
      "build the app and run it on the simulator",
      "start a new branch for the fix",
      "create a new app password for gmail",
      "what stack trace did it print",
      "write the helper again from scratch",
      "the app crashed on start",
      "build a new app version for TestFlight",
      "build an app for the simulator",
      "build an app for testing on the simulator",
      "build an app for release",
      "build an app that we can run in CI",
      "greenfield refactor of the parser",
    ],
  },
  "product-analytics": {
    featureRequests: [
      "Add product analytics so we can see which features people use",
      "Set up PostHog events for sign up and the first recording",
      "Track how many people finish onboarding each week",
      "Create a tracking plan for the new checkout",
      "Build a signup funnel so we can see where people stop",
      "Show daily active users and weekly active users on a chart",
    ],
    everydayLanguage: [
      "track down the bug in the upload helper",
      "keep track of the open pull requests",
      "fix the spacing on the analytics page",
      "check posthog for the crash",
      "the amplitude of the waveform is too low",
      "set up a remote tracking branch",
      "log into posthog and read the dashboard",
      "measure how many tokens the prompt uses",
      "track event listeners that leak memory",
      "we need to track event loop lag",
      "limit uploads to 10 per user per day",
      "rate limit to 100 requests per user per day",
      "cap exports at 5 per user per week",
      "instrument the app with OpenTelemetry traces",
    ],
  },
  "admin-support-tools": {
    featureRequests: [
      "Build an admin panel to look up customers and reset their limits",
      "Add an admin dashboard for the support team",
      "Let support staff view as a customer to see what went wrong",
      "Build a back office for approving refunds",
      "Add a moderation queue for reported posts",
      "Let staff impersonate a user to reproduce a bug",
    ],
    everydayLanguage: [
      "the admin role in this repo cannot push",
      "open the supabase dashboard",
      "log in as a test user and check the empty state",
      "ask the workspace admin to approve the connector",
      "the mcp client supports tool filtering",
      "support dark mode in the settings screen",
      "this is an internal tool, so keep it simple",
    ],
  },
  "data-rights": {
    featureRequests: [
      "Let people delete their account from settings",
      "Add an export my data button to the profile screen",
      "Handle account deletion requests",
      "Make the app GDPR compliant",
      "Let users download their data as a zip file",
      "We need to comply with the DPDP Act for users in India",
    ],
    everydayLanguage: [
      "delete the test account I made",
      "export the chart as png",
      "delete the old branches from remote",
      "download the data from the dashboard",
      "the delete request returns 404",
      "export the slides to pdf",
      "remove the data attribute from the div",
    ],
  },
  "launch-surfaces": {
    featureRequests: [
      "Build a landing page with a waitlist",
      "Create a pricing page that shows the three plans",
      "Write the App Store listing and screenshots",
      "Add a privacy policy page and a terms of service page to the website",
      "Fill in the privacy nutrition labels for the iOS release",
      "Get ready for Product Hunt with a coming soon page",
    ],
    everydayLanguage: [
      "launch the simulator",
      "launch a parallel agent to review the diff",
      "read the vendor's privacy policy before we sign up",
      "update the app store connect api key",
      "in terms of service quality the new host is better",
      "in terms of use cases, this covers most of them",
      "check the store for updates",
      "the launch page flickers on startup",
      "fix the launch page splash animation",
    ],
  },
  "help-and-release-notes": {
    featureRequests: [
      "Build a help centre with articles for common questions",
      "Add a what's new screen after each update",
      "Write release notes for users about the new editor",
      "Add in-app help on the recording screen",
      "Create a public changelog page on the website",
      "Add an FAQ page for new users",
    ],
    everydayLanguage: [
      "update the changelog",
      "write the release notes for the next version",
      "open the plugin help page",
      "print the help text for the cli",
      "what's new in react 19",
      "check the user guide for the bitwarden cli",
      "think about how to guide new users through setup",
      "decide what new screens onboarding needs",
    ],
  },
  "email-deliverability": {
    featureRequests: [
      "Our emails are going to spam, fix it",
      "Set up DKIM and DMARC for our sending domain",
      "Add an unsubscribe link to every marketing email",
      "Handle bounced emails from the email provider",
      "Separate transactional email from the newsletter",
      "Password reset emails end up in spam",
    ],
    everydayLanguage: [
      "resend the PR link",
      "the bounce animation on the button is too strong",
      "unsubscribe from the store listener in the effect",
      "test email validation on the sign up form",
      "send me an email when the build finishes",
      "the domain model needs a new field",
      "stop sending me so many notifications",
    ],
  },
  "teams-and-roles": {
    featureRequests: [
      "Let users invite teammates to their workspace",
      "Add roles and permissions for owners, admins and members",
      "Build team workspaces so companies can share recordings",
      "Make the app multi-tenant for schools",
      "Let an owner transfer ownership of the workspace",
      "Add seat based billing for teams",
    ],
    everydayLanguage: [
      "invite Rohan to the GitHub repo",
      "send me the meeting invite link",
      "accept the Slack workspace invite",
      "we are a small team",
      "use multiple agent teams if needed",
      "put this in the user role of the prompt",
      "transfer ownership of the repo to the organisation",
      "remove a member from the union type",
      "add the new crate to the workspace members",
      "list the workspace members in Cargo.toml",
      "add the package to the pnpm shared workspace",
      "open the shared workspace in VS Code",
    ],
  },
  retirement: {
    featureRequests: [
      "We are going to sunset the feature next month",
      "Shut down our app at the end of the year",
      "Retire this feature and tell people in advance",
      "Remove the app from the App Store and the Play Store",
      "Plan for shutting down our product in March",
      "Discontinue our app and refund annual subscribers",
    ],
    everydayLanguage: [
      "shut down the dev server",
      "the app shut down when I tapped record",
      "sunset colours on the hero gradient",
      "remove the app from the simulator",
      "download the app from the store",
      "retire the old feature flag",
      "deprecate the app router config",
      "the case describes how they shut down the business unit",
      "retire this feature flag",
      "sunset the feature flag for dark mode",
      "discontinue this feature flag",
      "retire this feature toggle",
      "shut down my app server",
      "shutting down my app gracefully on SIGTERM",
      "close down our app connections on exit",
      "wind down our app workers before deploy",
      "shut down our app process when tests finish",
      "handle shutting down our app in the signal handler",
      "remove the app from the app store connect build list",
    ],
  },
};

test("each lifecycle archetype has exactly the fields of the existing library", () => {
  for (const archetype of archetypes) {
    assert.deepEqual(Object.keys(archetype), ["id", "name", "matches", "modules", "failureModes"], archetype.id);
    assert.equal(archetype.name, LIFECYCLE_NAMES[archetype.id], `${archetype.id} name changed`);
    assert.ok(archetype.matches.length > 0, `${archetype.id} has no match phrases`);
    assert.ok(archetype.matches.every((phrase) => typeof phrase === "string" && phrase.trim() === phrase));
    assert.equal(new Set(archetype.modules).size, archetype.modules.length, `${archetype.id} repeats a module`);
    for (const moduleId of archetype.modules) {
      assert.ok(SPECIALIST_BY_ID[moduleId], `${archetype.id} names unknown module ${moduleId}`);
    }
  }
});

test("the loader reads all nine lifecycle archetypes beside the existing ones", () => {
  const library = loadArchetypes();
  for (const archetype of archetypes) {
    const loaded = library.archetypes.find((candidate) => candidate.id === archetype.id);
    assert.ok(loaded, `${archetype.id} was not loaded`);
    assert.equal(loaded.failureModes.length, archetype.failureModes.length, archetype.id);
  }
  assert.ok(library.archetypes.length >= 17);
});

// Order the interview by the cost of changing your mind: "now" first, then
// "decide". A "defer" item is recorded, never asked, so it comes last.
test("failure modes are ordered now, then decide, then defer", () => {
  for (const archetype of archetypes) {
    const count = archetype.failureModes.length;
    assert.ok(count >= 4 && count <= 6, `${archetype.id} has ${count} failure modes`);
    const ids = archetype.failureModes.map((mode) => mode.id);
    assert.equal(new Set(ids).size, ids.length, `${archetype.id} repeats a failure mode id`);
    let previous = 0;
    for (const mode of archetype.failureModes) {
      assert.ok(mode.sequence in SEQUENCE_RANK, `${archetype.id}:${mode.id} has sequence ${mode.sequence}`);
      assert.ok(SEQUENCE_RANK[mode.sequence] >= previous, `${archetype.id}:${mode.id} is out of order`);
      previous = SEQUENCE_RANK[mode.sequence];
    }
    assert.ok(
      archetype.failureModes.some((mode) => mode.sequence !== "defer"),
      `${archetype.id} would ask nothing`,
    );
  }
});

// The audit is applied at the router's render boundary. A blocking finding
// drops the question, and plain-english-questions.md says to rewrite whatever
// the advisory flags, so these questions carry neither.
test("every lifecycle question passes the mechanical audit with nothing to rewrite", () => {
  for (const archetype of archetypes) {
    for (const mode of archetype.failureModes) {
      const result = auditQuestion(mode);
      assert.deepEqual(result.blocking, [], `${archetype.id}:${mode.id} is blocked`);
      assert.deepEqual(result.advisory, [], `${archetype.id}:${mode.id} needs rewording`);
      assert.ok(mode.prompt.endsWith("?"), `${archetype.id}:${mode.id} is not a question`);
      assert.ok(mode.why, `${archetype.id}:${mode.id} has no consequence`);
    }
  }
});

test("every recommendation is exactly one of its own option labels", () => {
  for (const archetype of archetypes) {
    for (const mode of archetype.failureModes) {
      assert.ok(mode.options.length >= 2 && mode.options.length <= 3, `${archetype.id}:${mode.id} options`);
      const labels = mode.options.map((option) => option.label);
      assert.equal(new Set(labels).size, labels.length, `${archetype.id}:${mode.id} repeats a label`);
      assert.equal(
        labels.filter((label) => label === mode.recommended).length,
        1,
        `${archetype.id}:${mode.id} recommends "${mode.recommended}"`,
      );
      for (const option of mode.options) {
        assert.ok(option.consequence, `${archetype.id}:${mode.id} option "${option.label}" has no consequence`);
      }
    }
  }
});

// lookFor is searched with a case-insensitive fixed-string git grep, and one
// hit marks the question as already answered. A common word would hit some
// README and silence a question nobody has answered.
const TOO_COMMON_TO_SEARCH = new Set([
  "account", "admin", "backup", "data", "delete", "email", "export",
  "help", "invite", "privacy", "staging", "team", "test", "user",
]);

test("every failure mode says where to look and how the answer is proven", () => {
  for (const archetype of archetypes) {
    for (const mode of archetype.failureModes) {
      assert.ok(Array.isArray(mode.lookFor) && mode.lookFor.length > 0, `${archetype.id}:${mode.id} has no lookFor`);
      for (const needle of mode.lookFor) {
        assert.ok(needle.length >= 4, `${archetype.id}:${mode.id} searches for "${needle}"`);
        assert.ok(!TOO_COMMON_TO_SEARCH.has(needle.toLowerCase()), `${archetype.id}:${mode.id} searches for "${needle}"`);
      }
      assert.ok(
        typeof mode.provenBy === "string" && mode.provenBy.length > 10,
        `${archetype.id}:${mode.id} has no provenBy check`,
      );
    }
  }
});

// Built from character codes so that this file holds no dash characters itself.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

test("no lifecycle text contains an en dash or an em dash", () => {
  for (const archetype of archetypes) {
    const texts = [
      archetype.name,
      ...archetype.matches,
      ...archetype.failureModes.flatMap((mode) => [
        mode.prompt,
        mode.why,
        mode.recommended,
        mode.provenBy,
        ...mode.lookFor,
        ...mode.options.flatMap((option) => [option.label, option.consequence]),
      ]),
    ];
    for (const text of texts) {
      assert.doesNotMatch(text, DASHES, `${archetype.id}: ${text}`);
    }
  }
});

// The laws are named plainly so the owner knows why the question exists. The
// text states what the laws cover and gives no legal advice.
test("the data rights questions name the laws they come from", () => {
  const dataRights = archetypes.find((archetype) => archetype.id === "data-rights");
  const reasons = dataRights.failureModes.map((mode) => mode.why).join(" ");
  assert.match(reasons, /DPDP Act/);
  assert.match(reasons, /GDPR/);
});

// A single word may only be a term that already names the feature, such as an
// email standard or a privacy law. Everyday single words are what made the
// first libraries match "lets plan first" and "do not push without asking".
const SPECIFIC_SINGLE_TERMS = new Set([
  "backoffice", "ccpa", "deliverability", "dkim", "dmarc", "dpdp", "dsar",
  "gdpr", "greenfield", "multitenant",
]);

test("match phrases name a product feature, never a bare everyday word", () => {
  for (const archetype of archetypes) {
    for (const phrase of archetype.matches) {
      const words = phrase.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
      if (words.length === 1) {
        assert.ok(SPECIFIC_SINGLE_TERMS.has(words[0]), `${archetype.id} matches the bare word "${phrase}"`);
      }
    }
  }
});

for (const [id, { featureRequests, everydayLanguage }] of Object.entries(lifecycleCases)) {
  test(`plainly worded feature requests match the ${id} library`, () => {
    assert.ok(featureRequests.length >= 5);
    for (const text of featureRequests) {
      assert.ok(
        lifecycleMatches(text).some((archetype) => archetype.id === id),
        `${id} missed: ${text}`,
      );
    }
  });

  test(`everyday language does not match the ${id} library`, () => {
    assert.ok(everydayLanguage.length >= 6);
    for (const text of everydayLanguage) {
      const hit = lifecycleMatches(text).find((archetype) => archetype.id === id);
      assert.equal(hit, undefined, `${id} matched on ${JSON.stringify(hit?.matchedOn)}: ${text}`);
    }
  });
}

test("no everyday sentence matches any of the nine lifecycle libraries", () => {
  for (const text of Object.values(lifecycleCases).flatMap((cases) => cases.everydayLanguage)) {
    const hits = lifecycleMatches(text);
    assert.deepEqual(
      hits.map((archetype) => `${archetype.id}: ${archetype.matchedOn.join(", ")}`),
      [],
      text,
    );
  }
});

test("a lifecycle feature request receives the twelve-question allowance", () => {
  for (const { featureRequests } of Object.values(lifecycleCases)) {
    for (const text of featureRequests) {
      assert.equal(route(text).question_budget, ARCHETYPE_QUESTION_BUDGET, text);
    }
  }
});

test("maintenance work on a lifecycle surface never summons its archetype", () => {
  for (const text of [
    "Rename the admin panel component",
    "Fix a typo on the landing page",
    "Reorder the help centre articles",
    "Tidy the unsubscribe link styles",
    "Rename the team workspace table",
    "Add tests for the new pricing page",
  ]) {
    assert.deepEqual(lifecycleMatches(text), [], text);
  }
});

test("a deferred lifecycle item reaches the ledger, not the interview", () => {
  const help = loadArchetypes().archetypes.find((archetype) => archetype.id === "help-and-release-notes");
  const { decisions } = archetypeDecisions([help], { root: null });
  const { ask, deferred } = partitionBySequence(decisions);
  assert.ok(deferred.some((decision) => decision.id.endsWith("fresh-screenshots")));
  assert.ok(!ask.some((decision) => decision.id.endsWith("fresh-screenshots")));
  assert.equal(ask.length, help.failureModes.length - 1);
});
