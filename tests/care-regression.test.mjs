// Routing changes are compared with the last release on the care they give,
// not only on accuracy (task-observer observation 178). Every labelled
// sentence was routed by the released 5.7.0 router (commit 1c073d9) and the
// result is kept as a fixture. Jev's answers from one live run of the shipped
// question set are kept as a second fixture, so these checks never reach the
// network. Accuracy is reported on the sets frozen before each run, apart from
// the sets that shaped the questions or the word rules (observation 179).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { routeTask } from "../src/router.mjs";
import { combineRoute, wordsDesign } from "../src/jev/combine.mjs";
import { readAnswers } from "../src/jev/reading.mjs";

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const sentences = read("./fixtures/routing/labelled-sentences.json").sentences;
const released = read("./fixtures/routing/released-5.7.0.json").routes;
const ORDER = ["SMALL_SAFE", "QUICK", "FOCUSED", "FULL", "CRITICAL"];

// Routes changed on purpose since 5.7.0, each checked against its labels. On
// 2026-10-11 bare "pricing" stopped matching the payments library, and a page
// or screen named only as a location ("the button on the pricing page") stopped
// matching its library. Each sentence below now agrees with every library label
// it carries at least as well as 5.7.0 did, and four that were wrong are right.
// The 5.7.0 fixture stays as released; a sentence leaves the frozen comparison
// only by being listed here with the route it now gets.
const REVIEWED_CHANGES = {
  "update the copy on the landing page": { mode: "QUICK", archetypes: [] },
  "fix the pricing page layout on mobile": { mode: "FULL", archetypes: ["launch-surfaces"] },
  "fix the bug on the admin page": { mode: "QUICK", archetypes: [] },
  "fix the crash on the help screen": { mode: "QUICK", archetypes: [] },
  "Create a pricing page that shows the three plans": { mode: "FULL", archetypes: ["launch-surfaces"] },
  "Add in-app help on the recording screen": { mode: "FULL", archetypes: ["help-and-release-notes"] },
  "Rename the old page to Legacy and create a brand new pricing page": { mode: "FULL", archetypes: ["launch-surfaces"] },
  "Update the copy on the pricing page": { mode: "QUICK", archetypes: [] },
  "Can you review the new pricing page before I ship it?": { mode: "FULL", archetypes: ["launch-surfaces"] },
  "Launch the new pricing page next week": { mode: "FULL", archetypes: ["launch-surfaces"] },
  // On 2026-10-12 (5.10) a trigger began to match its plural, rate limiting
  // began to bring in the security specialist, and stated demand ("Product
  // Hunt") began to bring in scale and backend. Each sentence below gains a
  // specialist its subject calls for: workers and branches, failure panels,
  // auth helpers in a module, a components folder, a request limit and a
  // launch spike. None changes its library, and only the workers sentence
  // changes depth (QUICK to FOCUSED, from the backend specialist).
  "rate limit to 100 requests per user per day": { mode: "QUICK", archetypes: [] },
  "wind down our app workers before deploy": { mode: "FOCUSED", archetypes: [] },
  "delete the old branches from remote": { mode: "QUICK", archetypes: [] },
  "Get ready for Product Hunt with a coming soon page": { mode: "FULL", archetypes: ["launch-surfaces"] },
  "create a grafana panel for upload failures": { mode: "QUICK", archetypes: [] },
  "move the auth helpers into their own module": { mode: "CRITICAL", archetypes: [] },
  "eslint plugin that flags any hardcoded hex colour in the components folder": { mode: "QUICK", archetypes: [] },
  // Also on 2026-10-12, a screen element a customer uses (a form, a filter, a
  // tab) began to bring in the product UI specialist even where the page or
  // panel is named only as its place. Depth and libraries are unchanged.
  "Add a form for users to submit feedback": { mode: "QUICK", archetypes: [] },
  "add a filter to the inbox": { mode: "QUICK", archetypes: [] },
  "add a new tab to the settings panel": { mode: "FOCUSED", archetypes: [] },
  // On 2026-10-22 (6.0, observation 0262) latency, slowness and timeout
  // wording began to bring in the observability specialist, so a slow or
  // timing-out change is checked for whether it can be seen in production.
  // Depth and libraries are unchanged.
  "build a Grafana dashboard for API latency": { mode: "FULL", archetypes: [] },
  "log the openai latency for every transcript call": { mode: "FOCUSED", archetypes: [] },
  "Investigate why the new editor is slow on long documents": { mode: "FOCUSED", archetypes: [] },
  "add a tab where users can browse past interview questions": { mode: "QUICK", archetypes: [] },
};

const labelMisses = (item, archetypeIds) =>
  Object.entries(item.archetypes ?? {}).filter(([id, expected]) => archetypeIds.includes(id) !== expected).length;

test("each reviewed change gets its new route and fits its labels at least as well as 5.7.0", () => {
  for (const [text, expected] of Object.entries(REVIEWED_CHANGES)) {
    const item = sentences.find((sentence) => sentence.text === text);
    assert.ok(item, `not a labelled sentence: ${text}`);
    const route = routeTask({ description: text });
    const archetypes = route.archetypes.map((archetype) => archetype.id);
    assert.equal(route.mode, expected.mode, text);
    assert.deepEqual(archetypes, expected.archetypes, text);
    assert.ok(labelMisses(item, archetypes) <= labelMisses(item, released[text].archetypes), text);
  }
});

test("the word lists alone still give every labelled sentence the route 5.7.0 gave", () => {
  assert.ok(sentences.length >= 600, `${sentences.length} sentences`);
  const changed = [];
  for (const item of sentences) {
    assert.ok(released[item.text], `no 5.7.0 route for: ${item.text}`);
    if (REVIEWED_CHANGES[item.text]) continue;
    const route = routeTask({ description: item.text });
    const before = released[item.text];
    if (route.mode !== before.mode || route.change_shape.activation !== before.activation
      || route.question_budget !== before.question_budget || wordsDesign(route) !== before.design_line
      || route.archetypes.map((archetype) => archetype.id).join() !== before.archetypes.join()
      || route.selected_modules.join() !== before.selected_modules.join()) changed.push(item.text);
  }
  assert.deepEqual(changed, []);
});

// Two configurations ship: 24 questions for most people, and 41 when the
// private record is kept, as on Shiva's computer. Each has its own live answers.
for (const [name, suffix] of [["24 questions", ""], ["41 questions, with the record", "-record"]]) {
  const recorded = read(`./fixtures/jev/recorded-answers${suffix}.json`);
  const MEASURED = read(`./fixtures/jev/measured${suffix}.json`);
  // The fixture keeps each answer as a number in a fixed key order, so it
  // stays small; this rebuilds the shape the API returns.
  const answersFor = (text) => {
    const values = recorded.answers[text];
    if (!values) return null;
    return Object.fromEntries(recorded.keys.map((key, index) => {
      const value = values[index];
      if (key === "depth") return [key, { type: "choice", choice: value[0], confidence: value[1] }];
      return [key, { type: "noul", noul: value }];
    }));
  };
  const judged = (item) => {
    const word = routeTask({ description: item.text });
    const reading = readAnswers(answersFor(item.text), { record: recorded.record });
    return { word, reading, combined: combineRoute({ route: word, reading, text: item.text }) };
  };

  test(`every labelled sentence has a valid recorded reading (${name})`, () => {
    for (const item of sentences) {
      assert.ok(readAnswers(answersFor(item.text), { record: recorded.record }), `no valid reading for: ${item.text}`);
    }
  });

  test(`with Jev's recorded answers no labelled sentence loses activation, depth or question allowance (${name})`, () => {
    const losses = [];
    for (const item of sentences) {
      if (REVIEWED_CHANGES[item.text]) continue;
      const { route } = judged(item).combined;
      const before = released[item.text];
      if (before.activation && !route.change_shape.activation) losses.push(`activation: ${item.text}`);
      if (ORDER.indexOf(route.mode) < ORDER.indexOf(before.mode)) losses.push(`depth ${before.mode} to ${route.mode}: ${item.text}`);
      if (route.question_budget < before.question_budget) losses.push(`allowance ${before.question_budget} to ${route.question_budget}: ${item.text}`);
      if (route.archetypes.map((archetype) => archetype.id).join() !== before.archetypes.join()) losses.push(`libraries changed: ${item.text}`);
    }
    assert.deepEqual(losses, []);
  });

  // The counts were measured when the fixture was recorded. A change to the
  // question set, the combining rule or the fixture moves them, and that change
  // has to be re-measured and reported, never adjusted here to pass.
  for (const [group, sets] of Object.entries(MEASURED.groups)) {
    test(`the design line is right as often as measured on ${group} (${name})`, () => {
      const labelled = sentences.filter((item) => typeof item.design === "boolean" && item.sets.some((set) => sets.includes(set)));
      const right = labelled.filter((item) => judged(item).combined.design.shown === item.design).length;
      assert.deepEqual({ right, of: labelled.length }, MEASURED.design[group]);
    });
  }
}
