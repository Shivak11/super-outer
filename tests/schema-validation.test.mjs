import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSchema, validateSchema } from "../src/schema-validation.mjs";
import { routeTask } from "../src/router.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readSchema = (name) => JSON.parse(
  readFileSync(resolve(root, "schemas", name), "utf8"),
);
const schema = readSchema("route-decision.schema.json");

const validRoute = {
  schema_version: "1.0.0",
  task_id: "backend-timeout",
  material: true,
  mode: "FOCUSED",
  question_budget: 4,
  selected_modules: ["backend-api", "reliability-recovery"],
  scores: {
    "backend-api": { score: 8, reasons: ["service contract changes"] },
    "reliability-recovery": { score: 5, reasons: ["dependency can be slow"] },
  },
  signals: ["external dependency"],
};

test("accepts a valid route decision", () => {
  assert.equal(assertSchema(schema, validRoute), validRoute);
});

test("rejects unknown modes, duplicate modules, and excessive questions", () => {
  const errors = validateSchema(schema, {
    ...validRoute,
    mode: "EVERYTHING",
    question_budget: 13,
    selected_modules: ["backend-api", "backend-api"],
  });
  assert.match(errors.join("\n"), /allowed set/);
  assert.match(errors.join("\n"), /above 12/);
  assert.match(errors.join("\n"), /duplicate array item/);
});

test("rejects unexpected fields from durable contracts", () => {
  const errors = validateSchema(schema, {
    ...validRoute,
    raw_prompt: "must not be persisted",
  });
  assert.match(errors.join("\n"), /unexpected property raw_prompt/);
});

test("benchmark evidence cannot omit privacy, limitation, or confidence", () => {
  const benchmarkSchema = readSchema("benchmark-evidence.schema.json");
  const evidence = {
    schema_version: "1.0.0",
    classification: "official_platform",
    source: "Official runtime documentation",
    source_date: null,
    inspected_at: "2026-08-03T12:00:00.000Z",
    applicability: "Defines the supported host behavior.",
    tradeoff: "The host has different installation surfaces.",
    recommendation: "Use each host's native discovery path.",
    deviation: null,
    limitation: "Runtime authentication is checked separately.",
    query_privacy: "PASS",
    confidence: "high",
  };
  assert.equal(assertSchema(benchmarkSchema, evidence), evidence);

  const { confidence: _confidence, ...incomplete } = evidence;
  assert.match(validateSchema(benchmarkSchema, incomplete).join("\n"), /missing required property confidence/);
});

test("all specialists share one structured result contract", () => {
  const specialistSchema = readSchema("specialist-result.schema.json");
  const result = {
    schema_version: "1.0.0",
    module: "backend-api",
    applicable: true,
    trigger_evidence: ["An authenticated API contract changes."],
    risk: "high",
    user_consequence: "A mistake could expose or reject the wrong request.",
    decisions: [{ kind: "invariant", statement: "Authorization is checked server-side." }],
    benchmark_evidence: [{
      classification: "explicit_contract",
      source: "Repository security policy",
      inspected_at: "2026-08-03T12:00:00.000Z",
      applicability: "Controls this endpoint.",
      limitation: null,
      confidence: "high",
      query_privacy: "NOT APPLICABLE",
    }],
    existing_evidence: [{ status: "EXPLICIT", source: "security.md", fact: "Every request is authorized." }],
    unknowns: [],
    proposed_questions: [],
    verification: ["Attempt access as the wrong account."],
    recovery: ["Disable the route and restore the prior contract."],
  };
  assert.equal(assertSchema(specialistSchema, result), result);

  assert.match(
    validateSchema(specialistSchema, { ...result, module: "general-reviewer" }).join("\n"),
    /allowed set/,
  );
  assert.match(
    validateSchema(specialistSchema, { ...result, existing_evidence: ["looks safe"] }).join("\n"),
    /expected type object/,
  );
});

test("task attempts must record a changed strategy and actual evidence", () => {
  const taskSchema = readSchema("task-record.schema.json");
  const task = {
    schema_version: "1.0.0",
    task_id: "release-check",
    status: "VERIFYING",
    repository: "/work/super-outer",
    branch: "codex/outer-v4.0.0",
    base: "main",
    mode: "FULL",
    selected_modules: ["delivery-release"],
    allowed_actions: ["verify"],
    allowed_paths: ["."],
    allowed_destinations: [],
    plan: "Verify the exact candidate.",
    created_at: "2026-08-03T12:00:00.000Z",
    attempt_limit: 4,
    minute_budget: 60,
    attempts: [{
      attempt_number: 1,
      recorded_at: "2026-08-03T12:05:00.000Z",
      elapsed_minutes: 5,
      strategy: "Run the complete isolated verification suite.",
      change: "First verification attempt.",
      evidence: ["77 tests passed."],
      result: "CONTINUE",
    }],
  };
  assert.equal(assertSchema(taskSchema, task), task);

  const withoutEvidence = structuredClone(task);
  withoutEvidence.attempts[0].evidence = [];
  assert.match(validateSchema(taskSchema, withoutEvidence).join("\n"), /needs at least 1 items/);
});

test("delivery and rollback results keep every proof layer explicit", () => {
  const layer = { status: "NOT APPLICABLE", evidence_sha256: null, limitation: "This layer does not apply to the task." };
  const delivery = {
    schema_version: "1.0.0",
    task_id: "docs-only",
    head: "a".repeat(40),
    depth: "QUICK",
    status: "PASS",
    layers: {
      source: { status: "PASS", evidence_sha256: "b".repeat(64), limitation: null },
      ci: layer,
      package: layer,
      installation: layer,
      host_discovery: layer,
      hook_runtime: layer,
      journey: layer,
      migration: layer,
      rollback: layer,
    },
    failures: [],
  };
  assert.equal(assertSchema(readSchema("delivery-result.schema.json"), delivery), delivery);

  const rollback = {
    schema_version: "1.0.0",
    status: "ROLLED_BACK",
    rolled_back: true,
    idempotent: false,
    transaction_id: "transaction-1",
    restored_targets: 4,
    v3_restored: true,
    v4_active: false,
    reason: null,
    migration_record: null,
  };
  assert.equal(assertSchema(readSchema("rollback-result.schema.json"), rollback), rollback);

  const hiddenLayer = structuredClone(delivery);
  delete hiddenLayer.layers.rollback;
  assert.match(validateSchema(readSchema("delivery-result.schema.json"), hiddenLayer).join("\n"), /missing required property rollback/);
});

test("repository enforcement settings are portable and contain no machine paths", () => {
  const setting = {
    schema_version: "1.0.0",
    enabled: true,
    base_ref: "origin/main",
    mode: "local-git-hook",
    command: "super-outer repo verify --commit-gate",
  };
  assert.equal(assertSchema(readSchema("repository-enforcement.schema.json"), setting), setting);
  assert.match(
    validateSchema(readSchema("repository-enforcement.schema.json"), { ...setting, cli: "/Users/name/plugin.mjs" }).join("\n"),
    /unexpected property cli/,
  );
});

// The router is the producer of this schema, so its real output must validate,
// including archetype routes with the twelve-question allowance and the change shape.
test("real router output validates against the route-decision schema", () => {
  for (const description of [
    "Fix the timeout on the research endpoint",
    "Add push notifications for new readings",
    "Build a new writing editor where selecting a passage shows sources beside it",
    "Redesign the folder screen and rename the tabs",
    "rename the helper",
  ]) {
    assert.deepEqual(validateSchema(schema, routeTask({ description })), [], description);
  }
});
