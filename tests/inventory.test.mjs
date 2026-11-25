import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inventory, summarise } from "../src/inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(root, "src", "inventory.mjs");

// The package leaves out every path with a .engineering folder in it, so the
// fixture's proof obligations are written into a temporary copy at run time.
// A test run from an installed copy then sees the same fixture as a checkout.
const PROOF_OBLIGATIONS = {
  project: "fixture-with-checks",
  created: "2026-09-14",
  obligations: [
    { id: "PO1", claim: "The result screen is reached by real taps and drags", provenBy: "a playwright-core run", status: "UNPROVEN" },
  ],
};
const copies = new Map();
const fixture = (name) => {
  if (name !== "repo-with-checks") return path.join(root, "tests", "fixtures", "inventory", name);
  if (copies.has(name)) return copies.get(name);
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "so-inventory-fixture-"));
  fs.cpSync(path.join(root, "tests", "fixtures", "inventory", name), copy, { recursive: true });
  fs.mkdirSync(path.join(copy, ".engineering", "super-outer"), { recursive: true });
  fs.writeFileSync(path.join(copy, ".engineering", "super-outer", "proof-obligations.json"), `${JSON.stringify(PROOF_OBLIGATIONS, null, 2)}\n`);
  process.on("exit", () => fs.rmSync(copy, { recursive: true, force: true }));
  copies.set(name, copy);
  return copy;
};

test("a repository with checks reports its scripts, browser tooling, rubric and proof obligations", () => {
  const result = inventory(fixture("repo-with-checks"));
  assert.equal(result.runnable, true);
  assert.equal(result.proseOnly, false);
  assert.deepEqual(result.codeManifests, ["package.json"]);
  assert.deepEqual(result.scripts.map((s) => s.name), ["test", "lint"]);
  assert.ok(result.checks.some((c) => c.startsWith("npm run test")));
  assert.ok(result.checks.some((c) => c.startsWith("npm run lint")));
  assert.deepEqual(result.browserTooling, ["playwright-core"]);
  assert.deepEqual(result.testFrameworks, ["vitest"]);
  assert.deepEqual(result.rubricFiles, ["docs/game-design-rubric.md"]);
  assert.equal(result.proofObligations, ".engineering/super-outer/proof-obligations.json");
  assert.equal(result.ledger, null);
  assert.ok(result.testFiles.includes("tests/play.test.mjs"));
  assert.ok(result.protectedFiles.includes("docs/game-design-rubric.md"));
  assert.ok(result.protectedFiles.includes("tests/play.test.mjs"));
  assert.ok(result.protectedFiles.includes(".engineering/super-outer/proof-obligations.json"));
  assert.deepEqual(result.approvedRecords, ["source/book-foundation.approved.json"]);
  assert.ok(result.protectedFiles.includes("source/book-foundation.approved.json"));
});

test("a repository without checks is runnable and reports none", () => {
  const result = inventory(fixture("repo-without-checks"));
  assert.equal(result.runnable, true);
  assert.equal(result.proseOnly, false);
  assert.deepEqual(result.checks, []);
  assert.deepEqual(result.browserTooling, []);
  assert.deepEqual(result.testFrameworks, []);
  assert.deepEqual(result.rubricFiles, []);
  assert.equal(result.proofObligations, null);
  assert.deepEqual(result.protectedFiles, []);
});

test("a prose-only folder is not runnable", () => {
  const result = inventory(fixture("prose-only"));
  assert.equal(result.runnable, false);
  assert.equal(result.proseOnly, true);
  assert.deepEqual(result.codeManifests, []);
  assert.equal(result.counts.code, 0);
  assert.equal(result.counts.prose, 3);
});

test("the summary ends with the runnable verdict and names what was found", () => {
  const text = summarise(inventory(fixture("repo-with-checks")));
  const lines = text.split("\n");
  assert.equal(lines.at(-1), "runnable: true");
  assert.ok(text.includes("playwright-core"));
  assert.ok(text.includes("docs/game-design-rubric.md"));
  assert.ok(text.includes("proof-obligations.json"));
  assert.equal(summarise(inventory(fixture("prose-only"))).split("\n").at(-1), "runnable: false");
});

// The module used to be a script that printed when it was run. The command
// layer now imports it, so importing it must print nothing and do nothing, and
// a round trip through JSON must return its result unchanged.
test("importing the module prints nothing and runs nothing", () => {
  const probe = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(modulePath).href)});`],
    { cwd: fixture("repo-with-checks"), encoding: "utf8" },
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout, "");
  assert.equal(probe.stderr, "");
});

test("the module imports only built-in Node modules, directly or through its own local modules", () => {
  const importsOf = (file) => [...fs.readFileSync(file, "utf8").matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map(([, specifier]) => specifier);
  const source = fs.readFileSync(modulePath, "utf8");
  assert.ok(importsOf(modulePath).length > 0, "no import statements found");
  // From 6.3 the inventory reads the stack through src/stack-facts.mjs, which must hold to the same rule.
  for (const specifier of importsOf(modulePath)) {
    if (specifier.startsWith("./")) {
      const local = path.join(path.dirname(modulePath), specifier);
      for (const inner of importsOf(local)) assert.match(inner, /^node:/, `${specifier} imports ${inner}, which is not a built-in module`);
      assert.doesNotMatch(fs.readFileSync(local, "utf8"), /\bimport\s*\(/, `${specifier} must not import anything at run time`);
    } else assert.match(specifier, /^node:/, `${specifier} is not a built-in module`);
  }
  assert.doesNotMatch(source, /\bimport\s*\(/, "the module must not import anything at run time");
});

test("the structured result is plain data that JSON keeps unchanged", () => {
  for (const name of ["repo-with-checks", "repo-without-checks", "prose-only"]) {
    const result = inventory(fixture(name));
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result, name);
  }
});

// Every file and folder inside the fixture, with its size and change time.
// The listing leaves out the folder above the fixture, which other tests
// change while this one runs.
const snapshot = (root) => {
  const rows = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(folder, entry.name);
      const stat = fs.lstatSync(absolute);
      rows.push(`${path.relative(root, absolute)} ${entry.isDirectory() ? "dir" : stat.size} ${stat.mtimeMs} ${stat.ctimeMs}`);
      if (entry.isDirectory()) walk(absolute);
    }
  };
  walk(root);
  return rows.join("\n");
};

test("the inventory never writes", () => {
  const before = snapshot(fixture("repo-with-checks"));
  inventory(fixture("repo-with-checks"));
  summarise(inventory(fixture("repo-with-checks")));
  assert.equal(snapshot(fixture("repo-with-checks")), before);
});
