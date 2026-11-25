// Adapted from Super-outer Experimental's tests/ledger.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendRecord, domainCounts, readRecord, recordDir, pruneRecord } from "../src/jev/record.mjs";

const temporary = (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jev-record-")));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const mode = (target) => fs.statSync(target).mode & 0o777;
const KEY = "test-key-0123456789";
const NOW = new Date("2026-10-07T10:15:02.113Z");
const row = (extra = {}) => ({ ts: NOW.toISOString(), repo: "Super-outer", status: "used", prompt_head: "design the empty state screen", ...extra });
const linesIn = (file) => fs.readFileSync(file, "utf8").trimEnd().split("\n");

test("the record folder is jev-record inside the data folder", () => {
  assert.equal(recordDir("/data/super-outer"), path.join("/data/super-outer", "jev-record"));
});

test("a row is one JSON line in the file for its UTC day, in a folder and a file that only the owner can read", (t) => {
  const dataDir = path.join(temporary(t), "share", "super-outer");
  assert.equal(appendRecord({ dataDir, row: row(), key: KEY, now: NOW }), true);
  const folder = recordDir(dataDir);
  const file = path.join(folder, "2026-10-07.jsonl");
  assert.deepEqual(linesIn(file).map((line) => JSON.parse(line)), [row()]);
  assert.equal(mode(folder), 0o700);
  assert.equal(mode(file), 0o600);
});

test("the day comes from UTC, so a late evening in India and an early morning in California each land on the UTC date", (t) => {
  const dataDir = temporary(t);
  appendRecord({ dataDir, row: row(), now: new Date("2026-10-07T23:30:00+05:30") });
  appendRecord({ dataDir, row: row(), now: new Date("2026-10-07T20:30:00-07:00") });
  assert.deepEqual(fs.readdirSync(recordDir(dataDir)).sort(), ["2026-10-07.jsonl", "2026-10-08.jsonl"]);
});

test("each call adds one line and leaves the earlier lines as they were", (t) => {
  const dataDir = temporary(t);
  appendRecord({ dataDir, row: row({ repo: "first" }), now: NOW });
  const file = path.join(recordDir(dataDir), "2026-10-07.jsonl");
  const before = fs.readFileSync(file, "utf8");
  appendRecord({ dataDir, row: row({ repo: "second" }), now: NOW });
  const after = fs.readFileSync(file, "utf8");
  assert.ok(after.startsWith(before));
  assert.deepEqual(linesIn(file).map((line) => JSON.parse(line).repo), ["first", "second"]);
});

test("a folder and a file that others could read are made readable by the owner only when a row is written", (t) => {
  const dataDir = temporary(t);
  const folder = recordDir(dataDir);
  fs.mkdirSync(folder, { mode: 0o755 });
  fs.chmodSync(folder, 0o755);
  const file = path.join(folder, "2026-10-07.jsonl");
  fs.writeFileSync(file, "", { mode: 0o644 });
  fs.chmodSync(file, 0o644);
  appendRecord({ dataDir, row: row(), now: NOW });
  assert.deepEqual([mode(folder), mode(file)], [0o700, 0o600]);
});

test("a row that holds the key is replaced by its bare outline, and the key never reaches the file", (t) => {
  const dataDir = temporary(t);
  for (const leaked of [row({ prompt_head: `please use ${KEY} for this` }), row({ model: KEY }), row({ nested: { deep: [`Bearer ${KEY}`] } })]) {
    assert.equal(appendRecord({ dataDir, row: leaked, key: KEY, now: NOW }), true);
  }
  const text = fs.readFileSync(path.join(recordDir(dataDir), "2026-10-07.jsonl"), "utf8");
  assert.equal(text.includes(KEY), false);
  assert.deepEqual(
    linesIn(path.join(recordDir(dataDir), "2026-10-07.jsonl")).map((line) => JSON.parse(line)),
    Array.from({ length: 3 }, () => ({ ts: NOW.toISOString(), status: "error", reason: "key_in_row" })),
  );
});

test("a row without the key is kept whole, and an empty key never matches", (t) => {
  const dataDir = temporary(t);
  appendRecord({ dataDir, row: row(), key: KEY, now: NOW });
  appendRecord({ dataDir, row: row(), key: "", now: NOW });
  appendRecord({ dataDir, row: row(), key: null, now: NOW });
  assert.deepEqual(readRecord({ dataDir }), [row(), row(), row()]);
});

// From the 5.8.0 review: files were kept for 31 whole days. Now the file
// dated 30 days back is deleted, so no row is older than 30 days.
test("files dated 30 or more days before now are deleted when a row is written, and nothing else in the folder is touched", (t) => {
  const dataDir = temporary(t);
  const folder = recordDir(dataDir);
  fs.mkdirSync(folder, { recursive: true });
  const names = ["2026-09-06.jsonl", "2026-09-07.jsonl", "2026-09-08.jsonl", "2026-08-01.jsonl", "2026-10-06.jsonl", "notes.txt", "2026-09-01.jsonl.bak", "2026-9-1.jsonl"];
  for (const name of names) fs.writeFileSync(path.join(folder, name), `${JSON.stringify(row({ file: name }))}\n`);
  assert.equal(appendRecord({ dataDir, row: row(), now: new Date("2026-10-07T23:59:59.000Z") }), true);
  assert.deepEqual(fs.readdirSync(folder).sort(), [
    "2026-09-01.jsonl.bak",
    "2026-09-08.jsonl",
    "2026-10-06.jsonl",
    "2026-10-07.jsonl",
    "2026-9-1.jsonl",
    "notes.txt",
  ]);
});

test("pruneRecord deletes old files without writing a row, and never creates the folder", (t) => {
  const dataDir = temporary(t);
  pruneRecord({ dataDir, now: new Date("2026-10-07T12:00:00.000Z") });
  assert.equal(fs.existsSync(recordDir(dataDir)), false);
  fs.mkdirSync(recordDir(dataDir), { recursive: true });
  for (const name of ["2026-09-01.jsonl", "2026-10-07.jsonl"]) fs.writeFileSync(path.join(recordDir(dataDir), name), "{}\n");
  pruneRecord({ dataDir, now: new Date("2026-10-07T12:00:00.000Z") });
  assert.deepEqual(fs.readdirSync(recordDir(dataDir)), ["2026-10-07.jsonl"]);
});

test("appendRecord never throws and returns false when the row cannot be written", (t) => {
  const blocked = path.join(temporary(t), "a-file-not-a-folder");
  fs.writeFileSync(blocked, "not a folder");
  assert.equal(appendRecord({ dataDir: blocked, row: row(), now: NOW }), false);
  assert.equal(appendRecord({ dataDir: undefined, row: row(), now: NOW }), false);
  assert.equal(appendRecord({ dataDir: temporary(t), row: row(), now: new Date("not a date") }), false);
  assert.equal(appendRecord({ dataDir: temporary(t), row: undefined, now: NOW }), false);
  const circular = row();
  circular.self = circular;
  assert.equal(appendRecord({ dataDir: temporary(t), row: circular, now: NOW }), false);
  assert.equal(appendRecord(), false);
});

test("the rows of every day file are read back oldest file first, and a damaged line is skipped", (t) => {
  const dataDir = temporary(t);
  appendRecord({ dataDir, row: row({ repo: "october" }), now: new Date("2026-10-02T08:00:00.000Z") });
  appendRecord({ dataDir, row: row({ repo: "september" }), now: new Date("2026-09-20T08:00:00.000Z") });
  fs.appendFileSync(path.join(recordDir(dataDir), "2026-09-20.jsonl"), "{ damaged line\n");
  fs.writeFileSync(path.join(recordDir(dataDir), "notes.txt"), "{\"repo\":\"not a record file\"}\n");
  assert.deepEqual(readRecord({ dataDir }).map(({ repo }) => repo), ["september", "october"]);
});

test("reading a record that does not exist gives no rows", (t) => {
  assert.deepEqual(readRecord({ dataDir: path.join(temporary(t), "nothing-here") }), []);
  assert.deepEqual(readRecord(), []);
});

test("the domain count starts every candidate domain at 0 and counts the rows Jev read at the threshold or above", () => {
  const rows = [
    { jev: { domains: { "mcp-ai-connectors": 0.9, "ai-coding-plugins": 0.5, "scheduled-jobs": 0.49, "habit-loops": 0.1 } } },
    { jev: { domains: { "mcp-ai-connectors": 0.7, "ai-coding-plugins": 0.2, "scheduled-jobs": 0.8, "habit-loops": "0.9" } } },
    { jev: null },
    { jev: { libraries: {} } },
    { status: "error", reason: "key_in_row" },
    null,
  ];
  assert.deepEqual(domainCounts([]), { "mcp-ai-connectors": 0, "ai-coding-plugins": 0, "scheduled-jobs": 0, "habit-loops": 0 });
  assert.deepEqual(domainCounts(rows), { "mcp-ai-connectors": 2, "ai-coding-plugins": 1, "scheduled-jobs": 1, "habit-loops": 0 });
  assert.deepEqual(domainCounts(rows, { threshold: 0.75 }), { "mcp-ai-connectors": 1, "ai-coding-plugins": 0, "scheduled-jobs": 1, "habit-loops": 0 });
  assert.deepEqual(domainCounts(undefined), { "mcp-ai-connectors": 0, "ai-coding-plugins": 0, "scheduled-jobs": 0, "habit-loops": 0 });
});
