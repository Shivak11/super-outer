import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  renderManagedGuidance,
  planManagedGuidance,
  applyManagedGuidance,
  removeManagedGuidance,
  managedGuidanceVersion,
  BEGIN_MARKER,
  END_MARKER,
} from "../src/managed-guidance.mjs";
import { SUPER_OUTER_VERSION } from "../src/constants.mjs";

const tmpFile = (contents = null) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "so-guidance-"));
  const file = path.join(dir, "CLAUDE.md");
  if (contents !== null) fs.writeFileSync(file, contents);
  return file;
};

test("the block reports the installed runtime version, not a hand-typed one", () => {
  const rendered = renderManagedGuidance();
  assert.match(rendered, new RegExp(`installed guidance \\(v${SUPER_OUTER_VERSION.replace(/\./g, "\\.")}\\)`));
  // The label that started this: never claim a major version by hand again.
  assert.doesNotMatch(rendered, /Super-outer v4\b/);
});

test("appending preserves every byte the author wrote", () => {
  const original = "# My notes\n\nSome personal rules I care about.\n";
  const file = tmpFile(original);
  const plan = applyManagedGuidance(file);
  assert.equal(plan.action, "append");
  const after = fs.readFileSync(file, "utf8");
  assert.ok(after.startsWith(original), "author's text must be untouched at the top");
  assert.match(after, new RegExp(BEGIN_MARKER));
  assert.match(after, new RegExp(END_MARKER));
});

test("a later install replaces only the block, never the surrounding file", () => {
  const file = tmpFile("# Mine\n\nkeep me\n");
  applyManagedGuidance(file, "5.4.0");
  fs.appendFileSync(file, "\n## My own section after the block\n\nalso keep me\n");

  applyManagedGuidance(file, "6.6.0");
  const after = fs.readFileSync(file, "utf8");
  assert.match(after, /installed guidance \(v6\.6\.0\)/);
  assert.doesNotMatch(after, /v5\.4\.0/);
  assert.match(after, /keep me/);
  assert.match(after, /My own section after the block/);
  assert.match(after, /also keep me/);
  // Exactly one block, never a duplicate.
  assert.equal(after.split(BEGIN_MARKER).length - 1, 1);
});

test("an unmanaged Super-outer section is refused, not overwritten", () => {
  const handWritten = "# Global\n\n## Super-outer v4 — warn first\n\nMy own wording.\n";
  const file = tmpFile(handWritten);
  const plan = planManagedGuidance(file);
  assert.equal(plan.action, "refuse");
  assert.match(plan.reason, /rename or remove that heading/);
  // Nothing written.
  applyManagedGuidance(file);
  assert.equal(fs.readFileSync(file, "utf8"), handWritten);
});

test("removal restores the author's file", () => {
  const original = "# Mine\n\nkeep me\n";
  const file = tmpFile(original);
  applyManagedGuidance(file);
  assert.notEqual(fs.readFileSync(file, "utf8"), original);
  const result = removeManagedGuidance(file);
  assert.equal(result.changed, true);
  assert.match(fs.readFileSync(file, "utf8"), /^# Mine\n\nkeep me\n$/);
});

test("a missing file is created with the block alone", () => {
  const file = tmpFile(null);
  const plan = applyManagedGuidance(file);
  assert.equal(plan.exists, false);
  assert.match(fs.readFileSync(file, "utf8"), new RegExp(BEGIN_MARKER));
});

test("version skew is detectable from the file itself", () => {
  const file = tmpFile("# Mine\n");
  applyManagedGuidance(file, "5.4.0");
  assert.equal(managedGuidanceVersion(file), "5.4.0");
  applyManagedGuidance(file, "6.6.0");
  assert.equal(managedGuidanceVersion(file), "6.6.0");
  assert.equal(managedGuidanceVersion(path.join(os.tmpdir(), "definitely-absent-so.md")), null);
});

test("re-running an install makes no change once the block is current", () => {
  const file = tmpFile("# Mine\n");
  applyManagedGuidance(file);
  const first = fs.readFileSync(file, "utf8");
  const second = applyManagedGuidance(file);
  assert.equal(second.changed, false, "idempotent");
  assert.equal(fs.readFileSync(file, "utf8"), first);
});

/**
 * Shiva's own machine keeps `## Super-outer — my own additions` beside the
 * managed block. That is notes, not a competing guidance section: the block
 * must still install and the notes must survive.
 */
test("personal notes headed Super-outer do not block the block", () => {
  const file = tmpFile("# Mine\n\n## Super-outer — my own additions\n\nNever lose this line.\n");
  const plan = planManagedGuidance(file);
  assert.equal(plan.action, "append");
  applyManagedGuidance(file);
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /Never lose this line\./);
  assert.match(text, /## Super-outer — installed guidance/);
});
