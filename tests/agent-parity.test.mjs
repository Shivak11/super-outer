import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Reviewers judge work and never change it. The producer makes the design
// package before any builder starts, so it writes, but only inside that
// package and never in product source.
const reviewers = ["benchmark-researcher", "dimension-reviewer", "experience-reviewer", "failure-scout", "independent-verifier"];
const producers = ["design-prototyper"];
const roles = [...reviewers, ...producers];
// Roles written from 5.7.0 onward follow the plain-prose rule without dashes.
const addedFromFiveSeven = ["design-prototyper", "experience-reviewer", "dimension-reviewer"];
// The researcher's contract was rewritten in 5.10.0 for architecture mode, so
// it follows the same rule.
const rewrittenFromFiveTen = ["benchmark-researcher"];
// Every role starts at contract 1.0.0. A role listed here changed its contract.
// The experience reviewer gained the finished-product walk in 6.6.0.
const contractVersions = { "benchmark-researcher": "1.2.0", "experience-reviewer": "1.1.0" };
const contractVersion = (role) => contractVersions[role] ?? "1.0.0";

const read = (relative) => readFile(path.join(root, relative), "utf8");

function parseClaude(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*?)\s*$/);
  assert.ok(match, "Claude role needs frontmatter and a body");
  const frontmatter = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const split = line.indexOf(":");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
    }),
  );
  return { frontmatter, instructions: match[2].trim() };
}

function parseCodex(source) {
  const field = (name) => {
    const match = source.match(new RegExp(`^${name} = "([^"]*)"$`, "m"));
    assert.ok(match, `Codex role lacks ${name}`);
    return match[1];
  };
  const instructions = source.match(/developer_instructions = '''\n([\s\S]*?)\n'''\s*$/);
  assert.ok(instructions, "Codex role needs literal developer_instructions");
  return {
    name: field("name"),
    description: field("description"),
    instructions: instructions[1].trim(),
  };
}

const tools = (claude) => claude.frontmatter.tools.split(",").map((tool) => tool.trim());

test("Claude and Codex expose exactly the same canonical roles", async () => {
  const claude = (await readdir(path.join(root, "agents")))
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .sort();
  const codex = (await readdir(path.join(root, "adapters", "codex", "agents")))
    .filter((file) => file.endsWith(".toml"))
    .map((file) => file.slice(0, -5))
    .sort();
  const nativeCodex = (await readdir(path.join(root, ".codex", "agents")))
    .filter((file) => file.endsWith(".toml"))
    .map((file) => file.slice(0, -5))
    .sort();
  assert.deepEqual(claude, [...roles].sort());
  assert.deepEqual(codex, [...roles].sort());
  assert.deepEqual(nativeCodex, [...roles].sort());
});

for (const role of roles) {
  test(`${role} has exact cross-host semantic parity`, async () => {
    const claude = parseClaude(await read(`agents/${role}.md`));
    const codex = parseCodex(await read(`adapters/codex/agents/${role}.toml`));
    const nativeCodex = parseCodex(await read(`.codex/agents/${role}.toml`));

    assert.equal(claude.frontmatter.name, role);
    assert.equal(codex.name, role.replaceAll("-", "_"));
    assert.equal(codex.description, claude.frontmatter.description);
    assert.equal(codex.instructions, claude.instructions);
    assert.deepEqual(nativeCodex, codex);
    const version = contractVersion(role).replaceAll(".", "\\.");
    assert.match(claude.instructions, new RegExp(`Role contract version: \`${version}\``));
    assert.match(claude.instructions, /interview the\s+user/i);
    assert.match(claude.instructions, /## Output contract/);
    if ([...addedFromFiveSeven, ...rewrittenFromFiveTen].includes(role)) {
      assert.equal(/[—–]/.test(claude.instructions), false, `${role} uses a dash character`);
    }
  });
}

for (const role of reviewers) {
  test(`${role} stays read-only`, async () => {
    const claude = parseClaude(await read(`agents/${role}.md`));
    assert.match(claude.instructions, /read-only/i);
    assert.match(claude.instructions, /Do\s+not\s+edit/i);
    for (const writer of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
      assert.equal(tools(claude).includes(writer), false, `${role} must not hold ${writer}`);
    }
  });
}

for (const role of producers) {
  test(`${role} writes only inside the design package`, async () => {
    const claude = parseClaude(await read(`agents/${role}.md`));
    assert.match(claude.instructions, /design package folder/i);
    assert.match(claude.instructions, /product source/i);
    assert.match(claude.instructions, /main working screen/i);
    assert.ok(tools(claude).includes("Write"), `${role} needs Write to produce the package`);
  });
}

test("role-specific gates remain distinct", async () => {
  const benchmark = parseClaude(await read("agents/benchmark-researcher.md")).instructions;
  const scout = parseClaude(await read("agents/failure-scout.md")).instructions;
  const verifier = parseClaude(await read("agents/independent-verifier.md")).instructions;
  const experience = parseClaude(await read("agents/experience-reviewer.md")).instructions;
  const prototyper = parseClaude(await read("agents/design-prototyper.md")).instructions;

  assert.match(benchmark, /## Privacy boundary/);
  assert.match(benchmark, /binding_or_normative/);
  assert.match(scout, /attempted_disproofs/);
  assert.match(scout, /CLEAR.*FIX.*STOP/s);
  assert.match(verifier, /## Exact-head gate/);
  assert.match(verifier, /source, focused tests, CI, package/);
  assert.match(verifier, /exactly `PASS`, `FAIL`, or `UNPROVED`/);
  assert.match(experience, /exactly `PASS`, `FAIL`, or `UNPROVED`/);
  assert.match(experience, /agent-browser/);
  assert.match(experience, /more than four/i);
  assert.match(experience, /builders?'? notes/i);
  assert.match(prototyper, /provenance/i);
  assert.match(prototyper, /simulated/i);
});
