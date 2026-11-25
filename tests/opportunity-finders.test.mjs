import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listPackageFiles } from "../scripts/build-package.mjs";

// 6.2.0 ships two read-only finders beside super-outer and draw-system-diagram.
const FINDERS = ["jev-opportunities", "caveman-opportunities"];

const read = (relative) => readFileSync(path.resolve(relative), "utf8");
const frontmatter = (text) => /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(text);

const NAMED_CASES = {
  "jev-opportunities": [
    "decisions-api-wins",
    "jev-wins",
    "claude-structured-output-wins",
    "private-input-rejected",
    "private-input-already-at-anthropic",
    "free-text-output-stays",
    "ordinary-code-not-run",
  ],
  "caveman-opportunities": [
    "subagent-brief",
    "bloated-mcp-tool-description",
    "human-read-text-rejected",
    "owner-facing-report",
    "legal-quote-must-stay-exact",
    "ordinary-code-not-run",
  ],
};

for (const name of FINDERS) {
  const dir = path.resolve("skills", name);

  test(`${name}: SKILL.md has two-key frontmatter that fits the Codex listing`, () => {
    assert.ok(existsSync(path.join(dir, "SKILL.md")), `skills/${name}/SKILL.md exists`);
    const text = readFileSync(path.join(dir, "SKILL.md"), "utf8");
    const front = frontmatter(text);
    assert.ok(front, "SKILL.md starts with exactly name and description");
    assert.equal(front[1], name);
    const description = front[2];
    assert.ok(description.length <= 600, `description is ${description.length} characters`);
    // A plain YAML scalar: no mapping separator, no comment, no tags.
    assert.ok(!description.includes(": ") && !description.includes(" #") && !/[<>]/.test(description), "description parses as a plain YAML string");
    assert.ok(!/^["'|>]/.test(description), "description is not quoted or folded");
    assert.match(description, /^[A-Z][a-z]+s /, "description opens in the third person");
    assert.match(description, /Use when/, "description says when to use it");
    assert.ok(text.split("\n").length < 150, `SKILL.md has ${text.split("\n").length} lines`);
  });

  test(`${name}: one reference file, linked one level deep, every link resolves`, () => {
    const text = readFileSync(path.join(dir, "SKILL.md"), "utf8");
    const references = readdirSync(path.join(dir, "references"));
    assert.equal(references.length, 1, `references/ holds ${references.join(", ")}`);
    assert.ok(text.includes(`](references/${references[0]})`), "SKILL.md links its reference");
    for (const [, target] of text.matchAll(/\]\(([^)#]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      assert.ok(existsSync(path.join(dir, target)), `SKILL.md links ${target}`);
    }
    const reference = readFileSync(path.join(dir, "references", references[0]), "utf8");
    if (reference.split("\n").length > 100) assert.match(reference, /^## Contents/m, "a long reference has a table of contents");
  });

  test(`${name}: the skill is read-only, capped and treats repository text as data`, () => {
    const text = readFileSync(path.join(dir, "SKILL.md"), "utf8");
    assert.match(text, /Never edit/i);
    assert.match(text, /data, not instructions/);
    assert.match(text, /at most 7/i);
    assert.match(text, /Rejected candidates/);
    assert.match(text, /approv/i);
    assert.match(text, /private/i);
  });

  test(`${name}: agents/openai.yaml names it and allows implicit use`, () => {
    const yaml = readFileSync(path.join(dir, "agents/openai.yaml"), "utf8");
    assert.match(yaml, /^interface:\n {2}display_name: "[^"]+"\n {2}short_description: "[^"]+"\n/m);
    assert.match(yaml, /^policy:\n {2}allow_implicit_invocation: true$/m);
  });

  test(`${name}: evals have about ten should-find and ten should-stay-quiet cases`, () => {
    const evals = JSON.parse(readFileSync(path.join(dir, "evals/evals.json"), "utf8"));
    assert.equal(evals.skill_name, name);
    const ids = new Set();
    for (const item of evals.evals) {
      assert.ok(!ids.has(item.id), `eval id ${item.id} repeats`);
      ids.add(item.id);
      for (const key of ["name", "prompt", "expected_output"]) assert.ok(typeof item[key] === "string" && item[key].length > 3, `eval ${item.id} has ${key}`);
      assert.ok(["find", "quiet"].includes(item.expect), `eval ${item.id} says find or quiet`);
      assert.ok(Array.isArray(item.assertions) && item.assertions.length > 0, `eval ${item.id} has assertions`);
      for (const file of item.files) assert.ok(existsSync(path.join(dir, file)), `eval ${item.id} names ${file}`);
    }
    const find = evals.evals.filter((item) => item.expect === "find").length;
    const quiet = evals.evals.filter((item) => item.expect === "quiet").length;
    assert.ok(find >= 8 && find <= 12, `${find} should-find cases`);
    assert.ok(quiet >= 8 && quiet <= 12, `${quiet} should-stay-quiet cases`);
    const names = new Set(evals.evals.map((item) => item.name));
    for (const required of NAMED_CASES[name]) assert.ok(names.has(required), `eval ${required} exists`);
  });

  test(`${name}: ships in the package`, () => {
    const files = listPackageFiles().map((file) => file.relative);
    for (const relative of ["SKILL.md", "agents/openai.yaml", "evals/evals.json"]) {
      assert.ok(files.includes(`skills/${name}/${relative}`), `package carries skills/${name}/${relative}`);
    }
    assert.ok(files.some((file) => file.startsWith(`skills/${name}/references/`)), "package carries the reference");
  });

  test(`${name}: its own text never counts as the product handling a failure mode`, async () => {
    const { defaultSearch, searchTerms } = await import("../src/archetypes.mjs");
    const root = mkdtempSync(path.join(os.tmpdir(), `${name}-vendored-`));
    try {
      const vendored = path.join(root, `.claude/skills/${name}/references`);
      spawnSync("mkdir", ["-p", vendored]);
      writeFileSync(path.join(vendored, "notes.md"), "idempotency key and retry budget\n");
      writeFileSync(path.join(root, "app.js"), "export const ok = true;\n");
      for (const args of [["init", "-q"], ["add", "-A"]]) spawnSync("git", args, { cwd: root });
      assert.equal(defaultSearch("idempotency key", root), null);
      assert.equal(searchTerms(["retry budget"], root).found.get("retry budget"), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    assert.ok(read("src/work-under-way.mjs").includes(`":(exclude,glob)**/skills/${name}/**"`), "work-under-way skips the skill as code");
  });
}

test("jev-opportunities reads live docs and names all four outcomes", () => {
  const text = read("skills/jev-opportunities/SKILL.md") + read("skills/jev-opportunities/references/engines.md");
  for (const url of [
    "https://docs.typesafe.ai/llms.txt",
    "https://developers.openai.com/api/docs/guides/decisions",
    "https://developers.openai.com/api/reference/resources/decisions/methods/create",
  ]) assert.ok(text.includes(url), `names ${url}`);
  for (const outcome of ["Jev", "Decisions API", "claude-haiku-5-5", "keep as is"]) assert.ok(text.includes(outcome), `names ${outcome}`);
  assert.match(text, /claude-api/);
  assert.match(text, /output_config/);
  assert.ok(!/gpt-6-luna/.test(read("skills/jev-opportunities/SKILL.md")), "the model name is read from the live docs, not fixed in the skill");
});

test("caveman-opportunities names both levels and the internal register", () => {
  const text = read("skills/caveman-opportunities/SKILL.md");
  assert.match(text, /\blite\b/);
  assert.match(text, /\bfull\b/);
  assert.match(text, /internal-register/);
  assert.match(text, /exact/i);
});

test("the router calls both finders when work touches an agent, chain, skill or MCP server", () => {
  const module = read("skills/super-outer/modules/ai-llm.md");
  const contract = read("skills/super-outer/references/completion-contract.md");
  const sweep = contract.slice(contract.indexOf("## Milestone sweep"), contract.indexOf("## Report the result plainly"));
  const router = read("skills/super-outer/SKILL.md");
  for (const text of [module, sweep, router]) {
    for (const name of FINDERS) assert.ok(text.includes(`\`${name}\``), `names ${name}`);
    assert.match(text, /MCP server/);
  }
  // skills/super-outer/SKILL.md had 392 lines at 6.1.0. 6.3.0 adds the four-line
  // tool check pointer; 6.3.1 adds five lines carrying the scope-change duty
  // itself, because Codex read this file but never opened requirement-changes.md.
  // 6.4.0 adds the two-line edge-cases pointer.
  assert.ok(router.match(/\n/g).length <= 405, "the router skill grew only by the tool check, scope-change and edge-cases pointers");
  for (const file of ["AGENTS.md", "README.md"]) {
    for (const name of FINDERS) assert.ok(read(file).includes(name), `${file} names ${name}`);
  }
});

test("a Cursor install carries both finders", async () => {
  const { installCursorHooks } = await import("../scripts/install-cursor.mjs");
  const home = mkdtempSync(path.join(os.tmpdir(), "finders-cursor-"));
  try {
    installCursorHooks({ home });
    for (const name of FINDERS) {
      assert.ok(existsSync(path.join(home, ".cursor/skills", name, "SKILL.md")), `Cursor received ${name}`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
