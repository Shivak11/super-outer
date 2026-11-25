import assert from "node:assert/strict";
import test from "node:test";

import {
  assertQuestionBudget,
  consolidateQuestions,
  renderConsolidatedInterview,
} from "../src/plain-language.mjs";

const route = (mode, questionBudget) => ({
  schema_version: "1.0.0",
  selected_modules: [],
  mode,
  question_budget: questionBudget,
});

const decision = (id, overrides = {}) => ({
  id,
  kind: "interpretive",
  topic: id,
  prompt: `What should happen for ${id}?`,
  why: "This changes what people experience and what they can recover.",
  options: [
    { label: "Continue", consequence: "People keep their current progress." },
    { label: "Start again", consequence: "People lose the unfinished progress." },
  ],
  recommended: "Continue",
  ...overrides,
});

test("router consolidates decisions into one plain-English interview", () => {
  const interview = consolidateQuestions({
    route: route("FOCUSED", 4),
    findings: [
      { specialistId: "frontend_client", decisions: [decision("recovery")] },
      {
        specialistId: "backend_api",
        decisions: [
          decision("latency", {
            kind: "evidence_tradeoff",
            researched: true,
            prompt: "How long may a person wait before we show a useful fallback?",
          }),
        ],
      },
    ],
  });
  assert.equal(interview.interviewer, "router");
  assert.equal(interview.interviewCount, 1);
  assert.equal(interview.questions.length, 2);
  const rendered = renderConsolidatedInterview(interview);
  assert.match(rendered, /Why it matters:/);
  assert.match(rendered, /\(Recommended\)/);
  assert.doesNotMatch(rendered, /frontend_client|backend_api/);
});

test("specialists cannot ask the user directly", () => {
  assert.throws(
    () =>
      consolidateQuestions({
        route: route("QUICK", 2),
        findings: [{ specialistId: "backend_api", questions: ["Which queue?"] }],
      }),
    /cannot interview the user directly/,
  );
});

test("accepts schema-shaped proposed questions but keeps the router as interviewer", () => {
  const interview = consolidateQuestions({
    route: route("QUICK", 2),
    findings: [
      {
        module: "reliability-recovery",
        proposed_questions: [
          {
            why: "This determines how much unfinished work people may lose.",
            question: "What should happen to unfinished work after a failure?",
            options: [
              "Keep it — people resume where they stopped",
              "Discard it — people start the task again",
            ],
            recommended: 0,
          },
        ],
      },
    ],
  });
  assert.equal(interview.interviewer, "router");
  assert.equal(interview.questions[0].recommended, "Keep it");
});

test("invariants are applied without ceremonial questions", () => {
  const interview = consolidateQuestions({
    route: route("QUICK", 2),
    findings: [
      {
        specialistId: "security_privacy_abuse",
        decisions: [decision("authorization", { kind: "invariant" })],
      },
    ],
  });
  assert.deepEqual(interview.questions, []);
  assert.equal(interview.omitted[0].reason, "invariant_applied_without_question");
});

test("unresearched trade-offs and implementation selections never reach users", () => {
  const interview = consolidateQuestions({
    route: route("FULL", 7),
    findings: [
      {
        specialistId: "architecture_maintainability",
        decisions: [
          decision("mechanism", {
            prompt: "Which framework and cache vendor should we use?",
          }),
          decision("loss", {
            kind: "evidence_tradeoff",
            researched: false,
            prompt: "How much recent work may be lost during recovery?",
          }),
        ],
      },
    ],
  });
  assert.deepEqual(interview.questions, []);
  assert.deepEqual(
    interview.omitted.map(({ reason }) => reason).sort(),
    ["technical_implementation_choice", "tradeoff_not_researched"],
  );
});

test("authentication mechanisms and signing algorithms stay out of user questions", () => {
  const interview = consolidateQuestions({
    route: route("FULL", 7),
    findings: [{
      specialistId: "security_privacy_abuse",
      decisions: [
        decision("token format", { prompt: "Should we use JWT or opaque session tokens?" }),
        decision("signing algorithm", { prompt: "Should token signatures use RS256 or HS256?" }),
        decision("oauth grant", { prompt: "Which OAuth 2.0 grant type should the client use?" }),
        decision("sign-in outcome", {
          prompt: "Should people stay signed in after they close the app?",
          why: "This changes convenience and the risk of someone else using an unattended device.",
        }),
      ],
    }],
  });
  assert.deepEqual(interview.questions.map(({ id }) => id), ["sign-in outcome"]);
  assert.deepEqual(
    interview.omitted.map(({ reason }) => reason),
    [
      "technical_implementation_choice",
      "technical_implementation_choice",
      "technical_implementation_choice",
    ],
  );
});

test("developer jargon stays in evidence and never reaches the user interview", () => {
  const interview = consolidateQuestions({
    route: route("FOCUSED", 4),
    findings: [{
      specialistId: "data_migrations",
      decisions: [
        decision("mixed data", {
          prompt: "May the schema migration use a backfill while both versions run?",
          why: "This changes transaction isolation and eventual consistency.",
        }),
        decision("unfinished update", {
          prompt: "If the data update stops halfway, what should people experience?",
          why: "Some saved information may otherwise be newer than the rest.",
          options: [
            { label: "Keep the service available", consequence: "People may briefly see older information while the update safely finishes." },
            { label: "Pause the affected feature", consequence: "People wait, but nobody sees partly updated information." },
          ],
          recommended: "Pause the affected feature",
        }),
      ],
    }],
  });
  assert.equal(interview.questions.length, 1);
  assert.equal(interview.questions[0].id, "unfinished update");
  assert.equal(interview.omitted[0].reason, "developer_jargon_not_translated");
  assert.doesNotMatch(renderConsolidatedInterview(interview), /schema|backfill|transaction isolation|eventual consistency/i);
});

test("deduplicates the same product choice across specialists", () => {
  const interview = consolidateQuestions({
    route: route("FULL", 7),
    findings: [
      { specialistId: "frontend_client", decisions: [decision("acceptable loss")] },
      {
        specialistId: "reliability_recovery",
        decisions: [decision("acceptable loss", { priority: 5 })],
      },
    ],
  });
  assert.equal(interview.questions.length, 1);
});

for (const [mode, budget] of Object.entries({
  SMALL_SAFE: 0,
  QUICK: 2,
  FOCUSED: 4,
  FULL: 7,
  CRITICAL: 7,
})) {
  test(`${mode} never exceeds its hard question budget`, () => {
    const interview = consolidateQuestions({
      route: route(mode, 99),
      findings: [
        {
          specialistId: "product_ui_ux_motion",
          decisions: Array.from({ length: 10 }, (_, index) =>
            decision(`choice-${index}`, { priority: 10 - index }),
          ),
        },
      ],
    });
    assert.equal(interview.questions.length, budget);
    assert.equal(interview.interviewCount, budget > 0 ? 1 : 0);
    assert.doesNotThrow(() => assertQuestionBudget(interview));
  });
}

test("rejects malformed choices rather than asking vague questions", () => {
  const interview = consolidateQuestions({
    route: route("QUICK", 2),
    findings: [
      {
        specialistId: "product_ui_ux_motion",
        decisions: [decision("vague", { why: "", recommended: "" })],
      },
    ],
  });
  assert.deepEqual(interview.questions, []);
  assert.equal(interview.omitted[0].reason, "missing_plain_language_context");
});

test("an archetype allowance above the tier budget is honoured on FULL work", () => {
  // The router raises the allowance to 12 when an archetype matches. Capping it
  // back to the FULL tier's 7 would silently drop the anticipated questions.
  const findings = [
    {
      specialistId: "product_ui_ux_motion",
      decisions: Array.from({ length: 10 }, (_, index) => decision(`moment-${index}`)),
    },
  ];
  const withArchetype = { ...route("FULL", 12), archetypes: [{ id: "new-product-setup" }] };
  const interview = consolidateQuestions({ route: withArchetype, findings });
  assert.equal(interview.questions.length, 10);
  assert.doesNotThrow(() => assertQuestionBudget(interview));
  // Without an archetype the tier stays a hard ceiling.
  assert.equal(consolidateQuestions({ route: route("FULL", 12), findings }).questions.length, 7);
});

test("an empty interview does not claim the code answered anything", () => {
  // With no candidate considered, nobody checked the code against anything.
  const interview = consolidateQuestions({ route: route("QUICK", 2), findings: [] });
  assert.doesNotMatch(interview.disclosure, /already answered|your own code/i);
  assert.match(interview.disclosure, /nothing needed you/i);
});
