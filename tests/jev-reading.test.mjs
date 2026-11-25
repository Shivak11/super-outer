// The answer checks are adapted from Super-outer Experimental's tests/route-check.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";

import { AREAS, DESIGN_KEYS, DOMAINS, LIBRARIES, areaKey, domainKey, libraryKey } from "../src/jev/questions.mjs";
import { readAnswers } from "../src/jev/reading.mjs";
import { answerFixture } from "./helpers/jev-server.mjs";

const rawAnswers = () => answerFixture("design-yes").answers;

const REQUIRED_WITHOUT_RECORD = [...DESIGN_KEYS, "protected", "depth", ...LIBRARIES.map(([id]) => libraryKey(id))];
const REQUIRED_ONLY_WITH_RECORD = ["maintenance", ...AREAS.map(({ id }) => areaKey(id)), ...DOMAINS.map(([id]) => domainKey(id))];

const onlyPlainValues = (value) => {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return false;
  return Object.values(value).every(onlyPlainValues);
};

test("a full answer set is read into the design answers, protected, depth and every library, keyed by id", () => {
  const reading = readAnswers(rawAnswers());
  assert.deepEqual(Object.keys(reading), ["design", "protected", "depth", "libraries"]);
  assert.deepEqual(reading.design, { surface_made: 0.97, small_adjustment: 0.06, screens_unchanged: 0.02, developer_artefact: 0.03, code_only: 0.02 });
  assert.equal(reading.protected, 0.04);
  assert.deepEqual(reading.depth, { choice: "FOCUSED", confidence: 0.71 });
  assert.deepEqual(Object.keys(reading.libraries), LIBRARIES.map(([id]) => id));
  assert.equal(reading.libraries["new-product-setup"], 0.08);
});

test("with the record the reading also holds maintenance, every area and every domain", () => {
  const reading = readAnswers(rawAnswers(), { record: true });
  assert.deepEqual(Object.keys(reading), ["design", "protected", "depth", "libraries", "maintenance", "areas", "domains"]);
  assert.equal(reading.maintenance, 0.03);
  assert.deepEqual(Object.keys(reading.areas), AREAS.map(({ id }) => id));
  assert.equal(reading.areas["product-ui-ux-motion"], 0.96);
  assert.deepEqual(Object.keys(reading.domains), DOMAINS.map(([id]) => id));
  assert.equal(reading.domains["habit-loops"], 0.12);
});

test("the reading holds only plain numbers and the depth's name; extra keys and fields in the answers are never copied", () => {
  const raw = rawAnswers();
  raw.note = { type: "noul", noul: 0.5, text: "Bearer test-key-0123456789" };
  raw.surface_made.explanation = "Bearer test-key-0123456789";
  raw.depth.probabilities = { FULL: 0.7, QUICK: "Bearer test-key-0123456789" };
  raw.depth.reason = "Bearer test-key-0123456789";
  for (const record of [false, true]) {
    const reading = readAnswers(raw, { record });
    assert.equal(JSON.stringify(reading).includes("test-key"), false);
    assert.equal(Object.hasOwn(reading, "note"), false);
    assert.deepEqual(Object.keys(reading.depth), ["choice", "confidence"]);
    const { depth, ...numbers } = reading;
    assert.equal(onlyPlainValues(numbers), true);
    assert.equal(typeof depth.choice, "string");
  }
});

test("an answer set missing any answer a call asked for is rejected", () => {
  for (const key of REQUIRED_WITHOUT_RECORD) {
    const raw = rawAnswers();
    delete raw[key];
    assert.equal(readAnswers(raw), null, key);
    assert.equal(readAnswers(raw, { record: true }), null, key);
  }
  for (const key of REQUIRED_ONLY_WITH_RECORD) {
    const raw = rawAnswers();
    delete raw[key];
    assert.equal(readAnswers(raw, { record: true }), null, key);
    assert.notEqual(readAnswers(raw), null, `${key} is not asked without the record`);
  }
});

test("a probability outside 0 to 1, or one that is not a number, is rejected", () => {
  for (const value of [1.4, -0.01, Number.NaN, Number.POSITIVE_INFINITY, "0.5", null, undefined, true]) {
    const raw = rawAnswers();
    raw.protected.noul = value;
    assert.equal(readAnswers(raw), null, String(value));
    const library = rawAnswers();
    library.library_retirement.noul = value;
    assert.equal(readAnswers(library), null, String(value));
  }
  const edges = rawAnswers();
  edges.surface_made.noul = 1;
  edges.code_only.noul = 0;
  assert.notEqual(readAnswers(edges), null, "0 and 1 are probabilities");
});

test("a depth that is not one of the five, or a depth confidence outside 0 to 1, is rejected", () => {
  for (const choice of ["HUGE", "focused", "", null, 3]) {
    const raw = rawAnswers();
    raw.depth.choice = choice;
    assert.equal(readAnswers(raw), null, String(choice));
  }
  for (const confidence of [1.2, -1, "0.9", undefined]) {
    const raw = rawAnswers();
    raw.depth.confidence = confidence;
    assert.equal(readAnswers(raw), null, String(confidence));
  }
});

test("answers of the wrong shape are rejected", () => {
  for (const raw of [null, undefined, "answers", 42, [], [rawAnswers()]]) assert.equal(readAnswers(raw), null, JSON.stringify(raw));
  const notAnObject = rawAnswers();
  notAnObject.surface_made = 0.97;
  assert.equal(readAnswers(notAnObject), null);
  const depthAsText = rawAnswers();
  depthAsText.depth = "FOCUSED";
  assert.equal(readAnswers(depthAsText), null);
});

test("an answer inherited from the prototype rather than given in the set is not read", () => {
  const raw = Object.create(rawAnswers());
  assert.equal(readAnswers(raw), null);
});
