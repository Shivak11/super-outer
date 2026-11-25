import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { jevSeesNewWork } from "../src/jev/combine.mjs";
import { routeTask, startsNewWork } from "../src/router.mjs";

// The new-work judgement decides whether new work without a product brief is
// pointed at the story walk. Its held-out set and Jev's rule were frozen and
// committed before the one live run recorded here. A change to the words, the
// rule or the set moves these counts and has to be measured again, never
// adjusted here to pass.

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const { sentences } = read("./fixtures/jev/new-work-heldout.json");
const { measured, results } = read("./fixtures/jev/new-work-heldout-measured.json");

const count = (decide) => ({
  caught: sentences.filter((item) => item.new_work && decide(item)).length,
  wrongly_flagged: sentences.filter((item) => !item.new_work && decide(item)).length,
});
const words = (item) => startsNewWork(routeTask({ description: item.text }), item.text);
const jev = (item) => results[item.text].jev_new_work;

test("the held-out set is the one frozen before the run", () => {
  assert.equal(sentences.length, 40);
  assert.equal(sentences.filter((item) => item.new_work).length, 20);
  for (const item of sentences) assert.ok(results[item.text], `no recorded result for: ${item.text}`);
});

test("the word lists find new work as often as measured", () => {
  assert.deepEqual(count(words), measured.words);
});

test("Jev's recorded readings find new work as often as measured", () => {
  assert.deepEqual(count(jev), measured.jev);
});

test("Jev may add new work to the words and never remove it", () => {
  assert.deepEqual(count((item) => words(item) || jev(item)), measured.combined);
});

test("the frozen rule: deep, not a small adjustment, not code alone", () => {
  const reading = (choice, confidence, small = 0.1, code = 0.1) => ({
    depth: { choice, confidence },
    design: { small_adjustment: small, code_only: code },
  });
  assert.equal(jevSeesNewWork(reading("FULL", 0.9)), true);
  assert.equal(jevSeesNewWork(reading("CRITICAL", 0.5)), true);
  assert.equal(jevSeesNewWork(reading("FULL", 0.49)), false);
  assert.equal(jevSeesNewWork(reading("FOCUSED", 0.99)), false);
  assert.equal(jevSeesNewWork(reading("FULL", 0.9, 0.5)), false);
  assert.equal(jevSeesNewWork(reading("FULL", 0.9, 0.1, 0.5)), false);
  assert.equal(jevSeesNewWork(null), false);
});
