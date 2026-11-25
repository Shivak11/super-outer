import assert from "node:assert/strict";
import test from "node:test";

import { readsAsFixOrTask, routeTask, selectedModuleIds, startsNewWork } from "../src/router.mjs";

// The independent verifier's false positives at 1c36d23. Each is a fix, a
// cosmetic change or a routine task that mentions a word the 5.10 rules look
// for. None of them may start the product brief or the story walk, and none
// may summon specialists for scale, live updates or remembering agents.

const route = (description) => routeTask({ description });
const NEW_KIND_MODULES = ["scale-performance-cost", "reliability-recovery", "data-migrations"];

const FIXES = [
  "Make the chat app icon bigger",
  "Launch the chat app in the simulator",
  "Create a release build of our chat app",
  "Our live scores widget shows the wrong font size",
  "The multiplayer lobby button is misaligned",
  "Fix the realtime chat bug",
  "Our agent remembers each user's name wrong",
  "Develop a fix for the simulation timeout",
  "Make a fix to the website footer",
  "Create a ticket about the app crash",
  "Create a PR for the app",
  "Rename the realtime toggle",
  "Develop a test for the app login",
];

for (const description of FIXES) {
  test(`a fix or routine task is not new work: ${description}`, () => {
    assert.equal(startsNewWork(route(description), description), false);
  });
}

for (const description of [
  "Make the chat app icon bigger",
  "Our live scores widget shows the wrong font size",
  "The multiplayer lobby button is misaligned",
  "Our agent remembers each user's name wrong",
  "Rename the realtime toggle",
  "Our app has 2 users",
  "Make the image scale to fit the card",
  "Add a Product Hunt badge to the footer",
  "Change the launch day banner colour",
]) {
  test(`a passing mention does not summon scale or live-update specialists: ${description}`, () => {
    const modules = selectedModuleIds(route(description));
    for (const id of NEW_KIND_MODULES) assert.equal(modules.includes(id), false, `${id} in ${modules.join(", ")}`);
  });
}

test("a fix to a simulation does not summon the scale specialist", () => {
  // "timeout" still brings in reliability, as it did before 5.10.
  assert.equal(selectedModuleIds(route("Develop a fix for the simulation timeout")).includes("scale-performance-cost"), false);
});

test("a fix keeps the sign-in route it had before 5.10", () => {
  const modules = selectedModuleIds(route("Develop a test for the app login"));
  assert.ok(modules.includes("security-privacy-abuse"), modules.join(", "));
});

test("real new work with the same words is still new work", () => {
  for (const description of [
    "Build a chat app with realtime messaging for 50k users",
    "Add a live feed that updates when someone posts",
    "Build a multiplayer quiz game for 200 students at once",
    "Add memory to the tutor bot so it remembers what each student struggled with last week",
    "Build me a study-buddy agent that remembers each student across the semester",
    "Build a traffic simulation for our city planning class",
    "Build me a simple to-do list app just for myself",
  ]) {
    assert.equal(startsNewWork(route(description), description), true, description);
  }
});

// The verifier's second pass (9a14be2): real new work that the first fix lost,
// including products whose names hold a fix word.
const NEW_WORK_WITH_HARD_WORDS = [
  "Build a multiplayer colour-matching game for kids",
  "Build a multiplayer quiz where the team with the wrong answer loses a life",
  "Players should see each other's moves in real time",
  "Make a crash reporting dashboard for our mobile apps",
  "Make a traffic simulation for my class with colour-coded roads",
  "Build me a bug tracker app for my team",
  "Create an online test app for students",
  "Make a typing test app for kids",
];

for (const description of NEW_WORK_WITH_HARD_WORDS) {
  test(`new work is still new work when it uses a hard word: ${description}`, () => {
    assert.equal(startsNewWork(route(description), description), true);
  });
}

test("a product named with a fix word is not read as a fix, so Jev can still find it", () => {
  // The word lists leave a plain "build a ... app" alone, because developers use
  // it for build commands ("build an app for the simulator"); Jev reads these.
  for (const description of [
    "Build a PR review bot for our repositories",
    "Build a ticket booking app for bus routes",
    "Build me a bug tracker app for my team",
    "Make a crash reporting dashboard for our mobile apps",
  ]) {
    assert.equal(readsAsFixOrTask(description), false, description);
  }
});

test("a screenshot is a task, and a small display count is not demand", () => {
  assert.equal(startsNewWork(route("Make a screenshot of the website"), "Make a screenshot of the website"), false);
  assert.equal(selectedModuleIds(route("Show 3 students at once in the grid")).includes("scale-performance-cost"), false);
});

// The verifier's third pass (d6c98e6).
test("a user count that only describes a banner is not demand", () => {
  const modules = selectedModuleIds(route("The 50k users banner text is cut off on mobile"));
  assert.equal(modules.includes("scale-performance-cost"), false, modules.join(", "));
  assert.equal(route("The 50k users banner text is cut off on mobile").mode, "QUICK");
});

test("a test product is not read as a task, so Jev can find it; a test for code is a task", () => {
  // The word lists name no app or website here, so they leave it to Jev.
  for (const description of ["Build a typing test for school kids", "Build an online test for students preparing for CAT"]) {
    assert.equal(readsAsFixOrTask(description), false, description);
  }
  assert.equal(readsAsFixOrTask("Develop a test for the app login"), true);
  assert.equal(readsAsFixOrTask("Write tests for the payment webhook"), true);
});

test("something that should update live is a live system", () => {
  const description = "The leaderboard should update live";
  assert.equal(startsNewWork(route(description), description), true);
});

test("editing a label is not a change to the screen element itself", () => {
  for (const description of ["Change the filter label to Status", "Add a missing space in the form label"]) {
    assert.equal(selectedModuleIds(route(description)).includes("product-ui-ux-motion"), false, description);
  }
});
