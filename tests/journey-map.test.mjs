import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// 6.6.0: before the story walk, Super-outer maps every person's journey from
// finding the product to leaving it, and asks the owner phase by phase.
const skillDir = path.resolve("skills", "super-outer");
const refs = path.join(skillDir, "references");
const read = (...parts) => readFileSync(path.join(skillDir, ...parts), "utf8");
const map = () => read("references", "journey-map.md");
const count = (text, pattern) => (text.match(pattern) ?? []).length;

const PHASES = [
  "Finds it",
  "Signs up",
  "First use",
  "Main use",
  "Comes back",
  "Pays",
  "Shares or invites",
  "Gets a message",
  "Loses access",
  "Asks for help",
  "Leaves",
];

test("journey map: the reference exists, is linked from SKILL.md one level deep, and has a contents list", () => {
  assert.ok(existsSync(path.join(refs, "journey-map.md")), "references/journey-map.md");
  assert.ok(read("SKILL.md").includes("](references/journey-map.md)"), "SKILL.md links the reference");
  assert.match(map(), /^Contents:$/m);
  for (const [, target] of map().matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (!/^https?:/.test(target)) assert.ok(existsSync(path.join(refs, target)), `link target ${target}`);
  }
});

test("journey map: it names the eleven phases in order", () => {
  const text = map();
  let last = -1;
  PHASES.forEach((phase, index) => {
    const at = text.indexOf(`${index + 1}. **${phase}`);
    assert.ok(at > last, `phase ${index + 1}, ${phase}, is listed in order`);
    last = at;
  });
  assert.doesNotMatch(text, /^12\. \*\*/m, "there is no twelfth phase");
});

test("journey map: the table starts with the text the hook looks for and has seven columns", () => {
  const text = map();
  const header = text.split("\n").find((line) => line.startsWith("| Phase for <name>"));
  assert.ok(header, "a header row starting | Phase for <name>");
  assert.equal(header.split("|").length - 2, 7, "seven columns");
  for (const column of [
    "What happens",
    "What they can do here, and how they can tell",
    "Where they could get stuck, or what could break",
    "Data it creates, and who can see it",
    "What the product needs",
    "When",
  ]) assert.ok(header.includes(column), column);
  for (const entry of ["`Launch`", "`Launch (question N)`", "`Later, when <measured signal>`", "`Does not apply: <reason>`"]) {
    assert.ok(text.includes(entry), `When entry ${entry}`);
  }
});

test("journey map: the people include the one running the product and someone misusing it", () => {
  const text = map();
  assert.match(text, /person who runs the product/i);
  assert.match(text, /person misusing it/i);
  assert.match(text, /or that this kind of\s+product usually has/);
  assert.match(text, /A row for the person misusing it\*\* is written the other way round/);
  assert.match(text, /A launch row is any row whose "When" starts with `Launch`/);
  assert.match(text, /write `assumed` after its entry/);
});

test("journey map: the interview goes through every phase with the owner before anything is built", () => {
  const text = map();
  assert.match(text, /^## The journey interview$/m);
  assert.match(text, /For a whole map, the first question settles the people/);
  assert.match(text, /A feature in an existing product skips this\s+question unless it adds a new kind of person/);
  assert.match(text, /sit outside the\s+per-task question allowance\. The twelve-question ceiling/);
  assert.match(text, /rounds of at most five questions/);
  assert.match(text, /recommended answer/);
  assert.match(text, /every phase that applies gets at least one question/);
  assert.match(text, /phases still to come/);
  assert.match(text, /outside the per-task question allowance/);
  assert.match(text, /nothing is built until the owner\s+replies/i);
  // The design terms are named once, for the agent. A question never uses them.
  assert.equal(count(text, /affordance/gi), 1, "affordance is named once");
  assert.equal(count(text, /signifier/gi), 1, "signifier is named once");
});

test("journey map: every failure library is opened by a phase or listed as having none", () => {
  const text = map();
  const libraries = readdirSync(path.join(refs, "archetypes")).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5));
  assert.ok(libraries.length >= 18, `${libraries.length} libraries found`);
  for (const name of libraries) assert.ok(text.includes(`\`${name}\``), `${name} is named`);
  const section = text.slice(text.indexOf("## Each phase opens its failure library"));
  for (const [, name] of section.slice(0, section.indexOf("\n## ", 5)).matchAll(/`([a-z][a-z-]+[a-z])`/g)) {
    if (["now", "decide", "defer"].includes(name)) continue;
    assert.ok(libraries.includes(name), `${name} is a library file`);
  }
});

test("journey map: it produces the data list, the access list, the launch list and the dependencies", () => {
  const text = map();
  for (const heading of ["Personal data", "Who can do what", "Launch list", "Dependencies"]) {
    assert.ok(text.includes(`**${heading}.**`), heading);
  }
  assert.match(text, /not looked up/);
});

test("journey map: the brief holds the map, its lists and the facts the pack reads", () => {
  const brief = read("references", "product-brief.md");
  assert.ok(brief.includes("](journey-map.md)"));
  for (const heading of ["## People", "## Journey", "## Personal data", "## Who can do what", "## Launch list", "## Dependencies"]) {
    assert.ok(brief.includes(`\n${heading}\n`), `the brief template has ${heading}`);
  }
  for (const fact of [
    "| Accounts and sign-in |",
    "| Payments |",
    "| Uploads or recordings |",
    "| Sharing between people |",
    "| Messages the product sends |",
    "| AI features |",
    "| Outside companies that receive personal data |",
    "| Children use it |",
  ]) assert.ok(brief.includes(fact), fact);
});

test("journey map: the story walk, scope changes, intent, security and phases all read it", () => {
  const walk = read("references", "story-walk.md");
  assert.ok(walk.includes("](journey-map.md)"));
  assert.match(walk, /usually 8 to 14/);
  // The paths that used to steer past the map now name it.
  assert.match(walk, /Show the owner each person's journey table, the launch list and the\s+dependencies/);
  assert.match(read("references", "product-brief.md"), /draw the journey map, run\s+the story walk/);
  assert.match(read("SKILL.md"), /the brief and journey interviews sit outside the allowance/);
  assert.doesNotMatch(walk, /6 to 10/);
  assert.ok(read("references", "requirement-changes.md").includes("](journey-map.md)"));
  assert.ok(read("references", "product-intent.md").includes("](journey-map.md)"));
  assert.ok(read("references", "dimension-phases.md").includes("](journey-map.md)"));
  assert.ok(read("modules", "security-privacy-abuse.md").includes("](../references/journey-map.md)"));
  assert.match(readFileSync(path.resolve("skills", "edge-cases", "SKILL.md"), "utf8"), /journey map/);
});

test("journey map: the router skill stays inside its tested length", () => {
  assert.ok(count(read("SKILL.md"), /\n/g) <= 405, "SKILL.md did not grow past its limit");
});
