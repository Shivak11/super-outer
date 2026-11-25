import assert from "node:assert/strict";
import test from "node:test";

import { planDiagrams } from "../src/diagram-plan.mjs";

test("a new outside service or deploy config asks for an architecture diagram", () => {
  assert.deepEqual(planDiagrams({ changedFiles: ["wrangler.toml"] }), ["architecture"]);
  assert.deepEqual(planDiagrams({ changedFiles: ["README.md"], facts: { partsChanged: true } }), ["architecture"]);
});

test("a changed AI or data process asks for a pipeline diagram", () => {
  assert.deepEqual(planDiagrams({ changedFiles: ["src/prompts/summarise.md", "src/pipeline/ingest.ts"] }), ["pipeline"]);
});

test("a changed endpoint asks for code-flow only when a developer will maintain it", () => {
  assert.deepEqual(planDiagrams({ changedFiles: ["api/orders/export.ts"], facts: { maintainer: "developer" } }), ["code-flow"]);
  assert.deepEqual(planDiagrams({ changedFiles: ["api/orders/export.ts"], facts: { maintainer: "owner" } }), []);
  assert.deepEqual(planDiagrams({ changedFiles: ["server/routes/upload.py"] }), { unclear: true }, "unknown maintainer is unclear");
});

test("one-problem is never planned, and unrelated changes plan nothing", () => {
  assert.deepEqual(planDiagrams({ changedFiles: ["docs/notes.md", "src/components/Button.tsx"] }), []);
  assert.deepEqual(planDiagrams({}), []);
  const all = planDiagrams({ changedFiles: ["vercel.json", "src/llm/agent.ts", "api/x.ts"], facts: { maintainer: "developer" } });
  assert.deepEqual(all, ["architecture", "pipeline", "code-flow"]);
  assert.ok(!all.includes("one-problem"));
});
