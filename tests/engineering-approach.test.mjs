import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencesDirectory = path.join(root, "skills", "super-outer", "references");
const stageFile = "engineering-approach.md";
const files = [stageFile, "engineering-approach-sources.md", "engineering-approach-examples.md"];
const read = (name) => fs.readFileSync(path.join(referencesDirectory, name), "utf8");

// Idioms that read as figures of speech here. Each pattern is unambiguous on
// its own; forms that are also literal (reach, land, spread, gate as a noun)
// are left to review. The prose rules come from Shiva's working-style file and
// the 13 September 2026 idiom list.
const bannedPatterns = [
  { name: "em dash", pattern: /—/ },
  { name: "en dash", pattern: /–/ },
  { name: "fan out", pattern: /\bfan(?:s|ned|ning)?[- ]out\b/i },
  { name: "lens", pattern: /\blens(?:es)?\b/i },
  { name: "finish line", pattern: /\bfinish line\b/i },
  { name: "lives in", pattern: /\blives? in\b/i },
  { name: "stumble", pattern: /\bstumbl/i },
  { name: "survive", pattern: /\bsurviv/i },
  { name: "hand over", pattern: /\bhand(?:s|ed|ing)? over\b/i },
  { name: "look after", pattern: /\blook(?:s|ed|ing)? after\b/i },
  { name: "sits in", pattern: /\bsits? in\b/i },
  { name: "still stands", pattern: /\bstill stands\b/i },
  { name: "guardrail", pattern: /\bguardrails?\b/i },
  { name: "carried over", pattern: /\bcarried over\b/i },
  { name: "gate as a verb", pattern: /\b(?:gated|gating|gates the)\b/i },
  { name: "surface as a verb", pattern: /\bsurfac(?:es|ed|ing) (?:the|a|an|it)\b/i },
  { name: "not X, but Y", pattern: /\bnot [^.,;:\n]{1,40}, but\b/i },
  { name: "Not X. It is Y.", pattern: /\bNot [^.\n]{1,40}\. (?:It|This|That) is\b/ },
];

// Lines inside code fences and inside double quotes are exact quotations or
// commands, and they keep their wording.
function reviewableLines(text) {
  const lines = [];
  let inFence = false;
  text.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const withoutQuotes = line.replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, "``");
    lines.push({ number: index + 1, text: withoutQuotes });
  });
  return lines;
}

function languageFailures(file, text) {
  const failures = [];
  for (const { number, text: line } of reviewableLines(text)) {
    for (const { name, pattern } of bannedPatterns) {
      if (pattern.test(line)) failures.push(`${file}:${number} ${name}: ${line.trim().slice(0, 100)}`);
    }
  }
  return failures;
}

// Relative Markdown links outside code fences, with any #fragment removed.
function brokenLinks(text, directory) {
  const broken = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const [, target] of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
      const file = decodeURIComponent(target.split("#")[0]);
      if (!fs.existsSync(path.resolve(directory, file))) broken.push(target);
    }
  }
  return broken;
}

// The table under "## Gate and size", as rows of trimmed cells, without the
// header and divider rows.
function gateRows(text) {
  const section = text.split(/^## /m).find((part) => part.startsWith("Gate and size"));
  assert.ok(section, "the Gate and size section is missing");
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

test("the language check reports a dash and banned idioms, and leaves code and quotations alone", () => {
  const sample = [
    "The stage lives in the hook — and it is not a plan, but a guardrail.",
    "```",
    "a command — inside a code fence",
    "```",
    'A quotation keeps its wording: "it lives in the hook – as written".',
  ].join("\n");
  const failures = languageFailures("sample", sample);
  // Only the first line is reported: the code fence and the quotation are exempt.
  assert.deepEqual(failures.map((failure) => failure.split(" ")[0]), ["sample:1", "sample:1", "sample:1", "sample:1"]);
  for (const name of ["em dash", "lives in", "guardrail", "not X, but Y"]) {
    assert.ok(failures.some((failure) => failure.includes(` ${name}: `)), `the sample did not trigger ${name}`);
  }
});

for (const file of files) {
  test(`${file} uses direct, literal prose`, () => {
    assert.deepEqual(languageFailures(file, read(file)), []);
  });
}

test("the gate table keeps one row for each size of the stage", () => {
  const rows = gateRows(read(stageFile));
  assert.equal(rows.length, 4);
  const [small, quick, full, notRunnable] = rows;

  // A small safe edit skips the stage.
  assert.match(small[0], /`SMALL_SAFE`/);
  assert.match(small[1], /^Nothing\./);
  assert.match(small[1], /skipped/);

  // A quick task on a runnable repository gets three short lines.
  assert.match(quick[0], /`QUICK`/);
  assert.match(quick[0], /`runnable: true`/);
  assert.match(quick[1], /^Three short lines\./);
  assert.match(quick[1], /existing suite/);
  assert.match(quick[1], /one builder plus the usual verifier/);

  // Focused, full and critical tasks on a runnable repository get the full lines,
  // which from 6.3 include the Tools line from the tool check.
  for (const depth of ["FOCUSED", "FULL", "CRITICAL"]) assert.match(full[0], new RegExp(`\`${depth}\``));
  assert.match(full[0], /`runnable: true`/);
  assert.match(full[1], /^The full four lines\./);
  assert.match(full[1], /first job/);

  // A chapter, outline or post gets one line naming the mechanical checks.
  assert.match(notRunnable[0], /`runnable: false`/);
  assert.match(notRunnable[1], /^One line/);
  assert.match(notRunnable[1], /dashes/);
  assert.match(notRunnable[1], /user's read/);
  assert.match(notRunnable[1], /one builder/);
  assert.match(notRunnable[1], /No loop, no extra agents\./);
});

test("the Tools line points to the tool check and the record template has a Tools heading", () => {
  const text = read(stageFile);
  assert.match(text, /^### 4\. Tools$/m);
  assert.match(text, /\[tool check\]\(tool-check\.md\)/);
  const template = text.split("```markdown")[1].split("```")[0];
  assert.match(template, /^## Tools$/m);
  assert.ok(fs.existsSync(path.join(referencesDirectory, "tool-check.md")));
});

test("the references keep nothing from the stage's trial as a separate plugin", () => {
  for (const file of files) {
    const text = read(file);
    for (const retired of [/experimental/i, /on trial/i, /miss_caught/i, /super-outer-experimental/i]) {
      assert.doesNotMatch(text, retired, `${file} still contains ${retired}`);
    }
  }
  const template = read(stageFile).match(/```markdown\n([\s\S]*?)\n```/)?.[1];
  assert.ok(template, "the approach record template is missing");
  assert.match(template, /^# Approach: /m);
  assert.doesNotMatch(template, /^## Trial$/m);
  assert.doesNotMatch(template, /^evidence:/m);
});

test("the link check reports a link to a missing file", () => {
  const sample = "[present](engineering-approach.md), [absent](no-such-reference.md#part) and [web](https://example.com/x.md)";
  assert.deepEqual(brokenLinks(sample, referencesDirectory), ["no-such-reference.md#part"]);
});

test("every relative link in the three references resolves to an existing file", () => {
  let links = 0;
  for (const file of files) {
    const text = read(file);
    links += [...text.matchAll(/\]\(([^)\s]+)\)/g)].length;
    assert.deepEqual(brokenLinks(text, referencesDirectory), [], `${file} has a broken link`);
  }
  assert.ok(links >= 8, `expected the stage's links to its neighbours, found ${links}`);
});

test("the stage keeps its trigger, inventory command, record, reply order and design rules", () => {
  const text = read(stageFile).replace(/\s+/g, " ");
  const opening = read(stageFile).split(/^## /m)[0].replace(/\s+/g, " ");
  for (const depth of ["FOCUSED", "FULL", "CRITICAL"]) assert.ok(opening.includes(`\`${depth}\``), `the opening does not name ${depth}`);
  assert.match(opening, /route line names it/);
  assert.match(opening, /after the route and the anticipation and before any implementation/);
  assert.match(opening, /heading "Engineering approach"/);
  assert.match(opening, /never produces a staged plan or prompts to paste/);
  assert.match(text, /super-outer inventory <directory>/);
  assert.match(text, /On a host without the command, judge the same facts by reading the repository, and say that you did/);
  assert.match(text, /`\.engineering\/super-outer\/approach-<YYYY-MM-DD>-<slug>\.md`/);
  assert.match(text, /its questions and recommendation come first, then this stage, then the work/);
  assert.match(text, /allowed only when the medium is unknown from the repository and the task/);
  assert.match(text, /counts towards Super-outer's question allowance/);
  assert.match(text, /render the main working screen first/);
  assert.match(text, /\[design-package\.md\]\(design-package\.md\)/);
  assert.match(text, /\[parallel-agents\.md\]\(parallel-agents\.md\)/);
});
