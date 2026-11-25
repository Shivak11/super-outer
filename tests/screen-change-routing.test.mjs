import assert from "node:assert/strict";
import test from "node:test";

import { routeTask, selectedModuleIds } from "../src/router.mjs";

// v5.10: a change to an existing screen is what a customer sees, so the product
// UI specialist (and with it the assumption check in product-intent.md) joins
// it. Before 5.10 a page named after "to the" counted only as a place, and
// none of the screen elements below counted as a thing being changed.

const modulesFor = (description) => selectedModuleIds(routeTask({ description }));

for (const description of [
  "Add a filter to the orders page",
  "Add an empty state to the projects list",
  "Add a sort option to the orders list",
  "Add a search box to the members page",
  "Reorder the onboarding steps",
]) {
  test(`a change to what a customer sees brings in the product UI specialist: ${description}`, () => {
    assert.ok(modulesFor(description).includes("product-ui-ux-motion"), modulesFor(description).join(", "));
  });
}

for (const description of [
  "Add a filter to the orders API",
  "Add a sort option to the search endpoint",
  "Add a filter to the logs query",
  "Add a filter to the orders page with no UI changes",
]) {
  test(`a server-side or negated element stays out of the UI specialist: ${description}`, () => {
    assert.equal(modulesFor(description).includes("product-ui-ux-motion"), false, modulesFor(description).join(", "));
  });
}
