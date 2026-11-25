import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { answer, listForMilestone, readSuggestions, recentFile, recordCandidate, suggestionsFile } from "../src/suggestions.mjs";

process.env.SUPER_OUTER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "so-data-"));
const fresh = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-suggest-"));
  fs.mkdirSync(path.join(root, ".git"));
  return root;
};

test("four timing queries against a live URL become one pending candidate", () => {
  const root = fresh();
  for (let i = 0; i < 4; i += 1) recordCandidate({ root, toolName: "Bash", summary: `curl -w '%{time_total}' https://api.example.com/health #${i}` });
  const state = readSuggestions(root);
  const pending = state.suggestions.filter((s) => s.status === "pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].trigger, "repeated-live-timing");
  assert.ok(pending[0].text.length > 0 && pending[0].triggerHash.length === 64);
  assert.ok(fs.existsSync(suggestionsFile(root)));
});

test("three queries are not enough and the window stays small", () => {
  const root = fresh();
  for (let i = 0; i < 3; i += 1) recordCandidate({ root, toolName: "Bash", summary: "curl https://api.example.com/x" });
  assert.equal(readSuggestions(root).suggestions.length, 0);
  for (let i = 0; i < 100; i += 1) recordCandidate({ root, toolName: "Read", summary: `read file ${i}` });
  assert.ok(JSON.parse(fs.readFileSync(recentFile(root), "utf8")).recent.length <= 20);
});

test("polling loops, home-made schedulers and print debugging are detected and deduped", () => {
  const root = fresh();
  recordCandidate({ root, toolName: "Edit", summary: "while true; do curl ...; sleep 5; done" });
  recordCandidate({ root, toolName: "Edit", summary: "added setInterval(sendReminders, 60000) to server.js" });
  recordCandidate({ root, toolName: "Edit", summary: "added setInterval(sendReminders, 60000) to server.js" });
  recordCandidate({ root, toolName: "Bash", summary: "console.log('DEBUG live user', id) then tail prod logs" });
  const triggers = readSuggestions(root).suggestions.map((s) => s.trigger).sort();
  assert.deepEqual(triggers, ["home-made-scheduler", "polling-loop", "print-debugging-live"]);
});

test("never throws on bad input or an unwritable root, and never calls the network", () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network used"); };
  try {
    assert.doesNotThrow(() => recordCandidate({}));
    assert.doesNotThrow(() => recordCandidate({ root: "/dev/null/nope", toolName: "Bash", summary: "sleep 5; retry" }));
    assert.doesNotThrow(() => recordCandidate({ root: fresh(), toolName: null, summary: { x: 1 } }));
  } finally {
    globalThis.fetch = original;
  }
});

test("a summary that looks secret is not kept", () => {
  const root = fresh();
  recordCandidate({ root, toolName: "Bash", summary: "export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD" });
  const file = suggestionsFile(root);
  assert.ok(!fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes("sk-proj"));
});

test("milestone lists pending once, marks shown, and answers stick", () => {
  const root = fresh();
  recordCandidate({ root, toolName: "Edit", summary: "added cron '0 9 * * *' string in jobs.js" });
  const first = listForMilestone(root);
  assert.equal(first.length, 1);
  assert.equal(readSuggestions(root).suggestions[0].status, "shown");
  assert.equal(listForMilestone(root).length, 0);
  assert.equal(answer(root, first[0].id, "dismissed"), true);
  assert.equal(answer(root, first[0].id, "bogus"), false);
  recordCandidate({ root, toolName: "Edit", summary: "added cron '0 9 * * *' string in jobs.js" });
  assert.equal(readSuggestions(root).suggestions[0].status, "dismissed");
});

test("a dismissed suggestion returns only when its trigger hash changes", () => {
  const root = fresh();
  recordCandidate({ root, toolName: "Edit", summary: "added setInterval(poll, 1000) in a.js" });
  const [s] = listForMilestone(root);
  answer(root, s.id, "dismissed");
  recordCandidate({ root, toolName: "Edit", summary: "added setInterval(poll, 1000) in a.js" });
  assert.equal(listForMilestone(root).length, 0);
  recordCandidate({ root, toolName: "Edit", summary: "added setInterval(syncAll, 5000) in b.js" });
  const again = listForMilestone(root);
  assert.equal(again.length, 1);
  assert.equal(again[0].trigger, "home-made-scheduler");
});

test("recent commands stay outside the project and an ordinary call writes nothing there", () => {
  const root = fresh();
  recordCandidate({ root, toolName: "Bash", summary: "ls src/private-path" });
  assert.equal(fs.existsSync(suggestionsFile(root)), false);
  assert.ok(fs.readFileSync(recentFile(root), "utf8").includes("private-path"));
  for (let i = 0; i < 4; i += 1) recordCandidate({ root, toolName: "Bash", summary: `curl -w '%{time_total}' https://api.example.com/h #${i}` });
  assert.equal(fs.readFileSync(suggestionsFile(root), "utf8").includes("private-path"), false);
});

test("a folder that is not a repository is never written to", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-norepo-"));
  for (let i = 0; i < 4; i += 1) recordCandidate({ root, toolName: "Bash", summary: `curl -w '%{time_total}' https://api.example.com/h #${i}` });
  assert.equal(fs.existsSync(path.join(root, ".engineering")), false);
});
