// The line rules are adapted from Super-outer Experimental's tests/route-check.test.mjs (the comparison and the line).
import assert from "node:assert/strict";
import test from "node:test";

import { ARCHETYPE_QUESTION_BUDGET, QUESTION_BUDGETS } from "../src/constants.mjs";
import { CARE_LINES, DESIGN_SHAPES, LIMITS, combineRoute, jevDesign, wordsDesign } from "../src/jev/combine.mjs";
import { DEPTHS, LIBRARIES } from "../src/jev/questions.mjs";
import { routeTask } from "../src/router.mjs";

// Every route handed to combineRoute here is frozen all the way down, so any
// change to it throws instead of passing silently.
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
};
const copyOf = (value) => JSON.parse(JSON.stringify(value));
const wordRoute = (description) => deepFreeze(routeTask({ description }));
// A word route edited for a case the router does not produce from a short
// sentence, such as a QUICK route that matched a library.
const editedRoute = (description, change) => deepFreeze({ ...copyOf(routeTask({ description })), ...change });

const YES = Object.freeze({ surface_made: 0.97, small_adjustment: 0.06, screens_unchanged: 0.02, developer_artefact: 0.03, code_only: 0.02 });
const NO = Object.freeze({ surface_made: 0.08, small_adjustment: 0.96, screens_unchanged: 0.03, developer_artefact: 0.04, code_only: 0.05 });
const reading = ({ design = YES, protectedReading = 0.05, depth = "FOCUSED", confidence = 0.6, libraries = {} } = {}) => ({
  design: { ...design },
  protected: protectedReading,
  depth: { choice: depth, confidence },
  libraries: { ...Object.fromEntries(LIBRARIES.map(([id]) => [id, 0.6])), ...libraries },
});
const names = (result) => result.lines.map(({ name }) => name);

test("the limits are the study's and the route check's numbers, and both care lines are shown by default", () => {
  assert.deepEqual(LIMITS, {
    designAtLeast: 0.5,
    libraryFalseMatchAtOrBelow: 0.2,
    protectedAtOrAbove: 0.8,
    depthConfidenceAtOrAbove: 0.8,
    depthSteps: 2,
  });
  assert.deepEqual(CARE_LINES, { protected: true, depth: true });
  assert.deepEqual(DESIGN_SHAPES, ["new_feature", "major_overhaul", "replacement", "coordinated_cross_system_change"]);
});

test("Jev's answers show the design line when surface_made is at least 0.5 and the other four are each below 0.5", () => {
  assert.equal(jevDesign(reading()), true);
  assert.equal(jevDesign(reading({ design: { ...YES, surface_made: 0.5 } })), true);
  assert.equal(jevDesign(reading({ design: { ...YES, surface_made: 0.49 } })), false);
  for (const key of ["small_adjustment", "screens_unchanged", "developer_artefact", "code_only"]) {
    assert.equal(jevDesign(reading({ design: { ...YES, [key]: 0.5 } })), false, `${key} at 0.5`);
    assert.equal(jevDesign(reading({ design: { ...YES, [key]: 0.49 } })), true, `${key} at 0.49`);
  }
  assert.equal(jevDesign(reading({ design: NO })), false);
  assert.equal(jevDesign(null), false);
  assert.equal(jevDesign({}), false);
});

test("the word lists show the design line when the product UI specialist is selected and the change shape is one of the four", () => {
  assert.equal(wordsDesign(wordRoute("Build a new writing editor where selecting a passage shows sources beside it")), true);
  assert.equal(wordsDesign(wordRoute("add padding to the settings screen")), true);
  assert.equal(wordsDesign(wordRoute("design the empty state screen for first-time users")), false, "the specialist without a shape");
  assert.equal(wordsDesign({ selected_modules: ["frontend-client"], change_shape: { shape: "new_feature" } }), false, "a shape without the specialist");
  assert.equal(wordsDesign({ selected_modules: ["product-ui-ux-motion"], change_shape: { shape: "maintenance" } }), false);
  assert.equal(wordsDesign(null), false);
});

test("with no reading the route is the word router's own, in a new object, and the line follows the word lists", () => {
  for (const [description, words] of [
    ["Build a new writing editor where selecting a passage shows sources beside it", true],
    ["design the empty state screen for first-time users", false],
  ]) {
    const route = wordRoute(description);
    const result = combineRoute({ route, reading: null, text: description });
    assert.deepEqual(result.route, route);
    assert.notEqual(result.route, route);
    assert.deepEqual(result.design, { shown: words, source: "words", jev: null, words, guard: false });
    assert.deepEqual(result.lines, []);
  }
});

test("a yes for a request the word lists miss shows the line and brings the new-feature shape with the Safe Activation question", () => {
  const text = "design the empty state screen for first-time users";
  const route = wordRoute(text);
  const result = combineRoute({ route, reading: reading(), text });
  const expected = copyOf(route);
  expected.change_shape = { shape: "new_feature", activation: true, depth_floor: "FOCUSED", reasons: ["jev_design"] };
  expected.signals = ["jev:design", "surface:visibleProduct"];
  assert.deepEqual(result.route, expected);
  assert.deepEqual(result.design, { shown: true, source: "jev", jev: true, words: false, guard: false });
  assert.deepEqual(result.lines, []);
});

test("a yes on a QUICK route with no specialist adds the product UI specialist with its own score and raises the route to FOCUSED", () => {
  const text = "build a ChatGPT extension that helps me write LinkedIn posts";
  const route = wordRoute(text);
  assert.deepEqual([route.mode, route.question_budget, route.selected_modules, route.change_shape.shape], ["QUICK", 2, [], null]);
  const result = combineRoute({ route, reading: reading(), text });
  const expected = copyOf(route);
  expected.selected_modules = ["product-ui-ux-motion"];
  expected.scores = { "product-ui-ux-motion": { score: 0, reasons: ["inferred:jev_design"] } };
  expected.signals = ["jev:design", "surface:visibleProduct"];
  expected.change_shape = { shape: "new_feature", activation: true, depth_floor: "FOCUSED", reasons: ["jev_design"] };
  expected.mode = "FOCUSED";
  expected.material = true;
  expected.question_budget = QUESTION_BUDGETS.FOCUSED;
  assert.deepEqual(result.route, expected);
});

test("a yes that replaces a maintenance shape keeps the word router's reasons and appends the specialist after the others", () => {
  const text = "rename the recordings helper";
  const route = wordRoute(text);
  assert.deepEqual([route.mode, route.change_shape.shape, route.selected_modules], ["QUICK", "maintenance", ["architecture-maintainability"]]);
  const result = combineRoute({ route, reading: reading(), text });
  assert.deepEqual(result.route.selected_modules, ["architecture-maintainability", "product-ui-ux-motion"]);
  assert.deepEqual(result.route.change_shape, {
    shape: "new_feature",
    activation: true,
    depth_floor: "FOCUSED",
    reasons: ["maintenance_phrase", "jev_design"],
  });
  assert.deepEqual(result.route.signals, ["jev:design", "surface:sharedArchitecture", "surface:visibleProduct"]);
  assert.deepEqual([result.route.mode, result.route.question_budget], ["FOCUSED", 4]);
});

test("a yes keeps a change shape that already brings the activation question, and never replaces the higher floor it carries", () => {
  for (const text of ["Rebuild the home page in React", "Redesign the onboarding flow", "Rebuild the admin panels"]) {
    const route = wordRoute(text);
    assert.equal(route.mode, "FULL", text);
    const result = combineRoute({ route, reading: reading(), text });
    const expected = copyOf(route);
    expected.signals = [...new Set([...route.signals, "jev:design", "surface:visibleProduct"])].sort();
    assert.deepEqual(result.route, expected, text);
    assert.equal(result.design.shown, true, text);
  }
});

test("with a library matched, a raised route keeps the larger allowance, computed as the router computes it", () => {
  const route = editedRoute("make the invite teammates page friendlier", { mode: "QUICK", question_budget: ARCHETYPE_QUESTION_BUDGET });
  assert.equal(route.archetypes.length, 1);
  const result = combineRoute({ route, reading: reading(), text: "make the invite teammates page friendlier" });
  assert.deepEqual([result.route.mode, result.route.question_budget], ["FOCUSED", Math.max(QUESTION_BUDGETS.FOCUSED, ARCHETYPE_QUESTION_BUDGET)]);
  assert.deepEqual(result.route.archetypes, route.archetypes);
});

const SENTENCES = [
  "design the empty state screen for first-time users",
  "build a ChatGPT extension that helps me write LinkedIn posts",
  "make a ghostwriter plugin for chatgpt",
  "build a chrome extension that rewrites my emails",
  "I want a macOS menu bar app that records voice notes",
  "create a mac app for journaling",
  "Build a new writing editor where selecting a passage shows sources beside it",
  "add padding to the settings screen",
  "Add a pricing plan picker to the checkout page",
  "refund the duplicate stripe charge for the customer",
  "Rebuild the home page in React",
  "Rebuild the admin panels",
  "Redesign the onboarding flow",
  "rename the recordings helper",
  "change the retry rule in the upload endpoint",
  "make the invite teammates page friendlier",
  "tweak the push notification copy",
  "add an AI summary card",
  "let's make the recording flow feel calmer, it's too busy right now",
  "Add a dashboard that shows weekly recordings and update the docs",
  "rebuild the bundle and add a settings page",
  "rebuild the app",
];

test("a yes never lowers depth, the allowance or the specialists, and never adds or removes a library", () => {
  let raised = 0;
  for (const text of SENTENCES) {
    const route = wordRoute(text);
    const result = combineRoute({ route, reading: reading({ libraries: Object.fromEntries(LIBRARIES.map(([id]) => [id, 0.01])) }), text });
    assert.ok(DEPTHS.indexOf(result.route.mode) >= DEPTHS.indexOf(route.mode), text);
    assert.ok(result.route.question_budget >= route.question_budget, text);
    assert.deepEqual(result.route.selected_modules.slice(0, route.selected_modules.length), route.selected_modules, text);
    assert.deepEqual(result.route.archetypes, route.archetypes, text);
    for (const [id, entry] of Object.entries(route.scores)) assert.deepEqual(result.route.scores[id], entry, text);
    if (result.route.mode !== route.mode) raised += 1;
  }
  assert.ok(raised >= 3, "some QUICK routes were raised, so the comparison above was not empty");
});

test("a no changes nothing but the design line, even for a request the word lists send down the design path", () => {
  for (const text of [
    "add padding to the settings screen",
    "Build a new writing editor where selecting a passage shows sources beside it",
    "change the retry rule in the upload endpoint",
    "make the invite teammates page friendlier",
  ]) {
    const route = wordRoute(text);
    const result = combineRoute({ route, reading: reading({ design: NO }), text });
    assert.deepEqual(result.route, route, text);
    assert.deepEqual(result.design, { shown: false, source: "jev", jev: false, words: wordsDesign(route), guard: false }, text);
  }
});

test("a SMALL_SAFE route is never touched: the reading is not used and no line is added", () => {
  const text = "fix the typo in the readme";
  const route = wordRoute(text);
  assert.equal(route.mode, "SMALL_SAFE");
  const loud = reading({ protectedReading: 0.99, depth: "CRITICAL", confidence: 0.99, libraries: Object.fromEntries(LIBRARIES.map(([id]) => [id, 0.01])) });
  const result = combineRoute({ route, reading: loud, text });
  assert.deepEqual(result.route, route);
  assert.deepEqual(result.design, { shown: false, source: "words", jev: null, words: false, guard: false });
  assert.deepEqual(result.lines, []);
});

test("a yes never changes a CRITICAL route's depth or allowance", () => {
  for (const text of ["Add a pricing plan picker to the checkout page", "refund the duplicate stripe charge for the customer"]) {
    const route = wordRoute(text);
    assert.equal(route.mode, "CRITICAL", text);
    const result = combineRoute({ route, reading: reading(), text });
    assert.deepEqual([result.route.mode, result.route.question_budget, result.route.material], ["CRITICAL", route.question_budget, true], text);
    assert.equal(result.design.shown, true, text);
  }
});

test("the rebuild guard sets a yes aside for a routine rebuild and leaves a real remake alone", () => {
  for (const text of ["rebuild the app", "rebuild the css"]) {
    const route = wordRoute(text);
    const result = combineRoute({ route, reading: reading(), text });
    assert.deepEqual(result.design, { shown: false, source: "jev", jev: true, words: false, guard: true }, text);
    assert.deepEqual(result.route, route, text);
  }
  for (const text of ["Rebuild the home page in React", "rebuild the bundle and add a settings page"]) {
    const result = combineRoute({ route: wordRoute(text), reading: reading(), text });
    assert.deepEqual([result.design.shown, result.design.guard], [true, false], text);
  }
  // The guard is about Jev's reading, so it is not applied when there is none.
  assert.equal(combineRoute({ route: wordRoute("rebuild the app"), reading: null, text: "rebuild the app" }).design.guard, false);
});

test("a matched library that Jev reads at 0.20 or lower gets a false-match line naming the checklist and the words that matched", () => {
  const text = "make the invite teammates page friendlier";
  const route = wordRoute(text);
  assert.deepEqual(route.archetypes.map(({ id, matchedOn }) => [id, matchedOn]), [["teams-and-roles", ["invite teammates"]]]);
  const at = combineRoute({ route, reading: reading({ design: NO, libraries: { "teams-and-roles": 0.2 } }), text });
  assert.deepEqual(at.lines, [
    {
      name: "library_false_match",
      text: 'Jev reads the Teams, invitations and who can do what checklist as a likely false match for this request (0.20). The word lists matched it on "invite teammates". The request is read before any question is spent on it.',
    },
  ]);
  assert.deepEqual(at.route, route, "the library stays and so does the allowance");
  const above = combineRoute({ route, reading: reading({ design: NO, libraries: { "teams-and-roles": 0.21 } }), text });
  assert.deepEqual(above.lines, []);
});

test("several matched words are each quoted, and a library the reading does not cover gets no line", () => {
  const route = deepFreeze({
    ...copyOf(wordRoute("change the retry rule in the upload endpoint")),
    archetypes: [
      { id: "payments-subscription", name: "Payments and subscriptions", matchedOn: ["checkout", "pricing plan", "pricing"] },
      { id: "video-calls", name: "Video calls", matchedOn: ["call"] },
    ],
  });
  const result = combineRoute({ route, reading: reading({ design: NO, libraries: { "payments-subscription": 0.03 } }), text: "change the retry rule" });
  assert.deepEqual(result.lines.map(({ text }) => text), [
    'Jev reads the Payments and subscriptions checklist as a likely false match for this request (0.03). The word lists matched it on "checkout", "pricing plan", "pricing". The request is read before any question is spent on it.',
  ]);
});

test("on a CRITICAL route a false library match and a protected reading give no line, because they would argue for less care", () => {
  const text = "Add a pricing plan picker to the checkout page";
  const result = combineRoute({
    route: wordRoute(text),
    reading: reading({ design: NO, protectedReading: 0.97, depth: "CRITICAL", confidence: 0.99, libraries: { "payments-subscription": 0.02 } }),
    text,
  });
  assert.deepEqual(result.lines, []);
});

test("a protected reading of 0.80 or more on a route below CRITICAL gets a line naming the route's depth", () => {
  const text = "change the retry rule in the upload endpoint";
  const route = wordRoute(text);
  assert.equal(route.mode, "FOCUSED");
  const at = combineRoute({ route, reading: reading({ design: NO, protectedReading: 0.8 }), text });
  assert.deepEqual(at.lines, [
    {
      name: "protected_missed",
      text: "Jev reads this request as touching payments, sign-in or secrets, production delivery, stored data that cannot be restored, or git history (0.80), and the route is FOCUSED. That boundary is checked before any change.",
    },
  ]);
  assert.deepEqual(at.route, route);
  assert.deepEqual(names(combineRoute({ route, reading: reading({ design: NO, protectedReading: 0.79 }), text })), []);
  assert.deepEqual(names(combineRoute({ route, reading: reading({ design: NO, protectedReading: 0.9 }), text, careLines: { protected: false } })), []);
});

test("the protected line names the depth of the route the session is given, after a yes has raised it", () => {
  const text = "build a ChatGPT extension that helps me write LinkedIn posts";
  const result = combineRoute({ route: wordRoute(text), reading: reading({ protectedReading: 0.9 }), text });
  assert.deepEqual(names(result), ["protected_missed"]);
  assert.ok(result.lines[0].text.includes("the route is FOCUSED"), result.lines[0].text);
});

test("a depth two or more steps above the route, at confidence 0.80 or more, gets a line", () => {
  const text = "change the empty state text on the recordings list";
  const route = wordRoute(text);
  assert.equal(route.mode, "QUICK");
  const at = combineRoute({ route, reading: reading({ design: NO, depth: "FULL", confidence: 0.8 }), text });
  assert.deepEqual(at.lines, [
    {
      name: "depth_higher",
      text: "Jev reads this request as needing FULL review (confidence 0.80), above the QUICK route. Super-outer weighs whether the work needs more review than the route gives it before any change.",
    },
  ]);
  assert.deepEqual(at.route, route);
  assert.deepEqual(names(combineRoute({ route, reading: reading({ design: NO, depth: "CRITICAL", confidence: 0.9 }), text })), ["depth_higher"]);
  assert.deepEqual(names(combineRoute({ route, reading: reading({ design: NO, depth: "FULL", confidence: 0.79 }), text })), []);
  assert.deepEqual(names(combineRoute({ route, reading: reading({ design: NO, depth: "FOCUSED", confidence: 0.95 }), text })), []);
  assert.deepEqual(names(combineRoute({ route, reading: reading({ design: NO, depth: "FULL", confidence: 0.9 }), text, careLines: { depth: false } })), []);
});

test("the depth line is measured against the raised route: after a yes lifts QUICK to FOCUSED, FULL is one step above and gets no line", () => {
  const text = "build a ChatGPT extension that helps me write LinkedIn posts";
  const route = wordRoute(text);
  assert.equal(route.mode, "QUICK");
  assert.deepEqual(names(combineRoute({ route, reading: reading({ depth: "FULL", confidence: 0.95 }), text })), []);
  const critical = combineRoute({ route, reading: reading({ depth: "CRITICAL", confidence: 0.95 }), text });
  assert.deepEqual(names(critical), ["depth_higher"]);
  assert.ok(critical.lines[0].text.includes("above the FOCUSED route"), critical.lines[0].text);
});

test("the lines come in a fixed order, each in one paragraph with no dashes, and none of them changes the route", () => {
  const text = "make the invite teammates page friendlier";
  const route = editedRoute(text, { mode: "QUICK", question_budget: ARCHETYPE_QUESTION_BUDGET });
  const result = combineRoute({
    route,
    reading: reading({ design: NO, protectedReading: 0.92, depth: "FULL", confidence: 0.9, libraries: { "teams-and-roles": 0.04 } }),
    text,
  });
  assert.deepEqual(names(result), ["library_false_match", "protected_missed", "depth_higher"]);
  assert.deepEqual(result.route, route);
  for (const { text: line } of result.lines) {
    assert.equal(/[\u2013\u2014]/.test(line), false, line);
    assert.equal(line.includes("\n"), false, line);
  }
});

test("the route passed in is never changed, whatever the reading", () => {
  for (const text of ["design the empty state screen for first-time users", "rename the recordings helper", "rebuild the app", "fix the typo in the readme"]) {
    const unfrozen = routeTask({ description: text });
    const before = JSON.stringify(unfrozen);
    for (const given of [null, reading(), reading({ design: NO, protectedReading: 0.95, depth: "CRITICAL", confidence: 0.95 })]) {
      const result = combineRoute({ route: unfrozen, reading: given, text });
      assert.notEqual(result.route, unfrozen, text);
      result.route.selected_modules.push("changed-afterwards");
      result.route.signals.push("changed-afterwards");
    }
    assert.equal(JSON.stringify(unfrozen), before, text);
  }
});
