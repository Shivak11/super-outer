import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  orderBySequence,
  partitionBySequence,
  readLedger,
  recordDeferrals,
  dueDeferrals,
  ledgerHealth,
  LEDGER_ATTENTION_LIMIT,
  recordObligation,
  markObligationProved,
  openObligations,
  describeObligationGap,
  readObligations,
} from "../src/sequencing.mjs";
import { loadArchetypes, detectArchetypes, archetypeDecisions } from "../src/archetypes.mjs";

const temporaryRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), "so-seq-"));

const mode = (id, sequence, extra = {}) => ({
  id,
  sequence,
  prompt: `Question for ${id}?`,
  why: "consequence",
  archetype: "test",
  ...extra,
});

// Fix 4 (schema): every shipped failure mode carries both new fields.
test("every core failure mode carries sequence and provenBy", () => {
  const library = loadArchetypes();
  for (const archetype of library.archetypes) {
    for (const failure of archetype.failureModes) {
      assert.ok(
        ["now", "decide", "defer"].includes(failure.sequence),
        `${archetype.id}:${failure.id} has no sequence class`,
      );
      assert.ok(
        typeof failure.provenBy === "string" && failure.provenBy.length > 10,
        `${archetype.id}:${failure.id} has no provenBy check`,
      );
    }
  }
});

// Fix 1: order by cost of being wrong, not by topic.
test("questions arrive now-first, and truncation keeps the now ones", () => {
  const shuffled = [mode("c", "defer"), mode("a", "decide"), mode("b", "now"), mode("d", "now")];
  const ordered = orderBySequence(shuffled);
  assert.deepEqual(ordered.map((d) => d.sequence), ["now", "now", "decide", "defer"]);
  // A budget of two keeps both `now` items — the ones ruinous to discover late.
  assert.deepEqual(ordered.slice(0, 2).map((d) => d.id), ["b", "d"]);
});

// Fix 2: defer never spends interview budget.
test("defer items are recorded, never asked", () => {
  const { ask, deferred } = partitionBySequence([
    mode("keep-1", "now"),
    mode("later", "defer"),
    mode("keep-2", "decide"),
  ]);
  assert.deepEqual(ask.map((d) => d.id), ["keep-1", "keep-2"]);
  assert.deepEqual(deferred.map((d) => d.id), ["later"]);
});

test("the capture archetype's defer items reach the ledger, not the interview", () => {
  const library = loadArchetypes();
  const [capture] = detectArchetypes("build a voice recording pipeline", library);
  const { decisions } = archetypeDecisions([capture], { root: null });
  const { ask, deferred } = partitionBySequence(decisions);
  // permission-loss and storage-pressure are defer in the shipped library.
  assert.ok(deferred.some((d) => d.id.endsWith("permission-loss")));
  assert.ok(!ask.some((d) => d.id.endsWith("permission-loss")));

  const root = temporaryRepo();
  const ledger = recordDeferrals(root, deferred, { now: "2026-08-08T00:00:00Z" });
  assert.equal(ledger.entries.length, deferred.length);
  assert.equal(ledger.entries[0].status, "DEFERRED");
  assert.ok(ledger.entries[0].revisitWhen.length > 0, "a deferral needs a checkable trigger");
  // Recording twice must not duplicate.
  const again = recordDeferrals(root, deferred, { now: "2026-08-08T01:00:00Z" });
  assert.equal(again.entries.length, deferred.length);
});

// Fix 3: triggers are repository conditions, and they re-fire on their own.
test("a deferral comes due when the repository starts containing its trigger", () => {
  const root = temporaryRepo();
  recordDeferrals(root, [
    mode("rate-limit", "defer", { revisitWhen: ["public endpoint"] }),
    mode("i18n", "defer", { revisitWhen: ["locale"] }),
  ]);
  const ledger = readLedger(root);

  const nothing = dueDeferrals(root, ledger, { search: () => null });
  assert.equal(nothing.length, 0, "no trigger present → stays quiet");

  const due = dueDeferrals(root, ledger, {
    search: (needle) => (needle === "public endpoint" ? "src/api/public.ts" : null),
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].id, "rate-limit");
  assert.equal(due[0].evidence, "src/api/public.ts");
});

test("the ledger says so when it has become a wishlist", () => {
  const root = temporaryRepo();
  const many = Array.from({ length: LEDGER_ATTENTION_LIMIT + 2 }, (_, i) =>
    mode(`entry-${i}`, "defer", { revisitWhen: ["never"] }),
  );
  recordDeferrals(root, many);
  const health = ledgerHealth(readLedger(root));
  assert.equal(health.overloaded, true);
  assert.match(health.note, /wishlist/);

  const fine = ledgerHealth({ entries: many.slice(0, 3).map((m) => ({ ...m, status: "DEFERRED" })) });
  assert.equal(fine.overloaded, false);
  assert.equal(fine.note, null);
});

// Fix 4: a taken decision produces an UNPROVEN obligation.
test("an answered question becomes an UNPROVEN proof obligation", () => {
  const root = temporaryRepo();
  recordObligation(root, {
    id: "mobile-capture-upload:local-durability",
    decision: "Must a finished recording survive until the server confirms it?",
    answer: "Keep it until confirmed",
    provenBy: "a test that kills the app after recording and asserts the recording is still uploaded on next launch",
  });
  const open = openObligations(root);
  assert.equal(open.length, 1);
  assert.equal(open[0].status, "UNPROVEN");
  assert.match(open[0].provenBy, /kills the app/);
  // Recording the same obligation twice must not duplicate it.
  recordObligation(root, { id: "mobile-capture-upload:local-durability", provenBy: "x" });
  assert.equal(readObligations(root).obligations.length, 1);
});

test("proving requires named evidence — 'it works' is not evidence", () => {
  const root = temporaryRepo();
  recordObligation(root, { id: "q1", decision: "d", answer: "a", provenBy: "a test" });
  assert.throws(() => markObligationProved(root, "q1", ""), /named evidence/);
  markObligationProved(root, "q1", "tests/upload-durability.test.ts");
  assert.equal(openObligations(root).length, 0);
  assert.equal(readObligations(root).obligations[0].evidence, "tests/upload-durability.test.ts");
});

// Fix 5: a delivery claim cannot silently pass an open obligation.
test("open obligations are reported in plain English for a delivery claim", () => {
  const root = temporaryRepo();
  assert.equal(describeObligationGap(root), null);
  recordObligation(root, {
    id: "a",
    decision: "recordings never lost",
    answer: "keep until confirmed",
    provenBy: "kill-app test",
  });
  recordObligation(root, { id: "b", decision: "one charge per tap", answer: "charge once", provenBy: "double-submit test" });
  const gap = describeObligationGap(root);
  assert.match(gap, /2 decisions are not yet proved/);
  assert.match(gap, /recordings never lost/);
  assert.match(gap, /must say so/);
});
