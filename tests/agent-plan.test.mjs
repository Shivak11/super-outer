import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_CAP, planAgents } from "../src/agent-plan.mjs";

test("QUICK gets no agents and no internal register", () => {
  const plan = planAgents({ depth: "QUICK" });
  assert.deepEqual(plan.agents, []);
  assert.equal(plan.internalRegister, false);
});

test("FOCUSED gets up to two Sonnet scouts", () => {
  const plan = planAgents({ depth: "FOCUSED", task: { scouts: 5 } });
  assert.ok(plan.agents.length <= 2 && plan.agents.length >= 1);
  assert.ok(plan.agents.every((a) => a.role === "scout" && a.model === "sonnet"));
  assert.equal(plan.internalRegister, true);
});

test("FULL: scouts on sonnet, up to three builders inherit, reviewers by risk", () => {
  const low = planAgents({ depth: "FULL", task: { builders: 9, reviewers: 1 } });
  assert.ok(low.agents.filter((a) => a.role === "builder").length <= 3);
  assert.ok(low.agents.filter((a) => a.role === "builder").every((a) => a.model === "inherit"));
  assert.ok(low.agents.filter((a) => a.role === "scout").every((a) => a.model === "sonnet"));
  assert.ok(low.agents.filter((a) => a.role === "reviewer").every((a) => a.model === "sonnet"));
  const high = planAgents({ depth: "FULL", task: { risk: "high", reviewers: 1 } });
  assert.ok(high.agents.filter((a) => a.role === "reviewer").every((a) => a.model === "opus"));
});

test("CRITICAL adds an Opus independent verifier and never exceeds the cap", () => {
  const plan = planAgents({ depth: "CRITICAL", task: { scouts: 9, builders: 9, reviewers: 9 } });
  assert.equal(AGENT_CAP, 6);
  assert.ok(plan.agents.length <= 6);
  const verifier = plan.agents.find((a) => a.role === "independent-verifier");
  assert.equal(verifier?.model, "opus");
});

test("unknown depth falls back to no agents", () => {
  assert.deepEqual(planAgents({ depth: "WHAT" }).agents, []);
  assert.deepEqual(planAgents().agents, []);
});
