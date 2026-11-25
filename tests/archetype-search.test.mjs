import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { repositoryAnswers } from "../src/archetypes.mjs";
import { routeTask } from "../src/router.mjs";

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const repository = (t, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-archetype-search-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q", "-b", "main");
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  git(root, "add", ".");
  return root;
};

test("a vendored copy of Super-outer does not answer its own questions", (t) => {
  const mode = { lookFor: ["backgroundUpload"] };
  const vendoredOnly = repository(t, {
    "plugins/super-outer/skills/super-outer/references/archetypes/mobile-capture-upload.json": "{\"lookFor\": [\"backgroundUpload\"]}\n",
    ".engineering/super-outer/design/editor/v1/manifest.json": "{\"note\": \"backgroundUpload\"}\n",
    "src/app.js": "export const ready = true;\n",
  });
  assert.equal(repositoryAnswers(mode, { root: vendoredOnly }), null);

  const handled = repository(t, {
    "plugins/super-outer/skills/super-outer/references/archetypes/mobile-capture-upload.json": "{\"lookFor\": [\"backgroundUpload\"]}\n",
    "src/upload.js": "export function backgroundUpload() {}\n",
  });
  assert.deepEqual(repositoryAnswers(mode, { root: handled }), { needle: "backgroundUpload", evidence: "src/upload.js" });
});

test("format and comment count as maintenance only in their code-editing sense", () => {
  const ids = (description) => routeTask({ description }).archetypes.map(({ id }) => id);
  assert.ok(ids("Let people export their data in a portable format").includes("data-rights"));
  assert.ok(ids("Let teammates comment on shared recordings in the team workspace").includes("teams-and-roles"));
  assert.deepEqual(ids("add comments to the upload helper"), []);
  assert.deepEqual(ids("Reorder comments in the voice module"), []);
});
