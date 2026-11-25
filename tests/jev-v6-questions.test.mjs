import assert from "node:assert/strict";
import test from "node:test";

import { QUESTION_SET_VERSION, V6_QUESTION_SET_VERSION, V6_DIAGRAM_KINDS, buildQuestions, buildV6Questions, V6_KINDS } from "../src/jev/questions.mjs";
import { readV6Answer } from "../src/jev/reading.mjs";
import { DIAGRAM_CONFIDENCE, decideV6 } from "../src/jev/combine.mjs";
import { safeSummary, SUMMARY_LIMIT } from "../src/jev/prompt-filter.mjs";
import { askV6 } from "../src/jev/judge.mjs";

test("the 5.8.0 set is unchanged and the new set has its own version", () => {
  assert.equal(QUESTION_SET_VERSION, "5.8.0-r1");
  assert.equal(V6_QUESTION_SET_VERSION, "6.5.0-r3");
  assert.ok(!Object.keys(buildQuestions()).some((k) => k.startsWith("v6_")));
});

test("seven closed question kinds", () => {
  assert.deepEqual([...V6_KINDS].sort(), ["agents", "diagram-kinds", "dimensions", "owner_correction", "scope_change", "suggestion_real", "sweep_order"]);
  for (const kind of V6_KINDS) {
    const qs = buildV6Questions(kind);
    assert.ok(Object.keys(qs).length > 0);
    for (const q of Object.values(qs)) assert.ok(["noul", "choice"].includes(q.type));
  }
});

test("summaries: secrets and over-long text are refused", () => {
  assert.equal(safeSummary("five timing queries in a row against the live service"), "five timing queries in a row against the live service");
  assert.equal(safeSummary(`token ${["ghp", "_", "abcdefghijklmnopqrstuvwxyz0123456789"].join("")}`), null);
  assert.equal(safeSummary("x".repeat(SUMMARY_LIMIT + 1)), null);
  assert.equal(safeSummary("line one\nline two"), null);
  assert.equal(safeSummary(42), null);
});

test("readings are validated", () => {
  assert.equal(readV6Answer("suggestion_real", { v6_suggestion_real: { noul: 0.9 } }).real, 0.9);
  assert.equal(readV6Answer("suggestion_real", { v6_suggestion_real: { noul: 7 } }), null);
  assert.equal(readV6Answer("agents", null), null);
});

test("every other new answer is recorded only: the local answer decides", () => {
  const local = { scouts: 1 };
  const out = decideV6({ kind: "agents", local, reading: { count: 5 } });
  assert.deepEqual(out.decided, local);
  assert.equal(out.source, "local");
  assert.equal(out.recordedOnly, true);
  assert.equal(typeof out.agrees, "boolean");
});

test("askV6 falls back to the local answer when Jev is off, without network", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network used"); };
  try {
    const out = await askV6({ kind: "suggestion_real", summary: "five timing queries in a row", local: true, env: { SUPER_OUTER_JEV: "off" } });
    assert.equal(out.decided, true);
    assert.equal(out.status, "skipped");
    const secret = await askV6({ kind: "suggestion_real", summary: "key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD", local: false, env: {} });
    assert.equal(secret.decided, false);
    assert.equal(secret.reason, "unsafe_summary");
  } finally {
    globalThis.fetch = original;
  }
});

test("diagram kinds: one yes-or-no question for each of the four kinds", () => {
  assert.deepEqual([...V6_DIAGRAM_KINDS], ["architecture", "pipeline", "code-flow", "one-problem"]);
  const qs = buildV6Questions("diagram-kinds");
  assert.deepEqual(Object.keys(qs).sort(), ["v6_diagram_architecture", "v6_diagram_code_flow", "v6_diagram_one_problem", "v6_diagram_pipeline"]);
  const reading = readV6Answer("diagram-kinds", { v6_diagram_architecture: { noul: 0.95 }, v6_diagram_pipeline: { noul: 0.05 }, v6_diagram_code_flow: { noul: 0.9 }, v6_diagram_one_problem: { noul: 0.1 } });
  assert.deepEqual(reading.kinds, { architecture: 0.95, pipeline: 0.05, "code-flow": 0.9, "one-problem": 0.1 });
  assert.equal(readV6Answer("diagram-kinds", { v6_diagram_architecture: { noul: 0.9 } }), null, "a partial answer is no reading");
});

test("diagram kinds: a confident Jev answer decides, and one-problem is never drawn unasked", () => {
  const kinds = (a, p, c, o) => ({ kinds: { architecture: a, pipeline: p, "code-flow": c, "one-problem": o } });
  const sure = decideV6({ kind: "diagram-kinds", local: { unclear: true }, reading: kinds(0.95, 0.04, 0.9, 0.97) });
  assert.deepEqual(sure.decided, ["architecture", "code-flow"]);
  assert.equal(sure.source, "jev");
  assert.equal(sure.recordedOnly, false);
  const edge = 1 - DIAGRAM_CONFIDENCE;
  assert.equal(decideV6({ kind: "diagram-kinds", local: ["pipeline"], reading: kinds(DIAGRAM_CONFIDENCE, edge, edge, edge) }).source, "jev");
  const unsure = decideV6({ kind: "diagram-kinds", local: ["pipeline"], reading: kinds(0.6, 0.1, 0.1, 0.1) });
  assert.deepEqual(unsure.decided, ["pipeline"]);
  assert.equal(unsure.source, "local");
  assert.equal(unsure.recordedOnly, true);
  assert.notEqual(unsure.ask, true);
  const off = decideV6({ kind: "diagram-kinds", local: ["code-flow"] });
  assert.deepEqual(off.decided, ["code-flow"]);
  assert.equal(off.source, "local");
});

test("diagram kinds: unclear locally and no confident Jev answer means one question to Shiva", () => {
  const off = decideV6({ kind: "diagram-kinds", local: { unclear: true } });
  assert.equal(off.ask, true);
  assert.equal(off.decided, null);
  const unsure = decideV6({ kind: "diagram-kinds", local: { unclear: true }, reading: { kinds: { architecture: 0.5, pipeline: 0.5, "code-flow": 0.5, "one-problem": 0.5 } } });
  assert.equal(unsure.ask, true);
});

test("askV6 with Jev off returns the ask for an unclear diagram plan, without network", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network used"); };
  try {
    const out = await askV6({ kind: "diagram-kinds", summary: "added POST /orders/export route and worker", local: { unclear: true }, env: { SUPER_OUTER_JEV: "off" } });
    assert.equal(out.ask, true);
    assert.equal(out.status, "skipped");
  } finally {
    globalThis.fetch = original;
  }
});
