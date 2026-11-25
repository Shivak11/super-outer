import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { hasManifest, managingFramework, readStack, summariseStack } from "../src/stack-facts.mjs";
import { inventory, summarise } from "../src/inventory.mjs";

const project = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-stack-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
};

test("an Expo project lists every package; Expo's peers are not marked by name pattern", () => {
  const root = project({
    "package.json": JSON.stringify({ dependencies: { expo: "~54.0.12", "react-native": "0.81.4", "react-native-purchases": "^7.0.0", zustand: "^5.0.0" }, devDependencies: { typescript: "~5.9.2" } }),
    "eas.json": "{}",
    "app.json": "{}",
  });
  const facts = readStack(root);
  assert.deepEqual(facts.manifests["package.json"], [
    { name: "expo", version: "~54.0.12" },
    { name: "react-native", version: "0.81.4" },
    { name: "react-native-purchases", version: "^7.0.0" },
    { name: "zustand", version: "^5.0.0" },
    { name: "typescript", version: "~5.9.2", dev: true },
  ]);
  assert.deepEqual(facts.config, ["eas.json", "app.json"]);
});

test("a framework whose packages move together marks them, and the summary names them", () => {
  const root = project({ "package.json": JSON.stringify({ dependencies: { "@angular/core": "^19.0.0", "@angular/router": "^19.0.0", rxjs: "^7.8.0" } }) });
  const facts = readStack(root);
  assert.equal(facts.manifests["package.json"][1].managedBy, "@angular/core");
  assert.match(summariseStack(facts).join("\n"), /package\.json: @angular\/core@\^19\.0\.0, rxjs@\^7\.8\.0; managed by @angular\/core: @angular\/router/);
});

test("React Native without Expo is not marked as managed", () => {
  assert.equal(managingFramework("react-native", new Set(["react-native"])), null);
  assert.equal(managingFramework("react-native", new Set(["react-native", "expo"])), null);
});

test("a Cloudflare Worker lists its config file and marks build-only packages", () => {
  const root = project({ "package.json": JSON.stringify({ devDependencies: { wrangler: "^4.20.0" } }), "wrangler.jsonc": "{}" });
  const facts = readStack(root);
  assert.deepEqual(facts.manifests["package.json"], [{ name: "wrangler", version: "^4.20.0", dev: true }]);
  assert.deepEqual(facts.config, ["wrangler.jsonc"]);
});

test("manifests three folders down are read, and deeper ones are named as skipped", () => {
  const root = project({
    "apps/web/deep/package.json": JSON.stringify({ dependencies: { lodash: "^4.17.0" } }),
    "apps/web/deep/er/package.json": JSON.stringify({ dependencies: { lodash: "^3.0.0" } }),
  });
  const facts = readStack(root);
  assert.ok(facts.manifests["apps/web/deep/package.json"]);
  assert.deepEqual(facts.deeper, ["apps/web/deep/er"]);
  assert.match(summariseStack(facts).join("\n"), /Too deep, not read: apps\/web\/deep\/er/);
});

test("a dependency no list knows is listed like any other", () => {
  const root = project({ "package.json": JSON.stringify({ dependencies: { "@tldraw/tldraw": "^3.9.0" } }) });
  assert.deepEqual(readStack(root).manifests["package.json"], [{ name: "@tldraw/tldraw", version: "^3.9.0" }]);
});

test("Python manifests are read: requirements.txt and pyproject.toml", () => {
  const root = project({
    "requirements.txt": "# web\nrequests==2.31.0\nfastapi[all]>=0.110\n-r other.txt\nnumpy\n",
    "pyproject.toml": '[project]\nname = "x"\ndependencies = [\n  "httpx>=0.27",\n  "pydantic[email]==2.8.0",\n]\n\n[tool.poetry.dependencies]\npython = "^3.12"\nrich = "^13.0"\n',
  });
  const facts = readStack(root);
  assert.deepEqual(facts.manifests["requirements.txt"], [
    { name: "requests", version: "==2.31.0" },
    { name: "fastapi", version: ">=0.110" },
    { name: "numpy", version: "" },
  ]);
  assert.deepEqual(facts.manifests["pyproject.toml"], [
    { name: "httpx", version: ">=0.27" },
    { name: "pydantic", version: "==2.8.0" },
    { name: "rich", version: "^13.0" },
  ]);
});

test("Cargo, Go, Ruby and CocoaPods manifests are read", () => {
  const root = project({
    "Cargo.toml": '[package]\nname = "x"\n\n[dependencies]\nserde = { version = "1.0", features = ["derive"] }\ntokio = "1.40"\n',
    "go.mod": "module x\n\ngo 1.23\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n\tgolang.org/x/text v0.20.0 // indirect\n)\n",
    "Gemfile": "source 'https://rubygems.org'\ngem 'rails', '~> 8.0'\ngem 'puma'\n",
    "ios/Podfile": "target 'App' do\n  pod 'Firebase/Analytics', '~> 11.0'\nend\n",
  });
  const facts = readStack(root);
  assert.deepEqual(facts.manifests["Cargo.toml"], [{ name: "serde", version: "1.0" }, { name: "tokio", version: "1.40" }]);
  assert.deepEqual(facts.manifests["go.mod"], [{ name: "github.com/gin-gonic/gin", version: "v1.10.0" }]);
  assert.deepEqual(facts.manifests.Gemfile, [{ name: "rails", version: "~> 8.0" }, { name: "puma", version: "" }]);
  assert.deepEqual(facts.manifests["ios/Podfile"], [{ name: "Firebase/Analytics", version: "~> 11.0" }]);
});

test("a corrupt package.json is listed as seen, not read, and nothing throws", () => {
  const root = project({ "package.json": "{ not json" });
  const facts = readStack(root);
  assert.deepEqual(facts.manifests, {});
  assert.deepEqual(facts.unread, ["package.json"]);
  assert.match(summariseStack(facts).join("\n"), /Seen, not read: package\.json/);
});

test("an empty folder has no stack and no manifest", () => {
  const root = project({});
  assert.deepEqual(readStack(root), { manifests: {}, unread: [], config: [], deeper: [], samples: [] });
  assert.equal(hasManifest(root), false);
  assert.deepEqual(readStack("/no/such/folder"), { manifests: {}, unread: [], config: [], deeper: [], samples: [] });
});

test("node_modules is never read", () => {
  const root = project({ "package.json": "{}", "node_modules/left-pad/package.json": JSON.stringify({ dependencies: { evil: "1" } }) });
  assert.deepEqual(Object.keys(readStack(root).manifests), ["package.json"]);
});

test("inventory carries the stack and its summary prints it", () => {
  const root = project({ "package.json": JSON.stringify({ dependencies: { expo: "~54.0.12" } }) });
  const result = inventory(root);
  assert.deepEqual(result.stack.manifests["package.json"], [{ name: "expo", version: "~54.0.12" }]);
  assert.match(summarise(result), /Stack: package\.json: expo@~54\.0\.12/);
});
