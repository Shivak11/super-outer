import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ARCHETYPE_QUESTION_BUDGET,
  QUESTION_BUDGETS,
  SCORE_DIMENSIONS,
  SPECIALIST_MODULES,
} from "../src/constants.mjs";
import { routeTask, selectedModuleIds } from "../src/router.mjs";

const fixturePath = new URL("./fixtures/routing/golden.json", import.meta.url);
const goldenScenarios = JSON.parse(await readFile(fixturePath, "utf8"));

test("registers twelve peer engineering modules", () => {
  assert.equal(SPECIALIST_MODULES.length, 12);
  assert.equal(new Set(SPECIALIST_MODULES.map(({ id }) => id)).size, 12);
  assert.ok(SPECIALIST_MODULES.some(({ id }) => id === "product-ui-ux-motion"));
  assert.ok(SPECIALIST_MODULES.some(({ id }) => id === "frontend-client"));
  assert.ok(SPECIALIST_MODULES.some(({ id }) => id === "backend-api"));
});

test("route decisions expose exactly the versioned schema fields", () => {
  const decision = routeTask({ task_id: "shape", description: "Backend API work" });
  assert.deepEqual(Object.keys(decision).sort(), [
    "archetypes",
    "change_shape",
    "material",
    "mode",
    "question_budget",
    "schema_version",
    "scores",
    "selected_modules",
    "signals",
    "task_id",
  ]);
});

for (const scenario of goldenScenarios) {
  test(`balanced golden routing: ${scenario.name}`, () => {
    const route = routeTask({ description: scenario.description });
    assert.equal(route.mode, scenario.expectedMode);
    assert.deepEqual(selectedModuleIds(route).sort(), scenario.expectedModules.sort());
    // A matched anticipation library raises the ceiling above its tier. Before
    // 5.5.0 a full specialist room suppressed the match, so tier ceiling and
    // allowance were always identical and this assertion could not tell the
    // difference between the two rules.
    assert.equal(
      route.question_budget,
      route.archetypes.length > 0
        ? Math.max(QUESTION_BUDGETS[route.mode], ARCHETYPE_QUESTION_BUDGET)
        : QUESTION_BUDGETS[route.mode],
    );
    assert.equal(route.schema_version, "1.0.0");
    assert.equal(route.task_id, "unbound-task");
  });
}

test("backend-only work never activates UI/UX", () => {
  const modules = selectedModuleIds(
    routeTask({ description: "Change a backend API timeout contract" }),
  );
  assert.ok(modules.includes("backend-api"));
  assert.ok(modules.includes("reliability-recovery"));
  assert.ok(!modules.includes("product-ui-ux-motion"));
});

test("motion-only work loads motion but not backend or scale", () => {
  const route = routeTask({
    description: "Tune the animation transition and Reduce Motion behavior",
  });
  assert.deepEqual(selectedModuleIds(route), ["product-ui-ux-motion"]);
  assert.ok(route.scores["product-ui-ux-motion"].reasons.includes("playbook:motion"));
});

test("protected domains always escalate to CRITICAL", () => {
  for (const description of [
    "Change payment refunds",
    "Handle sensitive data",
    "Run a destructive migration that drops a table",
    "Update production infrastructure",
    "Request privileged access",
    "Perform an irreversible permanent deletion",
  ]) {
    const route = routeTask({ description });
    assert.equal(route.mode, "CRITICAL", description);
    assert.ok(selectedModuleIds(route).includes("security-privacy-abuse"));
    assert.ok(selectedModuleIds(route).includes("delivery-release"));
  }
});

test("common protected-language variants fail closed into CRITICAL review", () => {
  const cases = [
    ["Change OAuth token validation", ["backend-api"]],
    ["Add password reset", ["frontend-client", "backend-api"]],
    ["Delete a customer account and all its data", ["data-migrations", "reliability-recovery"]],
    ["Add biometric unlock", ["frontend-client"]],
    ["Change encryption key storage", ["data-migrations"]],
    ["Modify admin impersonation", ["backend-api"]],
    ["Rotate the TLS certificate", ["compatibility-integrations", "reliability-recovery"]],
    ["Disable auth checks for admin requests", []],
    ["Skip authentication on an internal endpoint", ["backend-api"]],
    ["Bypass authorization for support users", []],
    ["Purge all user data", ["data-migrations", "reliability-recovery"]],
    ["Wipe the accounts table", ["data-migrations", "reliability-recovery"]],
    ["Remove all rows from the user table", ["data-migrations", "reliability-recovery"]],
  ];
  for (const [description, relevantModules] of cases) {
    const route = routeTask({ description });
    assert.equal(route.mode, "CRITICAL", description);
    assert.ok(route.selected_modules.includes("security-privacy-abuse"), description);
    assert.ok(route.selected_modules.includes("delivery-release"), description);
    for (const moduleId of relevantModules) {
      assert.ok(route.selected_modules.includes(moduleId), `${description}: ${moduleId}`);
    }
  }
});

test("a statement that authentication is out of scope does not create protected work", () => {
  const route = routeTask({
    description: "Do not add authentication; only rename a local variable.",
    changedFiles: ["src/local-name.mjs"],
  });
  assert.equal(route.mode, "QUICK");
  assert.ok(!route.selected_modules.includes("security-privacy-abuse"));
  assert.ok(!route.selected_modules.includes("delivery-release"));
  assert.deepEqual(route.signals.filter((signal) => signal.startsWith("protected:")), []);
});

test("explicit negative wording suppresses only the irrelevant specialist", () => {
  const cases = [
    {
      description: "Fix a server timeout with no client-visible change.",
      absent: ["product-ui-ux-motion", "frontend-client"],
      present: ["backend-api", "reliability-recovery"],
    },
    {
      description: "Adjust a motion duration without service changes.",
      absent: ["backend-api"],
      present: ["product-ui-ux-motion"],
    },
    {
      description: "Change deterministic API validation without a model.",
      absent: ["ai-llm"],
      present: ["backend-api"],
    },
    {
      description: "Expose a public read endpoint without accounts.",
      absent: ["frontend-client", "ai-llm", "data-migrations"],
      present: ["backend-api", "security-privacy-abuse"],
    },
  ];
  for (const { description, absent, present } of cases) {
    const modules = selectedModuleIds(routeTask({ description }));
    for (const moduleId of absent) assert.ok(!modules.includes(moduleId), `${description}: ${moduleId}`);
    for (const moduleId of present) assert.ok(modules.includes(moduleId), `${description}: ${moduleId}`);
  }
});

test("explicit destructive and privileged flags activate protected review", () => {
  for (const input of [{ destructive: true }, { privileged: true }]) {
    const route = routeTask({ task_id: "flagged", description: "Change behavior", ...input });
    assert.equal(route.mode, "CRITICAL");
    assert.ok(route.selected_modules.includes("security-privacy-abuse"));
    assert.ok(route.selected_modules.includes("delivery-release"));
  }
});

test("small safe documentation work stays quiet", () => {
  const route = routeTask({
    description: "Fix a spelling typo",
    changedFiles: ["README.md"],
  });
  assert.equal(route.mode, "SMALL_SAFE");
  assert.deepEqual(route.selected_modules, []);
  assert.equal(route.question_budget, 0);
});

test("an unrecognised code task is not silently classified as small safe", () => {
  const route = routeTask({
    description: "Fix the parser bug",
    changedFiles: ["src/parser.mjs"],
  });
  assert.equal(route.material, true);
  assert.equal(route.mode, "QUICK");
});

test("scores every selected module from all six risk dimensions", () => {
  const route = routeTask({
    description: "Change a backend API",
    impact: 5,
    uncertainty: 4,
    novelty: 3,
    irreversibility: 2,
    boundaries: 1,
    evidenceGaps: 5,
  });
  const backend = route.scores["backend-api"];
  for (const dimension of SCORE_DIMENSIONS) {
    assert.ok(backend.reasons.some((reason) => reason.startsWith(`${dimension}:`)));
  }
  assert.equal(backend.score, 20);
});

test("module-specific evidence changes score without registry-order bias", () => {
  const input = {
    description: "Build a full-stack user-facing feature",
    moduleSignals: {
      "backend-api": { uncertainty: 5 },
      "product-ui-ux-motion": { uncertainty: 2 },
    },
  };
  const normal = routeTask(input);
  const reversed = routeTask(input, {
    moduleRegistry: [...SPECIALIST_MODULES].reverse(),
  });
  assert.deepEqual(normal, reversed);
  assert.equal(normal.selected_modules[0], "backend-api");
});

test("explicit review modes observe hard question budgets", () => {
  assert.deepEqual(QUESTION_BUDGETS, {
    SMALL_SAFE: 0,
    QUICK: 2,
    FOCUSED: 4,
    FULL: 7,
    CRITICAL: 7,
  });
});
