/**
 * Read-only inventory of what a repository can already check.
 *
 * The engineering approach stage in
 * skills/super-outer/references/engineering-approach.md reads it before it
 * writes its lines. `inventory` lists the test, lint and build commands,
 * the browser and device tooling, the rubric-like files, the proof obligations,
 * the candidate protected files and the stack, which is every direct
 * dependency with its pinned version plus the platform config files, for the
 * tool check. From 6.5 it also lists the readiness gaps: what the project
 * lacks for agent work, judged from files only. `summarise` turns that result
 * into the plain summary that ends
 * with `runnable: true` or `runnable: false`. The module
 * makes no network request, writes nothing, and runs nothing when it is
 * imported.
 */

import fs from "node:fs";
import path from "node:path";

import { readStack, summariseStack } from "./stack-facts.mjs";

const SKIP_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".venv", "venv",
  "__pycache__", ".turbo", "coverage", ".worktrees", ".cache",
]);
const MAX_DEPTH = 4;
const MAX_FILES = 4000;

const BROWSER_PACKAGES = ["playwright", "playwright-core", "@playwright/test", "puppeteer", "puppeteer-core", "cypress", "webdriverio"];
const TEST_PACKAGES = ["vitest", "jest", "mocha", "ava", "tap", "@jest/core", "pytest", "hypothesis"];
const CODE_MANIFESTS = ["package.json", "pyproject.toml", "setup.py", "requirements.txt", "Makefile", "Cargo.toml", "go.mod", "Package.swift", "pubspec.yaml", "build.gradle", "Gemfile"];
const CODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".swift", ".kt", ".java", ".rb", ".html", ".css", ".sh", ".sql"]);
const PROSE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".docx", ".pdf"]);

const RUBRIC_PATTERN = /rubric|acceptance|checklist|design-spec|design-system|style-rules|writing-rules/i;
const APPROVED_PATTERN = /\.approved\.json$/i;
const FIXTURE_PATTERN = /(^|\/)(fixtures?|__snapshots__|golden|snapshots?)(\/|$)/i;
const TEST_FILE_PATTERN = /(^|\/)(tests?|spec|__tests__|e2e)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|_test\.py$|^test_.*\.py$/i;
const SIMULATOR_PATTERN = /simulator|emulator|xcrun|adb|device-check|device_check/i;

const CONVENTION_FILES = ["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", ".cursorrules", ".github/copilot-instructions.md"];
const SETUP_FILES = ["bin/setup", "scripts/setup.sh", "scripts/setup.mjs", "scripts/setup.js", "scripts/setup.py", "scripts/bootstrap.sh", "setup.sh", "bootstrap.sh", "Brewfile", "flake.nix", "docker-compose.yml", "docker-compose.yaml", "compose.yaml", "mise.toml", ".tool-versions"];
const SECRET_SCAN_FILES = [".gitleaks.toml", ".gitleaksignore", ".secrets.baseline", ".trufflehog.yml", ".github/secret_scanning.yml"];
const SECRET_SCAN_WORDS = /gitleaks|trufflehog|detect-secrets|secretlint|secret[-_ ]?scan/i;
const REVIEW_WORDS = /\b(?:code[-_ ]?)?review(?:er|s)?\b|reviewdog|coderabbit|danger(?:js|file)\b/i;
// Tested one line at a time: a pattern that may start at any blank line of a
// large file takes time that grows with the square of its length.
const ON_PULL_REQUEST = /^[ \t]*pull_request(?:_target)?[ \t]*:|^[ \t]*on[ \t]*:[ \t]*\[?[^\]]*\bpull_request\b/;
const runsOnPullRequests = (text) => text.split("\n").some((line) => line.length < 400 && ON_PULL_REQUEST.test(line));
const READ_LIMIT = 256 * 1024;

function readSmall(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > READ_LIMIT) return "";
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * What the project lacks for agent work, from files only. A gap says that
 * nothing was found in the repository's files; a setting kept on the hosting
 * service, such as GitHub's own secret scanning, cannot be seen from here.
 */
function readinessGaps({ root, files, present, scripts, makefile, ciWorkflows, testFrameworks }) {
  const gaps = [];
  if (!CONVENTION_FILES.some(present) && !files.some((f) => /^\.cursor\/rules\//.test(f))) {
    gaps.push({ id: "conventions", gap: "no conventions file (AGENTS.md, CLAUDE.md or similar), so each session has to rediscover how the project is built and what must not be touched" });
  }
  const makeText = makefile ? readSmall(path.join(root, "Makefile")) : "";
  const hasTest = scripts.some((s) => s.name === "test") || /^test:/m.test(makeText) || testFrameworks.includes("pytest") || ["Cargo.toml", "go.mod"].some(present);
  if (!hasTest) gaps.push({ id: "test-command", gap: "no single test command, so an agent cannot check its own change" });
  const hasSetup = scripts.some((s) => /^(setup|bootstrap|prepare|postinstall)$/.test(s.name)) || /^(setup|bootstrap|install):/m.test(makeText) || SETUP_FILES.some(present) || files.some((f) => /^\.devcontainer\//.test(f));
  if (!hasSetup) gaps.push({ id: "setup-command", gap: "no setup command or script, so a fresh copy cannot be made runnable in one step" });
  const workflows = ciWorkflows.map((f) => readSmall(path.join(root, f)));
  const workflowText = workflows.join("\n");
  const hookText = [".pre-commit-config.yaml", ".husky/pre-commit", "lefthook.yml"].map((f) => readSmall(path.join(root, f))).join("\n");
  if (!SECRET_SCAN_FILES.some(present) && !SECRET_SCAN_WORDS.test(workflowText) && !SECRET_SCAN_WORDS.test(hookText)) {
    gaps.push({ id: "secret-scan", gap: "no secret scan found in the repository's files, so a key committed by mistake would not be caught here" });
  }
  // A review step counts only in a workflow that runs on pull requests.
  const reviewsPullRequests = workflows.some((text) => runsOnPullRequests(text) && REVIEW_WORDS.test(text));
  if (!reviewsPullRequests && !present(".github/CODEOWNERS") && !present("CODEOWNERS")) {
    gaps.push({ id: "review-on-pull-requests", gap: "no automated review on pull requests found, so a change reaches the main branch with only its author's checks" });
  }
  return gaps;
}

function walk(root) {
  const files = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && files.length < MAX_FILES) {
    const { dir, depth } = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (depth < MAX_DEPTH) stack.push({ dir: absolute, depth: depth + 1 });
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute));
      }
    }
  }
  return files.sort();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function packageDependencies(pkg) {
  if (!pkg) return {};
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
}

function installedInNodeModules(root, name) {
  return fs.existsSync(path.join(root, "node_modules", ...name.split("/")));
}

export function inventory(directory = process.cwd()) {
  const root = path.resolve(directory);
  const files = walk(root);
  const present = (name) => fs.existsSync(path.join(root, name));

  const pkg = present("package.json") ? readJson(path.join(root, "package.json")) : null;
  const scripts = Object.entries(pkg?.scripts ?? {}).map(([name, command]) => ({ name, command: String(command) }));
  const dependencies = packageDependencies(pkg);

  const browserTooling = BROWSER_PACKAGES.filter((name) => dependencies[name] || installedInNodeModules(root, name));
  const testFrameworks = TEST_PACKAGES.filter((name) => dependencies[name] || installedInNodeModules(root, name));
  if (present("pyproject.toml") || present("pytest.ini") || present("setup.cfg")) {
    const text = ["pyproject.toml", "pytest.ini", "setup.cfg"].filter(present).map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
    if (/pytest/.test(text) && !testFrameworks.includes("pytest")) testFrameworks.push("pytest");
  }

  const codeManifests = CODE_MANIFESTS.filter(present);
  const ciWorkflows = files.filter((f) => /^\.github\/workflows\/.*\.ya?ml$/.test(f));
  const makefile = present("Makefile");
  const testFiles = files.filter((f) => TEST_FILE_PATTERN.test(f));
  const rubricFiles = files.filter((f) => RUBRIC_PATTERN.test(path.basename(f)) && /\.(md|json|txt|yaml|yml)$/i.test(f));
  const approvedRecords = files.filter((f) => APPROVED_PATTERN.test(f));
  const fixtureFiles = files.filter((f) => FIXTURE_PATTERN.test(f));
  const simulatorScripts = files.filter((f) => SIMULATOR_PATTERN.test(f) && /\.(sh|mjs|js|py|ts)$/i.test(f));

  const engineeringDir = path.join(root, ".engineering", "super-outer");
  const proofObligations = fs.existsSync(path.join(engineeringDir, "proof-obligations.json")) ? ".engineering/super-outer/proof-obligations.json" : null;
  const ledger = fs.existsSync(path.join(engineeringDir, "ledger.json")) ? ".engineering/super-outer/ledger.json" : null;
  const approachRecords = files.filter((f) => /^\.engineering\/super-outer\/approach-.*\.md$/.test(f));
  const standingAnswers = fs.existsSync(path.join(engineeringDir, "standing-answers.md")) ? ".engineering/super-outer/standing-answers.md" : null;
  const lessons = fs.existsSync(path.join(engineeringDir, "lessons.md")) ? ".engineering/super-outer/lessons.md" : null;

  const codeFiles = files.filter((f) => CODE_EXTENSIONS.has(path.extname(f).toLowerCase()));
  const proseFiles = files.filter((f) => PROSE_EXTENSIONS.has(path.extname(f).toLowerCase()));
  const runnable = codeManifests.length > 0 || codeFiles.length > 0;
  const proseOnly = !runnable && proseFiles.length > 0;

  const checks = [
    ...scripts.filter((s) => /^(test|lint|typecheck|type-check|check|verify|build|e2e|playwright)(:|$)/.test(s.name)).map((s) => `npm run ${s.name} (${s.command})`),
    ...(makefile ? ["Makefile present"] : []),
    ...ciWorkflows.map((f) => `CI: ${f}`),
    ...(proofObligations ? [`${proofObligations}`] : []),
  ];

  const protectedFiles = [...new Set([...testFiles, ...rubricFiles, ...approvedRecords, ...fixtureFiles, ...(proofObligations ? [proofObligations] : [])])].sort();

  return {
    directory: root,
    runnable,
    proseOnly,
    codeManifests,
    scripts,
    checks,
    testFrameworks,
    browserTooling,
    simulatorScripts,
    ciWorkflows,
    testFiles: testFiles.slice(0, 50),
    rubricFiles,
    approvedRecords,
    proofObligations,
    ledger,
    approachRecords,
    standingAnswers,
    lessons,
    readiness: { gaps: runnable ? readinessGaps({ root, files, present, scripts, makefile, ciWorkflows, testFrameworks }) : [] },
    protectedFiles: protectedFiles.slice(0, 80),
    counts: { files: files.length, code: codeFiles.length, prose: proseFiles.length },
    stack: readStack(root),
  };
}

export function summarise(result) {
  const lines = [];
  lines.push(`Directory: ${result.directory}`);
  lines.push(`Checks that exist: ${result.checks.length ? result.checks.join("; ") : "none found"}`);
  lines.push(`Test frameworks: ${result.testFrameworks.join(", ") || "none"}`);
  lines.push(`Browser or device tooling: ${[...result.browserTooling, ...result.simulatorScripts].join(", ") || "none"}`);
  lines.push(`Rubric-like files: ${result.rubricFiles.join(", ") || "none"}`);
  lines.push(`Approved records: ${result.approvedRecords.join(", ") || "none"}`);
  lines.push(`Proof obligations: ${result.proofObligations ?? "none"}; ledger: ${result.ledger ?? "none"}`);
  lines.push(`Earlier approach records: ${result.approachRecords.join(", ") || "none"}`);
  lines.push(`Standing answers: ${result.standingAnswers ?? "none"}; project lessons: ${result.lessons ?? "none"}`);
  const gaps = result.readiness?.gaps ?? [];
  lines.push(`Readiness gaps: ${gaps.length ? gaps.map((item) => item.gap).join("; ") : "none found"}`);
  lines.push(`Candidate protected files: ${result.protectedFiles.length ? result.protectedFiles.slice(0, 20).join(", ") + (result.protectedFiles.length > 20 ? ` and ${result.protectedFiles.length - 20} more` : "") : "none"}`);
  for (const line of summariseStack(result.stack ?? { manifests: {}, unread: [], config: [] })) lines.push(`Stack: ${line}`);
  lines.push(`Files: ${result.counts.files} (code ${result.counts.code}, prose ${result.counts.prose})`);
  lines.push(`runnable: ${result.runnable}`);
  return lines.join("\n");
}
