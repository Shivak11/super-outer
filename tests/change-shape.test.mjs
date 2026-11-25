import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyChangeShape,
  applyDepthFloor,
  ACTIVATION_SHAPES,
  isRoutineRebuildOnly,
} from "../src/change-shape.mjs";

const shapeOf = (text, options) => classifyChangeShape(text, options).shape;
const activates = (text, options) => classifyChangeShape(text, options).activation;

test("a bounded new feature invokes activation at FOCUSED", () => {
  const result = classifyChangeShape("Build a new News feature for the app");
  assert.equal(result.shape, "new_feature");
  assert.equal(result.activation, true);
  assert.equal(result.depthFloor, "FOCUSED");
});

test("a major overhaul and a replacement both invoke at FULL", () => {
  for (const text of [
    "Overhaul the existing News retrieval pipeline",
    "Rebuild the recommendation screen from scratch",
    "Replace the current ranking service with a new provider pipeline",
    "Migrate off the old transcription vendor",
  ]) {
    const result = classifyChangeShape(text);
    assert.equal(result.activation, true, text);
    assert.equal(result.depthFloor, "FULL", `${text} -> ${result.depthFloor}`);
  }
});

test("coordinated work across two systems earns FULL even when worded as a small feature", () => {
  const result = classifyChangeShape(
    "Add a new feature in the mobile app backed by a new API endpoint",
  );
  assert.equal(result.shape, "coordinated_cross_system_change");
  assert.equal(result.depthFloor, "FULL");
  assert.ok(result.reasons.some((reason) => reason.startsWith("systems:")));
});

test("cross-repository coordination is recognised without naming two systems", () => {
  const result = classifyChangeShape("Ship an end-to-end feature coordinated across both repos");
  assert.equal(result.activation, true);
  assert.equal(result.depthFloor, "FULL");
});

// The brief's named false triggers. Each must stay silent.
test("maintenance phrasing never invokes activation", () => {
  for (const text of [
    "add a test",
    "Add some unit tests for the upload helper",
    "new variable",
    "rename feature flag",
    "update documentation",
    "refactor comments",
    "fix formatting",
    "Fix a typo in News copy",
    "A behaviour-preserving cleanup of the ranking module",
  ]) {
    assert.equal(activates(text), false, `should not activate: ${text}`);
    assert.equal(shapeOf(text), "maintenance", `should be maintenance: ${text}`);
  }
});

test("maintenance wins even when a protected domain is present", () => {
  // Renaming a payments flag is still a rename. Protected domains raise depth
  // through routing; they must not turn a rename into a feature launch.
  const result = classifyChangeShape("rename the payments feature flag", {
    protectedDomains: ["payments"],
  });
  assert.equal(result.shape, "maintenance");
  assert.equal(result.activation, false);
});

test("ordinary work with no feature shape stays out of the way", () => {
  for (const text of [
    "Adjust the padding on the settings row",
    "Investigate why the nightly job is slow",
  ]) {
    assert.equal(shapeOf(text), null, text);
    assert.equal(activates(text), false, text);
  }
});

test("a named audience is recorded as a reason", () => {
  const result = classifyChangeShape("Build a new onboarding feature for beta users");
  assert.ok(result.reasons.includes("named_audience"));
});

test("the depth floor raises but never lowers, and never disturbs the extremes", () => {
  assert.equal(applyDepthFloor("QUICK", "FOCUSED"), "FOCUSED");
  assert.equal(applyDepthFloor("QUICK", "FULL"), "FULL");
  // Never lowers.
  assert.equal(applyDepthFloor("FULL", "FOCUSED"), "FULL");
  // CRITICAL is never reduced; SMALL_SAFE is never promoted by this path.
  assert.equal(applyDepthFloor("CRITICAL", "FULL"), "CRITICAL");
  assert.equal(applyDepthFloor("SMALL_SAFE", "FULL"), "SMALL_SAFE");
  assert.equal(applyDepthFloor("QUICK", null), "QUICK");
});

test("every activation shape declares a floor, and maintenance is not one of them", () => {
  assert.deepEqual(Object.keys(ACTIVATION_SHAPES).sort(), [
    "coordinated_cross_system_change",
    "major_overhaul",
    "new_feature",
    "replacement",
  ]);
  assert.equal(ACTIVATION_SHAPES.maintenance, undefined);
});

// 5.7.0: requests worded with ordinary product nouns used to match nothing.
test("an editor, a dashboard and an admin panel are new features", () => {
  for (const text of [
    "Build a new writing editor where selecting a passage shows sources beside it",
    "Add a dashboard that shows weekly recordings",
    "Create an admin panel for the support team",
  ]) {
    const result = classifyChangeShape(text);
    assert.equal(result.shape, "new_feature", text);
    assert.equal(result.activation, true, text);
    assert.equal(result.depthFloor, "FOCUSED", text);
    assert.ok(result.reasons.includes("visible_surface"), text);
  }
});

test("an explicit redesign or replacement outranks a rename in the same request", () => {
  const redesign = classifyChangeShape("Redesign the folder screen and rename the tabs");
  assert.equal(redesign.shape, "major_overhaul");
  assert.equal(redesign.depthFloor, "FULL");
  assert.ok(redesign.reasons.includes("visible_surface"));
  assert.equal(shapeOf("Migrate off the old transcription vendor and rename the config keys"), "replacement");
});

test("a new-feature phrase or an incidental replace or rewrite inside a maintenance clause does not outrank it", () => {
  for (const text of [
    "rename the helper",
    "fix the typo in the header",
    "add tests for the new onboarding flow",
    "fix the typo by replacing teh with the",
    "update the docs and rewrite the comments",
  ]) {
    assert.equal(shapeOf(text), "maintenance", text);
    assert.equal(activates(text), false, text);
  }
});

test("build commands, agent-loop steps and database views are not new features", () => {
  for (const text of [
    "build the app and run the tests",
    "deploy the new build of the app",
    "add a tool call to the agent loop",
    "add tool use to the agent",
    "Create a materialized view for reporting",
    "add a database view for the leaderboard",
  ]) {
    assert.notEqual(shapeOf(text), "new_feature", text);
    assert.equal(activates(text), false, text);
  }
});

test("a tool or a view that people will use is still a new feature", () => {
  assert.equal(shapeOf("Add a tool that exports recordings as CSV"), "new_feature");
  assert.equal(shapeOf("Add a calendar view to the recordings page"), "new_feature");
});

test("a visible surface counts only when it is the thing being made or remade", () => {
  const reasons = (text) => classifyChangeShape(text).reasons;
  assert.ok(reasons("Replace the old editor with a block editor").includes("visible_surface"));
  assert.ok(reasons("Redesign the dashboard").includes("visible_surface"));
  // Here the dashboard is only where a small change is made, and the other two
  // things being built are not screens.
  assert.ok(!reasons("Add padding to the dashboard").includes("visible_surface"));
  assert.ok(!reasons("Build a new API endpoint for exports").includes("visible_surface"));
  assert.ok(!reasons("Add a tool that exports recordings as CSV").includes("visible_surface"));
  // Maintenance carries no other reason.
  assert.deepEqual(reasons("rename the dashboard tabs"), ["maintenance_phrase"]);
});

test("a routine rebuild does not outrank a maintenance phrase", () => {
  assert.equal(shapeOf("fix the lint errors and rebuild the bundle"), "maintenance");
  assert.equal(shapeOf("rename the helper and rebuild the search index"), "maintenance");
  // An explicit redesign still outranks the rename.
  assert.equal(shapeOf("Redesign the folder screen and rename the tabs"), "major_overhaul");
});

test("a place named after a 5.7.0 noun is not a new feature", () => {
  assert.equal(shapeOf("Add padding to the dashboard"), null);
  assert.equal(shapeOf("add a border to the editor panel"), null);
  assert.equal(shapeOf("Add a dashboard that shows weekly recordings"), "new_feature");
  assert.equal(shapeOf("Build a new writing editor where selecting a passage shows sources beside it"), "new_feature");
  // The nouns that classified requests before 5.7.0 keep their earlier result.
  assert.equal(shapeOf("Add padding to the settings screen"), "new_feature");
});

// 5.7.0 fix round. Each sentence below came from the independent failure
// scout's probes of the first 5.7.0 build.
test("a clause that builds something outranks a maintenance clause in the same request", () => {
  for (const text of [
    "Build a new onboarding screen and add tests for it",
    "Add a dashboard that shows weekly recordings and update the docs",
    "Create a new settings page and rename the old one",
    "Build a new editor and write tests for it",
    "Build a new inbox and fix the typo in the header",
    "Add a new checkout page, then update the readme",
  ]) {
    const result = classifyChangeShape(text);
    assert.equal(result.shape, "new_feature", text);
    assert.ok(result.reasons.includes("visible_surface"), text);
  }
});

test("a redesign or migration mentioned inside a maintenance clause stays maintenance", () => {
  for (const text of [
    "update the docs to describe the redesign",
    "fix the typo in the redesign notes",
    "fix the typo in the overhaul section of the readme",
    "update the changelog for the move from webpack to vite",
    "rename the config keys after we migrate from v1",
    "fix the formatting in the full redesign doc",
    "rename the rework branch",
    "add tests for the revamp of the parser",
    "update the readme to mention the switch from npm to pnpm",
    "write tests for the complete rewrite of the parser",
    "add a playwright test for the onboarding flow",
  ]) {
    assert.equal(shapeOf(text), "maintenance", text);
    assert.equal(activates(text), false, text);
  }
});

test("a routine rebuild is not an overhaul, and a rebuild of a product surface still is", () => {
  for (const text of [
    "rebuild the bundle",
    "rebuild the search index",
    "rebuild the docker image",
    "Can you rebuild the frontend bundle?",
    "please rebuild",
    "the build is broken, rebuild it",
    "rebuild the docs page",
    "rebuild the static page",
    "rebuild the screen reader labels",
    "rebuild the view when the filter changes",
    "make the dashboard rebuild its view when filters change",
    "rebuild the app",
  ]) {
    assert.notEqual(shapeOf(text), "major_overhaul", text);
    assert.equal(activates(text), false, text);
  }
  for (const text of ["Rebuild the admin panels", "Rebuild the home page in React", "Rebuild the app from scratch"]) {
    const result = classifyChangeShape(text);
    assert.equal(result.shape, "major_overhaul", text);
    assert.ok(result.reasons.includes("visible_surface"), text);
  }
});

test("developer meanings of the 5.7.0 nouns are not something people look at", () => {
  for (const text of [
    "add a Django view for the export endpoint",
    "create a view in postgres for the leaderboard",
    "add a new Flask view that returns JSON",
    "build a Grafana dashboard for API latency",
    "add a Datadog dashboard for the queue",
    "add a panel to the Grafana dashboard for error rates",
    "implement the inbox pattern for the outbox worker",
    "set up a new code editor config",
    "add a new view model for the recordings list",
    "add a dashboard endpoint that returns weekly totals",
    "build a dashboard API",
    "build the docs panel plugin",
    "the launch page flickers on startup",
  ]) {
    assert.ok(!classifyChangeShape(text).reasons.includes("visible_surface"), text);
  }
  assert.ok(classifyChangeShape("create a new SwiftUI view for the settings").reasons.includes("visible_surface"));
});

test("a screen asked for in everyday words, a new app or website, and plural surfaces are visible new work", () => {
  for (const text of [
    "I want a page where users can see their past recordings",
    "Can you put together a profile screen for users?",
    "Make a screen where students can see their scores",
    "I need a screen for uploading recordings",
    "Build me an app that lets students record mock interviews",
    "Build a website for my bakery",
    "Create a mobile app for recording voice notes",
    "Build a new webpage",
    "Build new dashboards for each team",
    "Build the settings pages",
    "Redesign the app",
    "Redesign the homepage",
    "Redesign the homescreen",
    "Redesign the editors",
  ]) {
    const result = classifyChangeShape(text);
    assert.ok(["new_feature", "major_overhaul"].includes(result.shape), `${text} -> ${result.shape}`);
    assert.ok(result.reasons.includes("visible_surface"), text);
  }
});

test("an app build, an app artefact or an app setting is not a new product", () => {
  for (const text of [
    "build an app for the simulator",
    "build an app bundle for the store",
    "build the app and run the tests",
    "create a new app password for gmail",
    "build a new app version for TestFlight",
    "deploy the new build of the app",
    "release the new app version to the store",
  ]) {
    assert.notEqual(shapeOf(text), "new_feature", text);
    assert.equal(activates(text), false, text);
  }
});

// From the independent verifier's review of the first fix round.
test("a rebuild of a named screen or page stays an overhaul when a build word comes first", () => {
  for (const text of [
    "Rebuild the web app dashboard for coaches",
    "Rebuild our app's onboarding flow",
    "Rebuild the tests page for students",
    "Rebuild the projects page so it shows recent activity first",
    "Rebuild the mobile app's home screen",
    "Rebuild the assets page where designers upload their files",
    "Rebuild the images gallery screen",
    "Rebuild the shipping labels screen",
  ]) {
    const result = classifyChangeShape(text);
    assert.equal(result.shape, "major_overhaul", text);
    assert.ok(result.reasons.includes("visible_surface"), text);
  }
  for (const text of ["rebuild the dist folder", "rebuild the app for release", "rebuild the static page"]) {
    assert.notEqual(shapeOf(text), "major_overhaul", text);
  }
});

test("a mention of the new thing, or a redesign ruled out, is not a request to build or redesign it", () => {
  for (const text of [
    "The new dashboard crashes when there is no data",
    "Investigate why the new editor is slow on long documents",
    "No new screens, just make the existing upload faster",
    "Bump the version and publish the new dashboard to staging",
    "Please don't redesign anything, just fix the crash on the profile screen",
  ]) {
    assert.equal(activates(text), false, text);
  }
  assert.equal(shapeOf("Build a new dashboard for coaches"), "new_feature");
});

// Found by comparing every labelled sentence with 5.6.4 after the second fix round.
test("rolling out the new screen, page or flow still asks the Safe Activation question", () => {
  for (const text of [
    "Roll out the new onboarding flow to beta users",
    "Release the new settings screen to staging",
    "Test the new upload screen with internal testers first",
    "Turn on the new recording flow for 10 percent of users",
    "Put the new home screen in front of beta users",
    "The new search flow should go to staging first",
  ]) {
    assert.equal(activates(text), true, text);
  }
});

test("a monitoring tool named as a style does not turn a customer dashboard into an engineering one", () => {
  for (const text of [
    "Build a new customer dashboard like the one in Grafana",
    "Add a PostHog-style analytics dashboard for our customers",
  ]) {
    assert.ok(classifyChangeShape(text).reasons.includes("visible_surface"), text);
  }
  assert.ok(!classifyChangeShape("build a Grafana dashboard for API latency").reasons.includes("visible_surface"));
});

test("a long run of white space does not slow the classifier", () => {
  const started = performance.now();
  classifyChangeShape(`Build a new reports page${" ".repeat(100000)}\t\t${"\n".repeat(20000)}now`);
  assert.ok(performance.now() - started < 1000, "classification took longer than a second");
});

// 5.8.0: Jev reads "rebuild" literally, so a routine rebuild that asks for no
// screen keeps the 5.7.0 answer. A rebuild of a named screen, a rebuild from
// scratch and a request that also asks for a page are not routine rebuilds.
test("a routine rebuild that asks for no screen is recognised, and a remake is not", () => {
  for (const text of [
    "rebuild the app",
    "rebuild the css",
    "rebuild the docs page",
    "rebuild the page after the data loads",
    "rebuild the app and run the tests",
    "please rebuild",
  ]) assert.equal(isRoutineRebuildOnly(text), true, text);
  for (const text of [
    "Rebuild the home page in React",
    "rebuild the onboarding from scratch with fewer steps",
    "Rebuild the admin panels",
    "rebuild the bundle and add a settings page",
    "Build a new writing editor",
    "fix the typo in the header",
    "the recompile step is slow",
  ]) assert.equal(isRoutineRebuildOnly(text), false, text);
});
