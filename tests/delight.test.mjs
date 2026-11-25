import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  scoreboard,
  milestone,
  opener,
  factFor,
  earnedOnce,
  delightPolicy,
} from "../src/delight.mjs";
import { auditQuestion, QUESTION_LIMITS } from "../src/question-audit.mjs";

test("the scoreboard makes suppression visible", () => {
  assert.match(scoreboard({ settled: 7, asked: 1 }), /Checked 7 things your code already handles\. 1 needs you\./);
  assert.match(scoreboard({ settled: 1, asked: 2 }), /Checked 1 thing .* 2 need you\./);
  assert.match(scoreboard({ settled: 6, asked: 0 }), /Nothing needs you/);
  assert.match(scoreboard({ settled: 0, asked: 2 }), /2 questions for you/);
  // Nothing happened, so nothing is said.
  assert.equal(scoreboard({ settled: 0, asked: 0 }), "");
  assert.equal(scoreboard(), "");
});

test("milestones celebrate proof, not activity", () => {
  assert.match(milestone("first_proof", { decision: "Recordings survive a restart" }), /no longer an opinion/);
  assert.match(milestone("ledger_woke", { item: "rate limiting", since: "March" }), /It just did\./);
  assert.match(milestone("nothing_to_ask"), /already answered everything/);
  assert.match(milestone("proof_rotted", { count: 2 }), /2 proofs have gone stale/);
  assert.match(milestone("all_proved", { count: 1 }), /1 recorded decision has a live test/);
  assert.equal(milestone("no_such_milestone"), "");
});

test("an archetype supplies its own opener, and the fallback still says something useful", () => {
  assert.equal(opener({ opener: "🚦 custom" }), "🚦 custom");
  assert.match(
    opener({ name: "Mobile capture", failureModes: [1, 2, 3] }),
    /Mobile capture — I know this one.*3 usual problems/,
  );
  assert.equal(opener(null), "");
  assert.equal(opener({ name: "Empty", failureModes: [] }), "");
});

test("facts are carried by the failure mode, never invented", () => {
  assert.match(factFor({ fact: "Knight Capital lost $440 million in 45 minutes." }), /^💡 While we're here: Knight/);
  // No curated fact means silence, not a generated one.
  assert.equal(factFor({}), "");
  assert.equal(factFor(null), "");
  assert.equal(delightPolicy.generatedFacts, false);
});

test("every line is earned once, then silent", () => {
  const shown = new Set();
  assert.match(earnedOnce(shown, "k", "🎉 first"), /first/);
  assert.equal(earnedOnce(shown, "k", "🎉 first"), "");
  assert.equal(earnedOnce(shown, "k", "🎉 first"), "");
  // A different moment still gets its line.
  assert.match(earnedOnce(shown, "other", "🔔 second"), /second/);
  // Nothing happened, nothing said.
  assert.equal(earnedOnce(shown, "empty", ""), "");
});

test("delight obeys the same plain-language limits as a question", () => {
  const lines = [
    scoreboard({ settled: 7, asked: 1 }),
    milestone("first_proof", { decision: "Recordings survive a restart" }),
    milestone("ledger_woke", { item: "rate limiting", since: "March" }),
    milestone("nothing_to_ask"),
    opener({ name: "Mobile capture", failureModes: [1, 2, 3] }),
  ];
  for (const line of lines) {
    const words = line.trim().split(/\s+/).length;
    assert.ok(
      words <= QUESTION_LIMITS.promptWords + QUESTION_LIMITS.whyWords,
      `too long (${words} words): ${line}`,
    );
  }
});

test("every curated fact in the shipped archetypes is short and plain", () => {
  const archetype = JSON.parse(
    readFileSync("skills/super-outer/references/archetypes/safe-activation.json", "utf8"),
  );
  const withFacts = archetype.failureModes.filter((mode) => mode.fact);
  assert.ok(withFacts.length >= 6, "most activation questions should carry a fact");
  for (const mode of withFacts) {
    const words = mode.fact.split(/\s+/).length;
    assert.ok(words <= 40, `fact too long on ${mode.id}: ${words} words`);
    // A fact must not smuggle in a second question.
    assert.ok(!/\?/.test(mode.fact), `fact should not ask a question: ${mode.id}`);
  }
});

test("the shipped activation questions still pass the language audit with facts attached", () => {
  const archetype = JSON.parse(
    readFileSync("skills/super-outer/references/archetypes/safe-activation.json", "utf8"),
  );
  for (const mode of archetype.failureModes) {
    const result = auditQuestion(mode);
    assert.equal(result.usable, true, `${mode.id}: ${JSON.stringify(result.blocking)}`);
    assert.equal(result.advisory.length, 0, `${mode.id}: ${JSON.stringify(result.advisory)}`);
  }
});
