import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadGlossary, plainPhraseFor, glossaryPolicy } from "../src/glossary.mjs";
import { chooseModeForTest } from "../src/router.mjs";

test("the core glossary loads with no vault present", () => {
  const glossary = loadGlossary();
  assert.ok(glossary.entries.size > 20, "core dictionary must be substantive");
  assert.equal(glossary.vaultLoaded, false);
  assert.equal(plainPhraseFor("rollback", glossary), "going back to the previous version safely");
  assert.equal(plainPhraseFor("ROLLBACK", glossary), "going back to the previous version safely");
});

test("an unreachable vault degrades silently rather than throwing", () => {
  const glossary = loadGlossary({
    vaultGlossaryDirectory: "/nonexistent/vault/references/glossary",
  });
  assert.equal(glossary.vaultLoaded, false);
  assert.equal(glossary.vaultTermCount, 0);
  // The core must still be fully usable — this is the Codex/Cursor/CI case.
  assert.ok(glossary.entries.size > 20);
  assert.ok(plainPhraseFor("idempotent", glossary));
});

test("a reachable vault enriches and overrides the core", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "so-glossary-"));
  fs.writeFileSync(
    path.join(directory, "rollback.md"),
    "---\nterm: rollback\nplain: undoing the release and going back\n---\n",
  );
  fs.writeFileSync(
    path.join(directory, "rhythm-corpus.md"),
    "---\nterm: rhythm corpus\nplain: the set of recordings a person has made\n---\n",
  );
  fs.writeFileSync(path.join(directory, "not-a-term.md"), "no frontmatter here\n");

  const glossary = loadGlossary({ vaultGlossaryDirectory: directory });
  assert.equal(glossary.vaultLoaded, true);
  assert.equal(glossary.vaultTermCount, 2);
  assert.equal(plainPhraseFor("rollback", glossary), "undoing the release and going back");
  assert.equal(
    plainPhraseFor("rhythm corpus", glossary),
    "the set of recordings a person has made",
  );
  assert.equal(plainPhraseFor("not-a-term", glossary), null);
});

test("the same term resolves identically across repeated loads", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "so-glossary-det-"));
  fs.writeFileSync(
    path.join(directory, "blast-radius.md"),
    "---\nterm: blast radius\nplain: how much breaks if this goes wrong\n---\n",
  );
  const runs = [0, 1, 2, 3, 4].map(
    () => plainPhraseFor("blast radius", loadGlossary({ vaultGlossaryDirectory: directory })),
  );
  assert.equal(new Set(runs).size, 1, "lookup must be reproducible, not ranked");
  assert.equal(glossaryPolicy.semanticSearch, false);
  assert.equal(glossaryPolicy.writesToVault, false);
});

// Guard for the plan's non-goal: fixing the question floor must not make the
// critical boundary easier or harder to reach.
test("CRITICAL routing is unchanged by the question floor", () => {
  const base = {
    input: {},
    specialists: [],
    dimensions: { impact: 0 },
    protectedIds: [],
    smallSafe: false,
  };
  assert.equal(chooseModeForTest({ ...base, protectedIds: ["authentication"] }), "CRITICAL");
  assert.equal(chooseModeForTest({ ...base, input: { destructive: true } }), "CRITICAL");
  assert.equal(chooseModeForTest({ ...base, input: { privileged: true } }), "CRITICAL");
  // An ordinary bug fix must still NOT be critical — the floor gives it a
  // question, not a gate.
  assert.equal(
    chooseModeForTest({ ...base, specialists: [{ id: "backend-api" }], dimensions: { impact: 2 } }),
    "QUICK",
  );
  assert.equal(chooseModeForTest({ ...base, smallSafe: true }), "SMALL_SAFE");
});
