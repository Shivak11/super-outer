import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDiagram, compareFacts } from "../skills/draw-system-diagram/scripts/check-diagram.mjs";

const skill = path.resolve("skills/draw-system-diagram");
const template = readFileSync(path.join(skill, "assets/template-system.svg"), "utf8");
const pipeline = readFileSync(path.join(skill, "assets/template-pipeline.svg"), "utf8");

test("both templates the skill starts from pass its own checker", () => {
  assert.deepEqual(checkDiagram(template).errors, []);
  assert.deepEqual(checkDiagram(pipeline).errors, []);
  assert.equal(checkDiagram(pipeline).kind, "pipeline");
  assert.equal(checkDiagram(template).kind, "architecture");
});

test("a pipeline passes without a legend, an architecture diagram does not", () => {
  assert.ok(!/>Live</.test(pipeline), "the pipeline template carries no legend");
  const asArchitecture = pipeline.replace(' data-diagram="pipeline"', "");
  assert.ok(checkDiagram(asArchitecture).errors.some((e) => e.includes('"Live"')));
  const unknown = pipeline.replace('data-diagram="pipeline"', 'data-diagram="flowchart"');
  assert.ok(checkDiagram(unknown).errors.some((e) => e.includes("not a kind")));
  const proposed = pipeline.replace('stroke="#E8590C" stroke-width="2"/>', 'stroke="#E8590C" stroke-width="2" stroke-dasharray="8 6"/>');
  assert.ok(checkDiagram(proposed).errors.some((e) => e.includes("planned or proposed")));
});

test("the checker finds an arrow with no label, one through a box and one drawn under a box", () => {
  const unlabelled = pipeline.replace(/<text[^>]*>staff ID<\/text>/, "");
  assert.ok(checkDiagram(unlabelled).errors.some((e) => e.includes('"M250 690H340" has no label')));
  const through = pipeline.replace('<path d="M250 560H340"', '<path d="M250 560H700"').replace(">photos<", ">photos to compare<");
  assert.ok(checkDiagram(through).errors.some((e) => e.includes("runs through the box at x=340, y=485")));
  const arrow = /<path d="M1110 330V390H790V520"[^>]*\/>\n/.exec(pipeline)[0];
  const under = pipeline.replace(arrow, "").replace('<rect x="30" y="420"', `${arrow}<rect x="30" y="420"`);
  assert.ok(checkDiagram(under).errors.some((e) => e.includes("is drawn before the box at x=30, y=420")));
  const crossed = pipeline.replace('<text x="50" y="458"', '<text x="700" y="458"');
  assert.ok(checkDiagram(crossed).errors.some((e) => e.includes('crosses the text "Done for each claim"')));
});

test("the checker rejects confidence presented as accuracy or as rising with more inputs", () => {
  const accuracy = pipeline.replace(">unsure.<", ">confidence = accuracy<");
  assert.ok(checkDiagram(accuracy).errors.some((e) => e.includes("measured accuracy")));
  const more = pipeline.replace(">unsure.<", ">more photos raise confidence<");
  assert.ok(checkDiagram(more).errors.some((e) => e.includes("higher confidence")));
});

test("two diagrams of one system must state their shared facts the same way", () => {
  const facts = (json) => `<svg><metadata id="diagram-facts">${json}</metadata></svg>`;
  assert.deepEqual(compareFacts([["a.svg", facts('{"model":"m1","slots":2}')], ["b.svg", facts('{"model":"m1"}')]]), []);
  const problems = compareFacts([["a.svg", facts('{"model":"m1"}')], ["b.svg", facts('{"model":"m2"}')]]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"model" is "m1" in a\.svg and "m2" in b\.svg/);
});

test("the checker finds a line that runs past its box", () => {
  const broken = template.replace("Checks who is asking,", "Checks who is asking and which orders they may read,");
  assert.ok(checkDiagram(broken).errors.some((e) => e.includes("runs past")));
});

test("the checker finds a gap label that touches a border", () => {
  const broken = template.replace('<text x="272" y="354"', '<text x="290" y="354"');
  assert.ok(checkDiagram(broken).errors.some((e) => e.includes("touches the border")));
});

test("the checker rejects scripts, a dark canvas and a missing facts block", () => {
  const withScript = template.replace("</svg>", "<script>alert(1)</script></svg>");
  assert.ok(checkDiagram(withScript).errors.some((e) => e.includes("<script>")));
  const dark = template.replace('<rect width="1440" height="1010" fill="#FFFFFF"/>', '<rect width="1440" height="1010" fill="#111111"/>');
  assert.ok(checkDiagram(dark).errors.some((e) => e.includes("first layer")));
  const noFacts = template.replace(/<metadata id="(?:diagram|architecture)-facts">[\s\S]*?<\/metadata>/, "");
  assert.ok(checkDiagram(noFacts).errors.some((e) => e.includes("architecture-facts")));
  assert.deepEqual(checkDiagram(noFacts, { facts: false }).errors, []);
});

test("every file the skill names exists", () => {
  const text = readFileSync(path.join(skill, "SKILL.md"), "utf8");
  for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
    assert.doesNotThrow(() => readFileSync(path.join(skill, target)), `SKILL.md links ${target}`);
  }
  for (const kind of ["architecture", "pipeline", "code-flow", "both", "one-problem"]) assert.match(text, new RegExp(kind, "i"), `SKILL.md covers ${kind}`);
  for (const script of ["scripts/check-diagram.mjs", "scripts/render-diagram.mjs"]) {
    assert.ok(text.includes(script), `SKILL.md runs ${script}`);
    assert.doesNotThrow(() => readFileSync(path.join(skill, script)));
  }
});

test("the checker command exits 1 on a broken file and passes the template, also through a symlink", () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "diagram-cli-"));
  try {
    symlinkSync(path.join(skill, "scripts"), path.join(folder, "scripts"));
    const broken = path.join(folder, "broken.svg");
    writeFileSync(broken, '<svg viewBox="0 0 1440 100"></svg>');
    for (const script of [path.join(skill, "scripts/check-diagram.mjs"), path.join(folder, "scripts/check-diagram.mjs")]) {
      const bad = spawnSync(process.execPath, [script, broken], { encoding: "utf8" });
      assert.equal(bad.status, 1, script);
      assert.match(bad.stdout, /error:/);
      const good = spawnSync(process.execPath, [script, path.join(skill, "assets/template-system.svg")], { encoding: "utf8" });
      assert.equal(good.status, 0, good.stdout);
      assert.match(good.stdout, /passes/);
    }
    const left = path.join(folder, "system.svg");
    const right = path.join(folder, "pipeline.svg");
    writeFileSync(left, template);
    writeFileSync(right, pipeline.replace('"model":"model-name"', '"model":"other-model"'));
    const script = path.join(skill, "scripts/check-diagram.mjs");
    assert.equal(spawnSync(process.execPath, [script, left, right], { encoding: "utf8" }).status, 0);
    const together = spawnSync(process.execPath, [script, "--one-system", left, right], { encoding: "utf8" });
    assert.equal(together.status, 1, together.stdout);
    assert.match(together.stdout, /"model" is/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the diagram skill's own text never counts as the product handling a failure mode", async () => {
  const { defaultSearch, searchTerms } = await import("../src/archetypes.mjs");
  const root = mkdtempSync(path.join(os.tmpdir(), "diagram-vendored-"));
  try {
    const vendored = path.join(root, ".claude/skills/draw-system-diagram/references");
    spawnSync("mkdir", ["-p", vendored]);
    writeFileSync(path.join(vendored, "style.md"), "idempotency key and retry budget\n");
    writeFileSync(path.join(root, "app.js"), "export const ok = true;\n");
    for (const args of [["init", "-q"], ["add", "-A"]]) spawnSync("git", args, { cwd: root });
    assert.equal(defaultSearch("idempotency key", root), null);
    assert.equal(searchTerms(["retry budget"], root).found.get("retry budget"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const codeFlow = readFileSync(path.join(skill, "assets/template-code-flow.svg"), "utf8");
const noBytecode = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
const hasPython = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

test("the code-flow template passes the checker as a code-flow diagram, with no legend required", () => {
  assert.match(codeFlow, /<svg[^>]*data-diagram="code-flow"/);
  assert.match(codeFlow, /<metadata id="diagram-facts">/);
  const result = checkDiagram(codeFlow);
  assert.deepEqual(result.errors, []);
  assert.equal(result.kind, "code-flow");
  const noLegend = codeFlow.replace(/>Live</g, ">Solid<");
  assert.deepEqual(checkDiagram(noLegend).errors, [], "a code-flow diagram needs no Live entry");
  assert.ok(checkDiagram(noLegend.replace(' data-diagram="code-flow"', "")).errors.some((e) => e.includes('"Live"')));
});

test("a code-flow diagram still needs labelled arrows and a facts block", () => {
  const arrow = /<path d="([^"]+)"[^>]*marker-end[^>]*\/>/.exec(codeFlow);
  assert.ok(arrow, "the template has arrows");
  const noFacts = codeFlow.replace(/<metadata id="diagram-facts">[\s\S]*?<\/metadata>/, "");
  assert.ok(checkDiagram(noFacts).errors.some((e) => e.includes("diagram-facts")));
  const loose = codeFlow.replace("</svg>", '<path d="M700 5H900" stroke="#E8590C" stroke-width="3" marker-end="url(#a-orange)"/></svg>');
  assert.ok(checkDiagram(loose).errors.some((e) => e.includes('"M700 5H900" has no label')));
});

test("the skill covers the code-flow kind and the old skill is gone", () => {
  const text = readFileSync(path.join(skill, "SKILL.md"), "utf8");
  const front = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(text);
  assert.equal(front[1], "draw-system-diagram");
  assert.ok(front[2].length <= 1024, `description is ${front[2].length} characters`);
  assert.match(front[2], /code-flow/);
  assert.ok(text.split("\n").length < 500);
  for (const word of ["code-flow", "endpoint", "API flow", "request flow", "backend flow", "how this route works", "sequence"]) assert.ok(text.includes(word), `SKILL.md names ${word}`);
  for (const script of ["scripts/diagram_kit.py", "scripts/slice-diagram.mjs", "scripts/snapshot-refs.sh", "scripts/verify_facts_template.py", "scripts/selftest.sh", "assets/example-code-flow.py"]) {
    assert.ok(existsSync(path.join(skill, script)), `${script} exists`);
  }
  assert.ok(existsSync(path.join(skill, "references/code-flow.md")));
  assert.ok(readFileSync(path.join(skill, "references/code-flow.md"), "utf8").includes("contributed by a team member on 22 October 2026"));
  assert.ok(!existsSync(path.resolve("skills/team-technical-diagram")), "the old skill folder is removed");
  const evals = JSON.parse(readFileSync(path.join(skill, "evals/evals.json"), "utf8"));
  assert.ok(evals.evals.some((e) => /code-flow/.test(JSON.stringify(e))));
  assert.match(readFileSync(path.join(skill, "agents/openai.yaml"), "utf8"), /code-flow/);
  for (const file of ["README.md", "AGENTS.md", "skills/super-outer/SKILL.md", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    if (existsSync(path.resolve(file))) assert.ok(!readFileSync(path.resolve(file), "utf8").includes("team-technical-diagram"), `${file} still names the old skill`);
  }
  for (const file of readdirSync(skill, { recursive: true })) {
    const full = path.join(skill, String(file));
    if (statSync(full).isFile()) assert.ok(!readFileSync(full, "utf8").includes("team-technical-diagram"), `${file} still names the old skill`);
  }
});

test("the code-flow template is exactly what its generator writes", { skip: !hasPython && "python3 is not installed" }, () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "code-flow-"));
  try {
    const out = path.join(folder, "example.svg");
    const run = spawnSync("python3", [path.join(skill, "assets/example-code-flow.py"), out], { encoding: "utf8", env: noBytecode });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(out, "utf8"), codeFlow, "regenerate assets/template-code-flow.svg from assets/example-code-flow.py");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the verification skeleton parses the code-flow template's facts", { skip: !hasPython && "python3 is not installed" }, () => {
  const run = spawnSync("python3", [path.join(skill, "scripts/verify_facts_template.py"), "--selftest"], { encoding: "utf8", env: noBytecode });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /template facts parse/);
});
