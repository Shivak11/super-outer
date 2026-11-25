import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  consolidateQuestions,
  assertQuestionBudget,
  renderConsolidatedInterview,
  questionFloorFor,
} from "../src/plain-language.mjs";
import { QUESTION_FLOORS, QUESTION_BUDGETS } from "../src/constants.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(root, "skills/super-outer/SKILL.md"), "utf8");
// The frontmatter description is a folded YAML scalar, so a phrase the model
// reads as one sentence is wrapped across lines on disk.
const unwrapped = skill.replace(/\s+/g, " ");

// Fix 1 — the trigger vocabulary dropped at v4.0.0 is what stopped Super-outer
// engaging on the work Shiva actually asks for. These fail on v4.0.4.
test("engagement triggers name bug fixes, defects, regressions and refactors", () => {
  const description = (unwrapped.split("---")[1] ?? "").toLowerCase();
  for (const term of ["bug fix", "defect", "regression", "refactor"]) {
    assert.ok(
      description.includes(term),
      `trigger vocabulary must name "${term}"`,
    );
  }
});

test("engagement is register-independent", () => {
  assert.match(
    unwrapped,
    /describes the (?:product )?change without coding vocabulary/i,
    "must trigger when the user describes the change in plain product language",
  );
});

// Fix 3 — the question-design procedure was reachable only through a selected
// module, so a route that selects none never opened it.
test("SKILL.md links the question-design references directly", () => {
  for (const reference of [
    "references/plain-english-questions.md",
    "references/decision-kinds.md",
    "references/specialist-result-contract.md",
  ]) {
    assert.ok(skill.includes(reference), `SKILL.md must link ${reference}`);
  }
});

// Fix 2 — budgets were maxima with no minima, so zero satisfied every tier
// except CRITICAL, and CRITICAL is unreachable for an ordinary bug fix.
test("QUICK and FOCUSED carry a floor, SMALL_SAFE does not", () => {
  assert.equal(QUESTION_FLOORS.SMALL_SAFE, 0);
  assert.equal(QUESTION_FLOORS.QUICK, 1);
  assert.equal(QUESTION_FLOORS.FOCUSED, 1);
  assert.ok(QUESTION_FLOORS.QUICK <= QUESTION_BUDGETS.QUICK);
  assert.equal(questionFloorFor("QUICK"), 1);
});

const route = (mode) => ({ mode, interviewer: "router" });

test("a QUICK route with no usable decision discloses instead of going silent", () => {
  const interview = consolidateQuestions({
    route: route("QUICK"),
    findings: [
      {
        specialistId: "backend-api",
        decisions: [
          {
            id: "retry-shape",
            kind: "interpretive",
            topic: "retry shape",
            // Jargon: rejected by the language gate, so nothing reaches the user.
            prompt: "Should the handler be idempotent across retries?",
            why: "cache invalidation may double-apply",
            options: [
              { label: "Yes", consequence: "safer" },
              { label: "No", consequence: "faster" },
            ],
            recommended: "Yes",
          },
        ],
      },
    ],
  });

  assert.equal(interview.questions.length, 0);
  assert.equal(interview.floor, 1);
  assert.equal(interview.floorSatisfiedBy, "disclosure");
  assert.ok(
    interview.disclosure,
    "an empty QUICK interview must state why no judgement was needed",
  );
  // Fix 4 — the reason a candidate was dropped must be visible, not swallowed.
  assert.ok(interview.omitted.length > 0);
  assert.equal(interview.omitted[0].reason, "developer_jargon_not_translated");
});

test("the disclosure renders instead of an empty string", () => {
  const interview = consolidateQuestions({
    route: route("QUICK"),
    findings: [],
  });
  const rendered = renderConsolidatedInterview(interview);
  assert.notEqual(rendered, "", "a floored mode must never render empty");
  // The wording is warmer since 5.4.0. What must hold is that silence is
  // explained rather than merely absent.
  assert.match(rendered, /nothing needed you|nothing reached you|already answered/i);
});

test("a genuine question satisfies the floor without a disclosure", () => {
  const interview = consolidateQuestions({
    route: route("QUICK"),
    findings: [
      {
        specialistId: "backend-api",
        decisions: [
          {
            id: "slow-dependency",
            kind: "interpretive",
            topic: "slow dependency",
            prompt:
              "If the other service is slow, should people see saved information or a clear temporary failure?",
            why: "it changes what someone sees when the system is degraded",
            options: [
              {
                label: "Show saved information",
                consequence: "the page stays usable but may be out of date",
              },
              {
                label: "Show a clear temporary failure",
                consequence: "nobody is misled, but the page is unusable",
              },
            ],
            recommended: "Show saved information",
          },
        ],
      },
    ],
  });

  assert.equal(interview.questions.length, 1);
  assert.equal(interview.floorSatisfiedBy, "question");
  assert.equal(interview.disclosure, null);
  assert.match(renderConsolidatedInterview(interview), /saved information/);
});

test("SMALL_SAFE stays silent — the floor must not create ceremony", () => {
  const interview = consolidateQuestions({
    route: route("SMALL_SAFE"),
    findings: [],
  });
  assert.equal(interview.questions.length, 0);
  assert.equal(interview.floor, 0);
  assert.equal(interview.disclosure, null);
  assert.equal(renderConsolidatedInterview(interview), "");
});

test("the budget ceiling still holds above the floor", () => {
  const interview = {
    interviewer: "router",
    mode: "QUICK",
    questions: [1, 2, 3].map((n) => ({
      id: `q${n}`,
      prompt: "p",
      why: "w",
      options: [],
      recommended: "",
    })),
    interviewCount: 1,
  };
  assert.throws(() => assertQuestionBudget(interview), /allows 2 questions/);
});

test("the skill does not promise a live question audit that never runs", () => {
  // src/question-audit.mjs is exercised by tests over shipped questions only;
  // no hook or command runs it on questions drafted during a task.
  const skill = readFileSync(new URL("../skills/super-outer/SKILL.md", import.meta.url), "utf8");
  const reference = readFileSync(
    new URL("../skills/super-outer/references/plain-english-questions.md", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(skill, /mechanical audit you cannot argue with/);
  assert.doesNotMatch(reference, /checked by `src\/question-audit\.mjs` before it is\s+shown/);
});
