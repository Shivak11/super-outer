import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPECIALIST_MODULES, SUPER_OUTER_VERSION } from "../src/constants.mjs";
import { routeTask } from "../src/router.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesRoot = path.join(root, "skills", "super-outer", "modules");
const requiredSections = [
  "Triggers",
  "Non-triggers",
  "Progressive playbooks",
  "Router-facing method",
  "Decision kinds",
  "Source hierarchy",
  "Required result",
  "Plain-English question guidance",
  "Comparable evaluation cases",
];
const resultFields = [
  "schema_version",
  "module",
  "applicable",
  "trigger_evidence",
  "risk",
  "user_consequence",
  "decisions",
  "benchmark_evidence",
  "existing_evidence",
  "unknowns",
  "proposed_questions",
  "verification",
  "recovery",
];
const caseNames = ["positive", "negative", "boundary", "failure", "recovery"];

const words = (text) => text.match(/[A-Za-z0-9][A-Za-z0-9/-]*/g)?.length ?? 0;
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("canonical router, skill table, modules, playbook directories, and evals cannot drift", async () => {
  const canonicalIds = SPECIALIST_MODULES.map(({ id }) => id).sort();
  assert.equal(canonicalIds.length, 12);

  const skill = await read("skills/super-outer/SKILL.md");
  const evals = JSON.parse(await read("evals/specialists.json"));
  const evalIds = evals.module_evaluations.map(({ module }) => module).sort();
  assert.deepEqual(evalIds, canonicalIds);

  const topLevel = await readdir(modulesRoot, { withFileTypes: true });
  const entryIds = topLevel
    .filter((item) => item.isFile() && item.name.endsWith(".md"))
    .map((item) => item.name.slice(0, -3))
    .sort();
  assert.deepEqual(entryIds, canonicalIds);

  const playbookDirectoryIds = [];
  for (const item of topLevel.filter((candidate) => candidate.isDirectory())) {
    const subplaybooks = path.join(modulesRoot, item.name, "subplaybooks");
    let files = [];
    try {
      files = await readdir(subplaybooks);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (files.some((file) => file.endsWith(".md"))) playbookDirectoryIds.push(item.name);
  }
  assert.deepEqual(playbookDirectoryIds.sort(), canonicalIds);

  for (const id of canonicalIds) {
    assert.match(skill, new RegExp("modules/" + id + "\\.md"));
    const entry = await read(`skills/super-outer/modules/${id}.md`);
    assert.match(entry, new RegExp("Module ID: `" + id + "`"));
  }
});

test("all peer modules expose the same router contract and progressive content shape", async () => {
  const entryWordCounts = [];
  const playbookWordCounts = [];

  for (const { id } of SPECIALIST_MODULES) {
    const relative = `skills/super-outer/modules/${id}.md`;
    const entry = await read(relative);
    entryWordCounts.push(words(entry));

    for (const section of requiredSections) {
      assert.match(entry, new RegExp(`^## ${section}$`, "m"), `${id} lacks ${section}`);
    }
    for (const field of resultFields) {
      assert.match(entry, new RegExp(`\\b${field}\\b`), `${id} lacks ${field}`);
    }
    for (const caseName of caseNames) {
      const heading = caseName[0].toUpperCase() + caseName.slice(1);
      assert.match(entry, new RegExp(`^### ${heading}$`, "m"), `${id} lacks ${heading}`);
    }

    assert.match(entry, /router-only `proposed_questions`/);
    assert.match(entry, /Never ask the user|Never ask which|Never ask the user to/);
    assert.match(entry, /source-authority\.md/);
    assert.match(entry, /specialist-result-contract\.md/);

    const links = [...entry.matchAll(/\]\(([^)]+\/subplaybooks\/[^)]+\.md)\)/g)].map(
      ([, target]) => target,
    );
    assert.equal(links.length, 3, `${id} must route to exactly three sub-playbooks`);
    assert.equal(new Set(links).size, 3);
    for (const target of links) {
      assert.ok(target.startsWith(`${id}/subplaybooks/`), `${id} has non-canonical ${target}`);
      const playbook = await read(`skills/super-outer/modules/${target}`);
      playbookWordCounts.push(words(playbook));
      for (const section of ["Load boundary", "Review", "Failure probes and proof", "Recovery"]) {
        assert.match(playbook, new RegExp(`^## ${section}$`, "m"), `${target} lacks ${section}`);
      }
      for (const caseName of ["Positive", "Negative", "Boundary"]) {
        assert.match(playbook, new RegExp(`\\b${caseName}:`), `${target} lacks ${caseName}`);
      }
      assert.ok(words(playbook) >= 100, `${target} is too thin for specialist use`);
    }
  }

  assert.ok(Math.min(...entryWordCounts) >= 350, "a peer entry is materially thinner than required");
  assert.ok(
    Math.max(...entryWordCounts) / Math.min(...entryWordCounts) <= 1.35,
    `peer entry depth is imbalanced: ${entryWordCounts.join(", ")}`,
  );
  assert.ok(
    Math.max(...playbookWordCounts) / Math.min(...playbookWordCounts) <= 1.7,
    "progressive playbook depth is materially imbalanced",
  );
});

test("specialist evaluations provide comparable positive negative boundary failure and recovery cases", async () => {
  const evals = JSON.parse(await read("evals/specialists.json"));
  assert.equal(evals.schema_version, "1.0.0");
  assert.equal(evals.module_evaluations.length, 12);
  assert.equal(evals.execution_contract.runner, "src/router.mjs#routeTask");
  assert.deepEqual(evals.execution_contract.required_selected_cases, ["positive", "failure", "recovery"]);
  assert.deepEqual(evals.execution_contract.required_rejected_cases, ["negative"]);
  assert.deepEqual(
    Object.keys(evals.execution_contract.boundary_selection).sort(),
    SPECIALIST_MODULES.map(({ id }) => id).sort(),
  );

  for (const evaluation of evals.module_evaluations) {
    assert.equal(evaluation.entry, `skills/super-outer/modules/${evaluation.module}.md`);
    assert.equal(evaluation.playbooks.length, 3);
    assert.deepEqual(Object.keys(evaluation.cases).sort(), [...caseNames].sort());
    for (const caseName of caseNames) {
      const scenario = evaluation.cases[caseName];
      assert.ok(scenario.prompt.length >= 20);
      assert.ok(scenario.expect.length >= 2);
    }

    for (const caseName of evals.execution_contract.required_selected_cases) {
      const decision = routeTask({ description: evaluation.cases[caseName].prompt });
      assert.ok(
        decision.selected_modules.includes(evaluation.module),
        `${evaluation.module} ${caseName} did not select its specialist: ${JSON.stringify(decision)}`,
      );
    }

    for (const caseName of evals.execution_contract.required_rejected_cases) {
      const decision = routeTask({ description: evaluation.cases[caseName].prompt });
      assert.ok(
        !decision.selected_modules.includes(evaluation.module),
        `${evaluation.module} ${caseName} activated an irrelevant specialist: ${JSON.stringify(decision)}`,
      );
    }

    const boundaryDecision = routeTask({ description: evaluation.cases.boundary.prompt });
    assert.equal(
      boundaryDecision.selected_modules.includes(evaluation.module),
      evals.execution_contract.boundary_selection[evaluation.module],
      `${evaluation.module} boundary routing contradicted its executable expectation`,
    );
  }
});

test("specialist references reserve all user interviewing for the router", async () => {
  const resultContract = await read("skills/super-outer/references/specialist-result-contract.md");
  const questionContract = await read("skills/super-outer/references/plain-english-questions.md");
  assert.match(resultContract, /Specialists do not\s+interview the user/);
  assert.match(resultContract, /The router alone may ask them/);
  assert.match(questionContract, /Specialists propose; the router alone asks/);
  assert.match(questionContract, /CRITICAL one consolidated interview/);
});

test("flow-first guidance stays plain, narrow, and consistent across public docs", async () => {
  const files = await Promise.all([
    read("skills/super-outer/SKILL.md"),
    read("skills/super-outer/modules/delivery-release.md"),
    read("README.md"),
    read("docs/architecture.md"),
    read("docs/evidence-boundaries.md"),
  ]);
  const [skill, delivery, readme] = files;
  const guidance = files.join("\n");

  // Pinned to the constant so a version bump cannot leave a document behind.
  const version = SUPER_OUTER_VERSION.replace(/\./g, "\\.");
  assert.match(skill, new RegExp(`Version: \`${version}\``));
  assert.match(readme, new RegExp(`Version: \`${version}\``));
  assert.match(readme, /Platform support is macOS and Linux\. Windows is unsupported/);
  // A developer who clones the repository must find the command that actually
  // switches Super-outer on, without reading the installer source to find it.
  assert.match(readme, /```sh\nnpm run setup\n```/);
  assert.match(guidance, /engineering design and management layer, not a permission system/i);
  assert.match(guidance, /ordinary.*code changes.*without.*approval/is);
  assert.match(guidance, /video.*analysis/is);
  assert.match(guidance, /CI reruns?/i);
  assert.match(guidance, /Unknown does not mean (?:critical|dangerous)/i);
  assert.match(guidance, /branch mismatch is normally advisory/i);
  assert.match(guidance, /Independent review is advisory for `?QUICK`?, `?FOCUSED`?, and `?FULL`?/i);
  assert.match(guidance, /extremely critical action or a `?CRITICAL`? production-proof claim/i);
  assert.match(guidance, /orange `?\u26a0\ufe0f Worth a look`?/i);
  assert.match(guidance, /red `?\u{1F6D1} Stopping here`?/iu);
  assert.match(guidance, /emoji.*without colour/is);
  assert.match(guidance, /Worth a look.*Stopping here/is);
  assert.match(delivery, /Branch mismatch and separate-review gaps normally warn and continue/);
  assert.match(guidance, /production or\s+private data.*permissions.*secrets.*payments.*infrastructure.*external.*rollback.*audit/is);
});
