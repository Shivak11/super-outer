// Replays responses recorded from the live sources on 25 October 2026
// (tests/fixtures/tool-check). pypi-requests.json had its `releases` block
// removed when it was saved; the trimmer reads only `info`. Live calls never
// decide a test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { inPublisherNamespace, trim } from "../src/tool-check-trim.mjs";

const fixture = (name) => fs.readFileSync(path.join("tests", "fixtures", "tool-check", name), "utf8");

test("skills.sh search keeps source, skill and installs, including a renamed skill's old entry", () => {
  const lines = trim("skills-search", fixture("skills-search-expo.json"));
  // Expo's docs name the current skill expo-upgrade; upgrading-expo is the old name,
  // gone from expo/skills but still listed with more installs. The vet step catches it.
  assert.ok(lines.includes("expo/skills expo-upgrade 27521"));
  assert.ok(lines.includes("expo/skills upgrading-expo 42163"));
  assert.ok(lines.every((line) => /^\S+ \S+ \d+$/.test(line)));
});

test("a novel need on skills.sh returns only small authors", () => {
  assert.deepEqual(trim("skills-search", fixture("skills-search-canvas.json")), [
    "velt-js/agent-skills velt-cursors-best-practices 15",
    "glebis/claude-skills sketch 12",
  ]);
});

test("the vendor's own skill keeps its real install count, below 1,000", () => {
  assert.ok(trim("skills-search", fixture("skills-search-liveblocks.json")).includes("liveblocks/skills liveblocks-best-practices 881"));
});

test("an audit with every scan passing gives a pass verdict", () => {
  const lines = trim("skills-audit", fixture("skills-audit-liveblocks.json"));
  assert.equal(lines.at(-1), "verdict: pass");
  assert.equal(lines.length, 5);
});

test("one failed scan holds the candidate back", () => {
  const audit = JSON.parse(fixture("skills-audit-liveblocks.json"));
  audit.audits[1].status = "fail";
  assert.match(trim("skills-audit", JSON.stringify(audit)).at(-1), /^verdict: hold: Socket fail/);
});

test("the MCP Registry keeps only the publisher's own server", () => {
  const lines = trim("mcp-registry", fixture("mcp-registry-cloudflare.json"), { publisher: "cloudflare" });
  assert.equal(lines[0], "com.cloudflare.mcp/mcp 1.0.0 https://github.com/cloudflare/mcp-server-cloudflare namespace=publisher");
  assert.match(lines[1], /^\d+ other servers outside cloudflare's namespace dropped$/);
  assert.equal(lines.length, 2);
});

test("namespace rule: own domain or GitHub account counts, look-alikes do not", () => {
  assert.equal(inPublisherNamespace("com.cloudflare.mcp/mcp", "cloudflare"), true);
  assert.equal(inPublisherNamespace("io.github.tldraw/mcp", "tldraw"), true);
  assert.equal(inPublisherNamespace("com.trycloudflare.abc/x", "cloudflare"), false);
  assert.equal(inPublisherNamespace("com.jojapi/bypass-cloudflare-api", "cloudflare"), false);
  assert.equal(inPublisherNamespace("io.github.jananadiw/codex-tldraw-mcp", "tldraw"), false);
  assert.equal(inPublisherNamespace("ai.smithery/supabase", "supabase"), false);
});

test("npm keeps the latest version and the publisher", () => {
  assert.deepEqual(trim("npm", fixture("npm-expo-latest.json")), ["expo latest=58.0.19 owner=expo repo=https://github.com/expo/expo.git"]);
});

test("a deprecated npm package is flagged with its notice", () => {
  const lines = trim("npm", fixture("npm-request-latest.json"));
  assert.match(lines[1], /^deprecated: request has been deprecated/);
});

test("PyPI keeps the latest version and the source owner", () => {
  assert.deepEqual(trim("pypi", fixture("pypi-requests.json")), ["requests latest=2.34.2 owner=psf repo=https://github.com/psf/requests"]);
});

test("a wrong or unknown response gives one plain line and never throws", () => {
  assert.deepEqual(trim("npm", fixture("skills-audit-liveblocks.json")), ["npm: response was not the expected JSON"]);
  assert.deepEqual(trim("npm", "<html>"), ["npm: response was not the expected JSON"]);
  assert.match(trim("bower", "{}")[0], /^unknown source "bower"/);
});

test("the command reads stdin and prints only the kept lines", () => {
  const run = spawnSync(process.execPath, ["bin/super-outer.mjs", "tool-check", "trim", "npm"], { input: fixture("npm-expo-latest.json"), encoding: "utf8", env: { ...process.env, SUPER_OUTER_JEV: "off" } });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "expo latest=58.0.19 owner=expo repo=https://github.com/expo/expo.git\n");
});

test("the command refuses a missing source", () => {
  const run = spawnSync(process.execPath, ["bin/super-outer.mjs", "tool-check", "trim"], { input: "", encoding: "utf8", env: { ...process.env, SUPER_OUTER_JEV: "off" } });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^Use: super-outer tool-check trim/);
});
