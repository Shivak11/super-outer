#!/usr/bin/env node
// Offline check of the eval suite. It runs no model and sends nothing.
// It confirms that every behaviour case and skill eval file can load, and
// that every recorded result in evals/reports/ names its date and version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const problems = [];
const frontmatter = (text) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : null;
};

const behaviour = path.join(root, "evals", "behaviour");
const cases = fs.readdirSync(behaviour).filter((name) => fs.statSync(path.join(behaviour, name)).isDirectory()).sort();
let graders = 0;
for (const name of cases) {
  const dir = path.join(behaviour, name);
  const promptFile = path.join(dir, "prompt.md");
  if (!fs.existsSync(promptFile)) { problems.push(`${name}: no prompt.md`); continue; }
  const head = frontmatter(fs.readFileSync(promptFile, "utf8"));
  if (!head) problems.push(`${name}: prompt.md has no front matter`);
  else for (const key of ["description", "max_turns"]) if (!new RegExp(`^${key}:`, "m").test(head)) problems.push(`${name}: prompt.md lacks ${key}`);
  const graderDir = path.join(dir, "graders");
  const files = fs.existsSync(graderDir) ? fs.readdirSync(graderDir).filter((file) => file.endsWith(".md")) : [];
  if (files.length === 0) problems.push(`${name}: no graders`);
  for (const file of files) {
    const graderHead = frontmatter(fs.readFileSync(path.join(graderDir, file), "utf8"));
    if (!graderHead || !/^type:/m.test(graderHead)) problems.push(`${name}/graders/${file}: no grader type`);
    graders += 1;
  }
  const caseFile = path.join(dir, "case.yaml");
  if (fs.existsSync(caseFile)) {
    const text = fs.readFileSync(caseFile, "utf8");
    const script = text.match(/scaffold_script:\s*(\S+)/)?.[1];
    if (script && !fs.existsSync(path.join(dir, script))) problems.push(`${name}: scaffold ${script} is missing`);
  }
}

const skills = path.join(root, "skills");
let skillEvals = 0;
for (const skill of fs.readdirSync(skills).sort()) {
  const file = path.join(skills, skill, "evals", "evals.json");
  if (!fs.existsSync(file)) continue;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed.evals;
    if (!Array.isArray(list) || list.length === 0) problems.push(`${skill}: evals.json has no evals`);
    else skillEvals += list.length;
  } catch (error) { problems.push(`${skill}: evals.json does not parse (${error.message})`); }
}

const specialists = JSON.parse(fs.readFileSync(path.join(root, "evals", "specialists.json"), "utf8"));
const modules = specialists.module_evaluations?.length ?? 0;
if (modules !== 12) problems.push(`specialists.json covers ${modules} modules, not 12`);

const reports = path.join(root, "evals", "reports");
const reportFiles = fs.readdirSync(reports).filter((file) => /\.(json|txt)$/.test(file));
for (const file of reportFiles) {
  if (!/^\d{4}-\d{2}-\d{2}-v\d+\.\d+\.\d+-/.test(file)) problems.push(`reports/${file}: name lacks date and version`);
  if (file.endsWith(".json")) { try { JSON.parse(fs.readFileSync(path.join(reports, file), "utf8")); } catch { problems.push(`reports/${file}: does not parse`); } }
}

if (problems.length) {
  process.stderr.write(`Eval check failed:\n- ${problems.join("\n- ")}\n`);
  process.exit(1);
}
process.stdout.write(`Eval check passed: ${cases.length} behaviour cases, ${graders} graders, ${skillEvals} skill evals, ${modules} specialist modules, ${reportFiles.length} recorded result files.\n`);
