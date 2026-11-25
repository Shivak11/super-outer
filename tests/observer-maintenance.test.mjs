import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replace(/\s+/g, " ");
const skill = () => read("skills/super-outer/SKILL.md");
const delivery = () => read("skills/super-outer/modules/delivery-release/subplaybooks/package-install-runtime.md");

test("requested tools receive an early fit verdict without replacing the objective", () => {
  assert.match(skill(), /opening lines[\s\S]*what it adds[\s\S]*without it/);
  assert.match(skill(), /optional[\s\S]*order the work by/);
});

test("provider selection checks native capability and setup prerequisites", () => {
  const text = read("skills/super-outer/modules/compatibility-integrations.md");
  for (const term of ["existing storage", "account permissions", "sender domains", "signup", "recovery", "missing setup", "missing capability"]) {
    assert.ok(text.includes(term), `Missing provider decision evidence: ${term}`);
  }
  assert.match(text, /established library[\s\S]*hosted provider/);
});

test("repository inspection detects independent sibling work before writing", () => {
  for (const file of ["AGENTS.md", "skills/super-outer/SKILL.md"]) {
    const text = read(file);
    assert.match(text, /git worktree list --porcelain/);
    assert.match(text, /git status --short/);
    assert.match(text, /snapshot[\s\S]*at detection/);
    assert.match(text, /which session continues/);
  }
});

test("release guidance compares enabled source and preserves historical versions", () => {
  assert.ok(delivery().includes("references/release-lineage-and-versioning.md"));
  const text = read("skills/super-outer/references/release-lineage-and-versioning.md");
  for (const term of ["enabled copy", "trunk", "source branch", "owner", "pull request", "same day", "allowlist", "version-consistency.test.mjs", "historical"]) {
    assert.ok(text.includes(term), `Missing release guidance: ${term}`);
  }
  assert.match(text, /unknown provenance[\s\S]*unproved/);
});

test("questions exclude unusable credential options", () => {
  const text = read("skills/super-outer/references/plain-english-questions.md");
  assert.match(text, /current permissions/);
  assert.match(text, /Do not search unrelated projects/);
  assert.match(text, /user's own terminal/);
  assert.match(skill(), /options the session can execute/);
});

test("verification requires recorded component inputs and private-safe old/new replay", () => {
  assert.ok(skill().includes("references/proof-and-recorded-inputs.md"));
  for (const file of ["skills/super-outer/references/proof-and-recorded-inputs.md", "agents/failure-scout.md", "agents/independent-verifier.md"]) {
    const text = read(file);
    for (const term of ["recorded population", "old and new", "intended", "unexpected", "unchanged", "private text", "recorded component input", "model-visible"]) {
      assert.ok(text.includes(term), `${file} lacks ${term}`);
    }
    assert.match(text, /unrecognised[\s\S]*finding/);
    assert.match(text, /coverage[\s\S]*gap/);
  }
});

test("the four historical comments retain the actual original release", () => {
  assert.match(read("src/router.mjs"), /Until 5\.5\.0 a full room/);
  assert.match(read("hooks/super-outer-hook.mjs"), /Until 5\.5\.0 nothing invoked/);
  assert.match(read("tests/router.test.mjs"), /5\.5\.0 a full specialist room/);
  assert.match(read("scripts/install-cursor.mjs"), /while the hooks ran 5\.5\.0/);
});
