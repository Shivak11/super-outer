import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { LEDGER_PATH, checkLedger, parseMetrics, readLedger, recordDeferrals, validateMeasuredWhen } from "../src/sequencing.mjs";

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "so-ladder-"));
const step = (ladder, threshold) => ({ metric: "daily_users", comparison: ">=", threshold, ladder });

test("a ladder stage on a measured trigger is recorded and kept", () => {
  const dir = root();
  recordDeferrals(dir, [{ id: "queue", prompt: "Move sends to a queue", why: "x", measuredWhen: [step("10000", 10000)] }]);
  const [entry] = readLedger(dir).entries;
  assert.equal(entry.measuredWhen[0].ladder, "10000");
});

test("a ladder stage must be a user count written as digits", () => {
  for (const stage of ["100", "10000", "1000000"]) assert.deepEqual(validateMeasuredWhen([step(stage, 1)]), []);
  assert.ok(validateMeasuredWhen([step("lots", 1)]).length > 0);
  assert.ok(validateMeasuredWhen([{ ...step("100", 1), ladder: 100 }]).length > 0);
});

test("an old ledger with no ladder field still checks", () => {
  const dir = root();
  fs.mkdirSync(path.join(dir, path.dirname(LEDGER_PATH)), { recursive: true });
  fs.writeFileSync(path.join(dir, LEDGER_PATH), JSON.stringify({ entries: [{ id: "c", prompt: "Cache", status: "DEFERRED", revisitWhen: [], measuredWhen: [{ metric: "daily_users", comparison: ">", threshold: 5 }] }] }));
  const result = checkLedger(dir, readLedger(dir), { search: () => null, metrics: parseMetrics({ metrics: { daily_users: 9 } }) });
  assert.equal(result.due.length, 1);
});

test("a due ladder trigger reports its stage", () => {
  const dir = root();
  recordDeferrals(dir, [{ id: "q", prompt: "Queue", why: "x", measuredWhen: [step("100", 100)] }]);
  const result = checkLedger(dir, readLedger(dir), { search: () => null, metrics: parseMetrics({ metrics: { daily_users: 120 } }) });
  assert.equal(result.due[0].ladder, "100");
});
