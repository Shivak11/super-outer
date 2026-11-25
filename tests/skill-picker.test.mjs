import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isAlwaysAllowed,
  mergeRoster,
  namedSkills,
  narrowQuestions,
  parseListing,
  parseSkillMd,
  pickSkills,
  PICKER,
  readNarrow,
  readWide,
  suggestionLine,
  wideQuestions,
} from "../src/jev/skill-picker.mjs";
import { readSkillFolder } from "../src/jev/skill-roster.mjs";

const roster = [
  { name: "design-taste-frontend", description: "Visual taste for web screens", body: "" },
  { name: "heroui-react", description: "HeroUI components for React", body: "" },
  { name: "design-everyday-things", description: "Usability and plain wording", body: "" },
  { name: "design", description: "General design", body: "" },
  { name: "superpowers:systematic-debugging", description: "Find the cause of a bug", body: "Start from evidence." },
];

test("a skill header gives name, description and the start of the body", () => {
  const skill = parseSkillMd("---\nname: tidy\ndescription: >\n  Keeps things\n  tidy\n---\nBody text", "folder");
  assert.deepEqual(skill, { name: "tidy", description: "Keeps things tidy", body: "Body text" });
  assert.equal(parseSkillMd("no header", "x"), null);
});

test("the listing gives names with or without descriptions", () => {
  assert.deepEqual(parseListing("- alpha\n- beta: does beta\n- plug:gamma\nsome text"), ["alpha", "beta", "plug:gamma"]);
});

test("the listing decides the roster and descriptions come from disk", () => {
  const merged = mergeRoster([{ name: "beta", description: "from disk", body: "b" }], ["beta", "plug:beta", "alpha"]);
  assert.deepEqual(merged.map((skill) => [skill.name, skill.description]), [
    ["beta", "from disk"],
    ["plug:beta", "from disk"],
    ["alpha", ""],
  ]);
});

test("named skills: slashed anywhere, hyphenated bare, short forms, and plain words ignored", () => {
  assert.deepEqual(
    namedSkills("for the app use /design-taste and /hero-ui, and design-everyday-things for words", roster).sort(),
    ["design-everyday-things", "design-taste-frontend", "heroui-react"],
  );
  assert.deepEqual(namedSkills("i like the design of this", roster), []);
  assert.deepEqual(namedSkills("run /systematic-debugging now", roster), ["superpowers:systematic-debugging"]);
});

test("the wide request ranks every chunk and asks the gate", () => {
  const many = Array.from({ length: PICKER.chunkSize + 3 }, (_, index) => ({ name: `s${index}`, description: "d", body: "" }));
  const questions = wideQuestions(many);
  assert.ok(questions["which::0"] && questions["which::1"]);
  assert.equal(Object.keys(questions["which::1"].criteria).length, 3);
  assert.equal(Object.keys(questions).filter((key) => key.startsWith("gate::")).length, 3);
});

test("the shortlist takes each chunk's best, because chunk scores are not on one scale", () => {
  const answers = {
    "which::0": { probabilities: { "design-taste-frontend": 0.6, "heroui-react": 0.3, design: 0.1 } },
    "gate::acts_on_user_system": { noul: 0.9 },
    "gate::would_follow_documented_procedure": { noul: 0.9 },
    "gate::prose_suffices": { noul: 0.1 },
  };
  const wide = readWide(answers, roster);
  assert.deepEqual(wide.shortlist, ["design-taste-frontend", "heroui-react"]);
  assert.ok(Math.abs(wide.gate - 0.9) < 1e-9);
});

test("picks are every shortlisted skill that fits, best first, at most three", () => {
  const shortlist = ["a", "b", "c", "d"];
  const answers = { "fits::a": { noul: 0.2 }, "fits::b": { noul: 0.9 }, "fits::c": { noul: 0.5 }, "fits::d": { noul: 0.4 } };
  assert.deepEqual(readNarrow(answers, shortlist).picks, ["b", "c", "d"]);
  assert.ok(narrowQuestions(["heroui-react"], roster)["fits::heroui-react"]);
});

test("a whole pick puts named skills first and fails open when Jev cannot answer", async () => {
  const text = "please build the settings screen with /hero-ui and good taste";
  const asked = [];
  const ask = async (state, questions) => {
    asked.push(Object.keys(questions));
    if (questions["which::0"]) {
      return {
        "which::0": { probabilities: { "design-taste-frontend": 0.7, design: 0.2 } },
        "gate::acts_on_user_system": { noul: 0.9 },
        "gate::would_follow_documented_procedure": { noul: 0.8 },
        "gate::prose_suffices": { noul: 0.2 },
      };
    }
    return { "fits::design-taste-frontend": { noul: 0.8 }, "fits::design": { noul: 0.1 } };
  };
  const result = await pickSkills(text, roster, ask);
  assert.deepEqual(result.picks, ["heroui-react", "design-taste-frontend"]);
  assert.equal(asked.length, 2);

  const down = await pickSkills(text, roster, async () => null);
  assert.equal(down.ok, false);
  assert.deepEqual(down.picks, ["heroui-react"]);
});

test("a short follow-up is not scored", async () => {
  let called = false;
  const result = await pickSkills("is it done?", roster, async () => ((called = true), null));
  assert.equal(called, false);
  assert.deepEqual(result.picks, []);
});

test("required skills are always allowed, with or without a plugin prefix", () => {
  assert.equal(isAlwaysAllowed("super-outer:super-outer"), true);
  assert.equal(isAlwaysAllowed("wiki-update"), true);
  assert.equal(isAlwaysAllowed("heroui-react"), false);
});

test("the suggestion line names each skill with its file", () => {
  assert.equal(suggestionLine([], roster), null);
  assert.match(suggestionLine(["x"], [{ name: "x", path: "/s/x/SKILL.md" }]), /x \(\/s\/x\/SKILL\.md\)/);
});

test("a skill folder is read one level deep, prefixed for a plugin", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  fs.mkdirSync(path.join(root, "one"));
  fs.writeFileSync(path.join(root, "one", "SKILL.md"), "---\nname: one\ndescription: first\n---\nbody");
  fs.mkdirSync(path.join(root, "empty"));
  const found = readSkillFolder(root, "plug");
  assert.deepEqual(found.map((skill) => [skill.name, skill.description]), [["plug:one", "first"]]);
});
