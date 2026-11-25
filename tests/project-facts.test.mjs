import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readProjectFacts } from "../src/project-facts.mjs";
import { routeTask } from "../src/router.mjs";

const repo = (files = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-facts-"));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), body);
  }
  return root;
};

test("an empty folder has no deploy facts", () => {
  assert.deepEqual(readProjectFacts(repo()), { deploys: false, platform: null, observability: "unknown", anchors: null, firedTriggers: [] });
});

test("a missing or unreadable root never throws", () => {
  assert.equal(readProjectFacts(path.join(os.tmpdir(), "does-not-exist-so")).deploys, false);
  assert.equal(readProjectFacts(undefined).deploys, false);
});

test("wrangler.jsonc with comments and observability on reads as cloudflare, on", () => {
  const facts = readProjectFacts(repo({ "wrangler.jsonc": '{\n // worker\n "name": "a", /* x */ "observability": { "enabled": true },\n}\n' }));
  assert.equal(facts.deploys, true);
  assert.equal(facts.platform, "cloudflare");
  assert.equal(facts.observability, "on");
});

test("wrangler.toml without observability reads as off", () => {
  const facts = readProjectFacts(repo({ "wrangler.toml": 'name = "a"\nmain = "src/index.ts"\n' }));
  assert.equal(facts.platform, "cloudflare");
  assert.equal(facts.observability, "off");
});

test("wrangler.toml with [observability] enabled = true reads as on", () => {
  assert.equal(readProjectFacts(repo({ "wrangler.toml": 'name = "a"\n[observability]\nenabled = true\n' })).observability, "on");
});

test("a wrangler.<env>.jsonc variant counts", () => {
  const facts = readProjectFacts(repo({ "wrangler.staging.jsonc": '{ "observability": { "enabled": false } }' }));
  assert.equal(facts.platform, "cloudflare");
  assert.equal(facts.observability, "off");
});

test("vercel, supabase and fly configs are recognised", () => {
  assert.equal(readProjectFacts(repo({ "vercel.json": "{}" })).platform, "vercel");
  assert.equal(readProjectFacts(repo({ "supabase/config.toml": 'project_id = "x"\n' })).platform, "supabase");
  assert.equal(readProjectFacts(repo({ "fly.toml": 'app = "x"\n' })).platform, "fly");
});

test("product brief anchors are read", () => {
  const facts = readProjectFacts(repo({ ".engineering/super-outer/product-brief.md": "---\nschema: super-outer-product-brief/1\nnow: 1 owner\nnext: 100 users in weeks\n---\n# Product brief: x\n" }));
  assert.deepEqual(facts.anchors, { now: "1 owner", next: "100 users in weeks" });
});

test("fired ledger triggers are listed from the metrics snapshot", () => {
  const root = repo({
    ".engineering/super-outer/ledger.json": JSON.stringify({ entries: [{ id: "cache", prompt: "Add caching", status: "DEFERRED", revisitWhen: [], measuredWhen: [{ metric: "users", comparison: ">=", threshold: 100, ladder: "100" }] }] }),
    ".engineering/super-outer/metrics.json": JSON.stringify({ measured_at: "2026-10-20", metrics: { users: 140 } }),
  });
  const facts = readProjectFacts(root);
  assert.deepEqual(facts.firedTriggers.map((item) => item.id), ["cache"]);
});

test("a deployed project opens observability once, and none without facts", () => {
  const description = "Add a settings screen for the reminder bot";
  const without = routeTask({ description });
  const withFacts = routeTask({ description, facts: { deploys: true, platform: "cloudflare", observability: "off" } });
  assert.ok(withFacts.selected_modules.includes("observability-operations"));
  assert.equal(withFacts.selected_modules.filter((id) => id === "observability-operations").length, 1);
  assert.deepEqual(routeTask({ description, facts: { deploys: false } }).selected_modules, without.selected_modules);
});

for (const word of ["latency", "slow", "p95", "timeout", "performance"]) {
  test(`the word "${word}" opens observability`, () => {
    const route = routeTask({ description: `The reply endpoint has a ${word} problem in production` });
    assert.ok(route.selected_modules.includes("observability-operations"), route.selected_modules.join(","));
  });
}

test("anchors written on one line, as the product brief shows them", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const p = await import("node:path");
  const { readProjectFacts } = await import("../src/project-facts.mjs");
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), "pf-inline-"));
  fs.mkdirSync(p.join(dir, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(p.join(dir, ".engineering/super-outer/product-brief.md"), "Scale: now: 1 owner; next: 100 users in weeks\n");
  const { anchors } = readProjectFacts(dir);
  assert.deepEqual(anchors, { now: "1 owner", next: "100 users in weeks" });
});
