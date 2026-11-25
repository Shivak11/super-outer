import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// A misuse row passes when the product stops the attempt, never when it works.
test("finished-product walk: a misuse row passes only when the attempt is stopped, in every copy", () => {
  for (const file of [
    "skills/super-outer/references/experience-review.md",
    "agents/experience-reviewer.md",
    ".codex/agents/experience-reviewer.toml",
    "adapters/codex/agents/experience-reviewer.toml",
  ]) {
    const text = readFileSync(path.resolve(file), "utf8");
    assert.match(text, /passes when the product stops the attempt as the row says, and fails when\s+the attempt works/, file);
    assert.match(text, /only in the named test environment, against test accounts/, file);
    assert.match(text, /never raise the volume to reach the\s+block/, file);
    assert.match(text, /the name of the test environment the walk runs in/, file);
    assert.match(text, /A launch row is a row\s+whose "When" starts with `Launch`/, file);
  }
  // The reference carries the rule the agent copies already had.
  assert.match(
    readFileSync(path.resolve("skills/super-outer/references/experience-review.md"), "utf8"),
    /A step that would send a real message, take a real payment, or create or\s+delete records in a real outside service is not performed/,
  );
});
import { fileURLToPath } from "node:url";

// 6.6.0 adds the finished-product walk: the launch rows of the journey map are
// performed again on the built product, in three states, and marked per row.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const REVIEW = "skills/super-outer/references/experience-review.md";
const CONTRACT = "skills/super-outer/references/completion-contract.md";
const CLAUDE_ROLE = "agents/experience-reviewer.md";
const CODEX_ROLE = ".codex/agents/experience-reviewer.toml";

const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `has a "${heading}" section`);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next < 0 ? text.length : next);
};

const claudeBody = () => {
  const match = read(CLAUDE_ROLE).match(/^---\n[\s\S]*?\n---\n\n([\s\S]*?)\s*$/);
  assert.ok(match, "Claude role has frontmatter and a body");
  return match[1];
};
const codexBody = () => {
  const match = read(CODEX_ROLE).match(/developer_instructions = '''\n([\s\S]*?)\n'''\s*$/);
  assert.ok(match, "Codex role has literal developer_instructions");
  return match[1];
};

test("walk: the experience review names the journey map and links its file with no anchor", () => {
  const review = read(REVIEW);
  assert.ok(review.includes("[journey map](journey-map.md)"));
  assert.equal(review.includes("journey-map.md#"), false, "the link names the file only");
  assert.ok(review.includes("- [Finished-product walk](#finished-product-walk)"), "the contents list names the new section");
  assert.match(section(review, "Procedure"), /performs the \[finished-product walk\]\(#finished-product-walk\) in\s+place of the primary journey/);
  assert.match(section(review, "What it receives"), /a test account with no data and a test\s+account that already\s+holds data/);
});

test("walk: each launch row is performed for each person in three states", () => {
  const walk = section(read(REVIEW), "Finished-product walk");
  assert.match(walk, /A launch row is a row\s+whose "When" starts with `Launch`/);
  assert.match(walk, /performs each\s+launch row for\s+each person in the map, starting from the entry point that\s+person really\s+uses/);
  assert.match(walk, /walked in three states/);
  assert.match(walk, /^1\. a new account;$/m);
  assert.match(walk, /^2\. an account that already holds data;$/m);
  assert.match(walk, /^3\. after the break that the row names under "where they could get stuck, or\s+what could break", for example a lost network or a declined payment/m);
  assert.match(walk, /When\s+the row names no break, the third state is an interruption: the app is\s+closed or the network is lost halfway through the action/);
  assert.match(walk, /checks the row's "what they can do here, and how\s+they can tell" on the rendered screen: the action is available, and the screen\s+shows the sign the row describes/);
});

test("walk: each launch row is marked PASS, FAIL or UNPROVED with evidence, and nothing is blocked", () => {
  const walk = section(read(REVIEW), "Finished-product walk");
  assert.match(walk, /marks each launch row PASS, FAIL or UNPROVED with its evidence:\s+the step performed, the screenshot file and the observed value/);
  assert.match(walk, /A row passes\s+only when it passed in all three states/);
  assert.match(walk, /A row nobody performed is listed as\s+UNPROVED with the reason/);
  assert.match(walk, /screenshot-only review leaves it\s+UNPROVED/);
  assert.match(walk, /The walk blocks nothing/);
});

test("walk: work with no journey map keeps the primary journey", () => {
  const procedure = section(read(REVIEW), "Procedure");
  assert.match(procedure, /performs the recurring action on the main object,\s+leaves, and returns/);
  assert.match(procedure, /Work with no journey map keeps the primary\s+journey/);
  const role = claudeBody();
  assert.match(role, /Perform the primary journey from the intent/);
  assert.match(role, /When the work has a journey map, perform the finished-product walk in place of\s+the primary journey/);
});

test("walk: the verdict rules say what a failed or unperformed launch row does", () => {
  const verdict = section(read(REVIEW), "Verdict");
  for (const word of ["PASS", "FAIL", "UNPROVED"]) assert.ok(verdict.includes(`- **${word}:**`), `keeps the ${word} definition`);
  assert.match(verdict, /PASS also needs every launch row performed and passed in its three states/);
  assert.match(verdict, /A\s+failed launch row makes the verdict FAIL/);
  assert.match(verdict, /A launch row that could not be\s+performed, with nothing failed, leaves the verdict UNPROVED/);
});

test("walk: a product with no screens is walked by its builder and recorded as a journey result", () => {
  const review = read(REVIEW);
  const walk = section(review, "Finished-product walk");
  assert.match(walk, /A product with no screens, for example an agent reached through chat, is\s+walked by its builder through the product's real client, in a test\s+environment, under the same rule/);
  assert.match(walk, /recorded as a `journey` receipt with method\s+`direct-observation`; see the \[completion contract\]\(completion-contract\.md\)/);
  assert.match(section(review, "Record the result"), /each launch row's result is also recorded as\s+a `journey` receipt for that row's claim, with method `direct-observation`/);
});

test("walk: the completion contract says Done when lists the Launch rows", () => {
  const contract = read(CONTRACT);
  const record = section(contract, "Record the contract");
  assert.match(record, /For new work that has a \[journey map\]\(journey-map\.md\), `Done when` lists the\s+map's `Launch` rows as the journeys to perform/);
  assert.match(record, /one\s+`journey` claim for each of those rows/);
  assert.match(record, /a journey-level result is recorded per row/);
  assert.ok(record.includes("](experience-review.md#finished-product-walk)"));
  assert.match(read(REVIEW), /^## Finished-product walk$/m, "the linked heading exists");
  // The rules that were there before stay word for word.
  assert.ok(contract.includes("One level cannot\nsatisfy another."));
  assert.ok(contract.includes("Host discovery, runtime and user-journey results require direct observation."));
});

test("walk: both agent copies name the journey map rows and the three states", () => {
  const claude = claudeBody();
  assert.equal(codexBody(), claude, "the Codex copy carries the same instructions");
  for (const [host, body] of [["Claude Code", claude], ["Codex", codexBody()]]) {
    assert.match(body, /Role contract version: `1\.1\.0`/, host);
    assert.match(body, /journey map/, host);
    assert.match(body, /finished-product walk/, host);
    assert.match(body, /each table's header row starts `\| Phase for`/, host);
    assert.match(body, /A launch row is a row\s+whose "When" starts with `Launch`/, host);
    assert.match(body, /Perform each launch row for each person in the map/, host);
    assert.match(body, /Walk each launch row in three states/, host);
    assert.match(body, /^1\. a new account;$/m, host);
    assert.match(body, /^2\. an account that already holds data;$/m, host);
    assert.match(body, /^3\. after the break that the row names under "where they could get stuck, or\s+what could break"/m, host);
    assert.match(body, /the third state is an interruption/, host);
    assert.match(body, /"what they can do here, and how they can tell"\s+on the rendered screen/, host);
    assert.match(body, /marks each launch row for\s+each person `PASS`, `FAIL` or `UNPROVED`/, host);
    assert.match(body, /A failed launch row makes the verdict `FAIL`/, host);
    assert.match(body, /A launch row that could not be performed, with nothing failed, leaves the\s+verdict `UNPROVED`/, host);
    assert.match(body, /read-only/, host);
    assert.match(body, /Do not edit, create or delete\s+repository files/, host);
  }
  assert.match(read(CLAUDE_ROLE), /^tools: Read, Grep, Glob, Bash$/m, "the reviewer holds no writing tool");
});

test("walk: the changed files use one name per thing, no dash punctuation, and LF endings", () => {
  for (const file of [REVIEW, CONTRACT, CLAUDE_ROLE, CODEX_ROLE]) {
    const text = read(file);
    assert.equal(text.includes("\r"), false, `${file} uses LF`);
    assert.match(text, /[^\n]\n$/, `${file} ends with one newline`);
    assert.doesNotMatch(text, /finished product walk|journey-map walk|launch walk/i, `${file} keeps the name "finished-product walk"`);
  }
  for (const text of [section(read(REVIEW), "Finished-product walk"), claudeBody()]) {
    assert.equal(/[—–]/.test(text), false, "no dash used as punctuation");
  }
});
