import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MODEL } from "../src/jev/client.mjs";
import { loadSettings } from "../src/jev/settings.mjs";

// v5.10: the decision model is a setting, so a successor served on the same
// System One endpoint (such as Microsoft-Decision-1) can replace Jev by name.

const configWith = (lines) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-jev-model-"));
  fs.writeFileSync(path.join(dir, "jev.env"), `${lines.join("\n")}\n`, { mode: 0o600 });
  return dir;
};

test("with no model named, the default model is used", () => {
  const settings = loadSettings({ env: {}, configDir: configWith(["SUPER_OUTER_OPENROUTER_KEY=sk-test"]) });
  assert.equal(settings.model, undefined);
  assert.equal(MODEL, "typesafe/jev-1.13");
});

test("a model named in the key file or the environment is used", () => {
  const dir = configWith(["SUPER_OUTER_OPENROUTER_KEY=sk-test", "SUPER_OUTER_JEV_MODEL=microsoft/decision-1"]);
  assert.equal(loadSettings({ env: {}, configDir: dir }).model, "microsoft/decision-1");
  assert.equal(loadSettings({ env: { SUPER_OUTER_JEV_MODEL: "typesafe/jev-1.14" }, configDir: dir }).model, "typesafe/jev-1.14");
});

test("a value that is not a model name is ignored", () => {
  for (const value of ["https://example.com/model", "../../etc/passwd", "a b c"]) {
    const dir = configWith(["SUPER_OUTER_OPENROUTER_KEY=sk-test", `SUPER_OUTER_JEV_MODEL=${value}`]);
    assert.equal(loadSettings({ env: {}, configDir: dir }).model, undefined, value);
  }
});
