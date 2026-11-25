import assert from "node:assert/strict";
import test from "node:test";

import { routeTask, selectedModuleIds } from "../src/router.mjs";

// v5.10: a product owner describes demand in plain words ("50k users", "getting
// slow", "launch day"), not in the engineering vocabulary the specialist
// trigger lists were written in. Each sentence below routed to the lightest
// review with no specialist before 5.10.

const modulesFor = (description) => selectedModuleIds(routeTask({ description }));

const STATED_DEMAND = [
  "Build a chat app with realtime messaging for 50k users",
  "Our app needs to scale to millions of users",
  "The app is getting slow now that lots of people use it",
  "We expect a big spike in traffic when we launch on Product Hunt",
  "Handle lots of concurrent users in the chat service",
  "Our marketplace will have 1 lakh users by next year",
  "Build a multiplayer quiz game for 200 students at once",
];

for (const description of STATED_DEMAND) {
  test(`stated demand reaches the scale specialist: ${description}`, () => {
    const modules = modulesFor(description);
    assert.ok(modules.includes("scale-performance-cost"), `got ${modules.join(", ") || "none"}`);
    assert.notEqual(routeTask({ description }).mode, "SMALL_SAFE");
  });
}

test("a plural trigger matches like its singular", () => {
  assert.ok(modulesFor("Add background queues for image processing").includes("scale-performance-cost"));
});

test("something that must update live brings in backend and reliability", () => {
  for (const description of [
    "Add a live feed that updates when someone posts",
    "Build a chat app with realtime messaging for 50k users",
    "Build a multiplayer quiz game for 200 students at once",
  ]) {
    const modules = modulesFor(description);
    assert.ok(modules.includes("backend-api"), `${description}: ${modules.join(", ")}`);
    assert.ok(modules.includes("reliability-recovery"), `${description}: ${modules.join(", ")}`);
  }
});

test("an agent that remembers people brings in stored data as well as AI", () => {
  for (const description of [
    "Build me a study-buddy agent that remembers each student across the semester",
    "Add memory to my existing agent so it remembers each user",
  ]) {
    const modules = modulesFor(description);
    assert.ok(modules.includes("ai-llm"), `${description}: ${modules.join(", ")}`);
    assert.ok(modules.includes("data-migrations"), `${description}: ${modules.join(", ")}`);
  }
});

test("rate limiting is a security concern as well as a backend one", () => {
  const modules = modulesFor("Add rate limiting to the signup endpoint");
  assert.ok(modules.includes("security-privacy-abuse"), modules.join(", "));
  assert.ok(modules.includes("backend-api"), modules.join(", "));
});

// The same words inside a small visible fix are only where the fix happens.
const SMALL_FIXES = [
  "The chat bubble colour is wrong",
  "Fix the live badge alignment",
  "The upload button is off-centre on phones",
  "Fix the typo in our chat app",
  "Fix the button on the pricing page.",
  "Change the padding on the users page",
  "Show the number of users on the admin dashboard",
  "Fix the crash in our chat app when the keyboard opens",
];

for (const description of SMALL_FIXES) {
  test(`a small fix does not summon the scale specialist: ${description}`, () => {
    assert.equal(modulesFor(description).includes("scale-performance-cost"), false);
  });
}

test("the small visible fixes stay at the light review", () => {
  for (const description of SMALL_FIXES.slice(0, 5)) {
    assert.ok(["SMALL_SAFE", "QUICK"].includes(routeTask({ description }).mode), description);
  }
});
