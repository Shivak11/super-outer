import { test } from "node:test";
import assert from "node:assert/strict";

import {
  auditQuestion,
  auditDisclosure,
  longestNounRun,
  QUESTION_LIMITS,
} from "../src/question-audit.mjs";
import { consolidateQuestions, renderConsolidatedInterview } from "../src/plain-language.mjs";

const route = (mode) => ({ mode, interviewer: "router" });
const finding = (decision) => [{ specialistId: "backend-api", decisions: [decision] }];

const good = {
  id: "slow-dependency",
  kind: "interpretive",
  topic: "slow dependency",
  prompt:
    "If the other service is slow, should people see saved information or a clear temporary failure?",
  why: "it changes what someone sees when the system is degraded",
  options: [
    { label: "Show saved information", consequence: "the page stays usable but may be out of date" },
    { label: "Show a clear temporary failure", consequence: "nobody is misled, but the page is unusable" },
  ],
  recommended: "Show saved information",
};

// Regression pins. These are the questions Super-outer already ships and the
// shapes its own reference doc teaches. If the audit ever starts eating them,
// the audit is wrong — not the questions.
test("every question Super-outer already ships survives the audit untouched", () => {
  const shipped = [
    good,
    {
      prompt: "Could the same request cause the action twice?",
      why: "it changes whether someone is charged twice",
      options: [
        { label: "Prevent it", consequence: "slower but safe" },
        { label: "Allow it", consequence: "faster but risky" },
      ],
    },
    {
      prompt: "Can any data be lost during this move?",
      why: "it changes what we must protect first",
      options: [
        { label: "No loss", consequence: "the move takes longer" },
        { label: "Brief loss", consequence: "the move is quicker" },
      ],
    },
    {
      prompt: "Should this motion feel immediate or deliberative in this product?",
      why: "it changes how the screen reads to a first-time user",
      options: [
        { label: "Immediate", consequence: "feels responsive" },
        { label: "Deliberative", consequence: "feels considered" },
      ],
    },
  ];
  for (const question of shipped) {
    const result = auditQuestion(question);
    assert.equal(result.usable, true, `blocked: ${JSON.stringify(result.blocking)}`);
    assert.equal(result.advisory.length, 0, `advised: ${JSON.stringify(result.advisory)}`);
  }
});

test("one decision per question — two asks in one prompt are blocked", () => {
  for (const prompt of [
    "Should people see saved information? Should we also retry automatically?",
    "Should we show saved information; should we retry?",
    "Should we show saved information and also retry automatically?",
  ]) {
    const result = auditQuestion({ ...good, prompt });
    assert.equal(result.usable, false, prompt);
    assert.equal(result.blocking[0].rule, "one_decision_per_question");
  }
});

test("length caps apply to the prompt, the consequence, and every option", () => {
  const long = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  assert.equal(auditQuestion({ ...good, prompt: `${long(40)}?` }).blocking[0].rule, "question_too_long");
  assert.equal(auditQuestion({ ...good, why: long(40) }).blocking[0].rule, "question_too_long");
  assert.equal(
    auditQuestion({
      ...good,
      options: [{ label: long(20), consequence: "fine" }, { label: "ok", consequence: "fine" }],
    }).blocking[0].rule,
    "option_too_long",
  );
});

test("noun clustering is advisory, never blocking", () => {
  const soup = {
    ...good,
    prompt: "Should we apply the async-safe idempotent retry-queue reconciliation policy?",
  };
  const result = auditQuestion(soup);
  // Caught...
  assert.ok(result.advisory.some((a) => a.rule === "noun_cluster"));
  // ...but never at the cost of losing the question. A false positive here
  // would delete a good question and replace it with an apology.
  assert.equal(result.usable, true);
  assert.equal(result.blocking.length, 0);
});

test("a chain breaks on function words and punctuation", () => {
  assert.equal(longestNounRun("a clear temporary failure"), 3);
  assert.equal(longestNounRun("async-safe idempotent retry-queue reconciliation policy"), 5);
  assert.ok(longestNounRun("saved information, stale counts, broken links") <= QUESTION_LIMITS.nounRun);
});

test("a blocked question is dropped with a translated reason, not shown", () => {
  const interview = consolidateQuestions({
    route: route("QUICK"),
    findings: finding({
      ...good,
      prompt: "Should people see saved information? Should we retry automatically?",
    }),
  });
  assert.equal(interview.questions.length, 0);
  assert.equal(interview.omitted[0].reason, "one_decision_per_question");
  assert.match(interview.disclosure, /bundled two separate decisions/);
  assert.ok(interview.omitted[0].detail, "the drop reason keeps its evidence-layer detail");
});

test("an advised question still reaches the user, with the note kept internal", () => {
  const interview = consolidateQuestions({
    route: route("QUICK"),
    findings: finding({
      ...good,
      // Noun-clustered but free of the mechanism vocabulary the older gate
      // already rejects, so this isolates the new advisory path.
      prompt: "Should we change the customer account balance reconciliation timing?",
    }),
  });
  assert.equal(interview.questions.length, 1);
  assert.equal(interview.advisories[0].rule, "noun_cluster");
  const rendered = renderConsolidatedInterview(interview);
  assert.doesNotMatch(rendered, /noun_cluster|advisory/i, "advisories are never shown to the user");
});

test("the disclosure stays short when many candidates fail for many reasons", () => {
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
  // Five distinct failure reasons. Listing all five verbatim would make the
  // apology longer than anything it apologises for.
  const decisions = [
    { ...good, id: "a", topic: "a", why: "idempotency decides this" },
    { ...good, id: "b", topic: "b", prompt: "Which queue should we use?" },
    { ...good, id: "c", topic: "c", prompt: "Should we wait? Should we retry?" },
    { ...good, id: "d", topic: "d", prompt: `${long}?` },
    { ...good, id: "e", topic: "e", recommended: "" },
  ];
  const interview = consolidateQuestions({
    route: route("QUICK"),
    findings: [{ specialistId: "backend-api", decisions }],
  });

  assert.equal(interview.questions.length, 0, "every candidate should have been dropped");
  assert.ok(interview.omitted.length >= 5);
  assert.equal(auditDisclosure(interview.disclosure).blocking.length, 0);
  assert.match(interview.disclosure, /and \d+ more/, "extra reasons are summarised, not listed");
});
