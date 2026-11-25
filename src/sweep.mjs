/**
 * Milestone sweep (plan section 7). A dimension is due when it has no receipt
 * or when files matching its patterns changed since the receipt's commit.
 * Receipts live in .engineering/super-outer/sweep-receipts.json.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { planDiagrams } from "./diagram-plan.mjs";
import { listForMilestone } from "./suggestions.mjs";

const p = (...patterns) => patterns;
export const DIMENSIONS = Object.freeze([
  { id: "product-ui-ux-motion", patterns: p(/\.(css|scss|tsx|jsx|vue|svelte|html)$/i, /(^|\/)(components|screens|pages|views|styles|ui)\//i) },
  { id: "frontend-client", patterns: p(/\.(tsx|jsx|vue|svelte)$/i, /(^|\/)(app|client|web|mobile|ios|android|src\/(components|hooks))\//i) },
  { id: "backend-api", patterns: p(/(^|\/)(api|server|routes|handlers|functions|workers|services|backend)\//i, /\.(py|go|rb|java|rs)$/i) },
  { id: "data-migrations", patterns: p(/(^|\/)(migrations?|schema|prisma|db|supabase)\//i, /\.sql$/i, /schema\.(prisma|ts|json)$/i) },
  { id: "security-privacy-abuse", patterns: p(/(auth|login|session|permission|secret|token|crypto|middleware)/i, /\.env/i) },
  { id: "scale-performance-cost", patterns: p(/(cache|queue|worker|batch|perf|benchmark)/i, /(wrangler|vercel|fly)\.(toml|json)$/i) },
  { id: "reliability-recovery", patterns: p(/(retry|backup|restore|recover|health|fallback)/i, /(^|\/)(jobs|cron)\//i) },
  { id: "architecture-maintainability", patterns: p(/(^|\/)(src|lib)\//i, /package\.json$/i, /tsconfig/i) },
  { id: "compatibility-integrations", patterns: p(/(package(-lock)?\.json|pnpm-lock|yarn\.lock|Podfile|build\.gradle|requirements\.txt|go\.mod|Cargo\.toml)$/i, /(sdk|integration|webhook|plugin)/i) },
  { id: "observability-operations", patterns: p(/(log|metric|trace|telemetry|sentry|otel|monitor|alert|langfuse|posthog)/i) },
  { id: "ai-llm", patterns: p(/(prompt|llm|openai|anthropic|model|agent|eval|embedding)/i) },
  { id: "delivery-release", patterns: p(/(^|\/)\.github\//i, /(Dockerfile|wrangler\.toml|vercel\.json|fly\.toml|CHANGELOG|release|deploy)/i) },
  { id: "run-operate", patterns: p(/(wrangler\.toml|vercel\.json|fly\.toml|supabase\/config|\.env\.example|runbook|incident|backup|cron)/i) },
].map((d) => Object.freeze(d)));

const IDS = new Set(DIMENSIONS.map((d) => d.id));

export const receiptsFile = (root) => path.join(root, ".engineering", "super-outer", "sweep-receipts.json");

const git = (root, args) => {
  try {
    return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
};

export function readReceipts(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(receiptsFile(root), "utf8"));
    return Array.isArray(parsed?.receipts) ? parsed.receipts.filter((r) => r && IDS.has(r.dimension)) : [];
  } catch {
    return [];
  }
}

export function recordReceipt(root, dimension, result, { now = new Date() } = {}) {
  if (!IDS.has(dimension)) throw new Error(`Unknown sweep dimension: ${dimension}`);
  if (typeof result !== "string" || result.trim() === "" || result.length > 500) throw new Error("A sweep result needs a short non-empty text");
  const receipts = readReceipts(root).filter((r) => r.dimension !== dimension);
  receipts.push({ dimension, commit: git(root, ["rev-parse", "HEAD"]), date: now.toISOString(), result: result.trim() });
  const file = receiptsFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ schema_version: 1, receipts }, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return receipts.at(-1);
}

/** Returns [{ id, reason: "never-swept" | "files-changed", files? }]. */
export function dueDimensions(root) {
  const receipts = new Map(readReceipts(root).map((r) => [r.dimension, r]));
  const changedCache = new Map();
  const changedSince = (commit) => {
    if (!changedCache.has(commit)) {
      const out = commit ? git(root, ["diff", "--name-only", `${commit}..HEAD`]) : null;
      changedCache.set(commit, out === null ? null : out.split("\n").filter(Boolean));
    }
    return changedCache.get(commit);
  };
  const due = [];
  for (const d of DIMENSIONS) {
    const receipt = receipts.get(d.id);
    if (!receipt) { due.push({ id: d.id, reason: "never-swept" }); continue; }
    // Inside a repository, a receipt whose commit could not be read is checked again.
    if (!receipt.commit) {
      if (fs.existsSync(path.join(root, ".git"))) due.push({ id: d.id, reason: "no-commit" });
      continue;
    }
    const changed = changedSince(receipt.commit);
    if (changed === null) continue;
    const files = changed.filter((file) => d.patterns.some((pattern) => pattern.test(file)));
    if (files.length > 0) due.push({ id: d.id, reason: "files-changed", files: files.slice(0, 20) });
  }
  return due;
}

/** The due dimensions, pending suggestions, and the diagrams the changed files need. */
export function planSweep(root, { facts = {} } = {}) {
  const due = dueDimensions(root);
  const changedFiles = [...new Set(due.flatMap((d) => d.files ?? []))];
  return { due, suggestions: listForMilestone(root), diagrams: planDiagrams({ changedFiles, facts }) };
}

/** `super-outer sweep --plan [--json]` and `super-outer sweep --record <dim> <result>`. */
export function sweepCommand(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    if (argv[0] === "--record") {
      const receipt = recordReceipt(cwd, argv[1], argv.slice(2).join(" "));
      stdout.write(`${JSON.stringify(receipt)}\n`);
      return 0;
    }
    if (argv[0] === "--plan" || argv.length === 0) {
      const plan = planSweep(cwd);
      if (argv.includes("--json")) stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      else {
        const lines = plan.due.map((d) => `due ${d.id} (${d.reason}${d.files ? `: ${d.files.join(", ")}` : ""})`);
        for (const s of plan.suggestions) lines.push(`suggestion ${s.id} ${s.trigger}: ${s.text}`);
        if (plan.diagrams.unclear) lines.push("diagrams unclear: ask Jev the diagram-kinds question, or the owner if Jev is off or unsure");
        else if (plan.diagrams.length) lines.push(`diagrams ${plan.diagrams.join(", ")}`);
        stdout.write(`${lines.length ? lines.join("\n") : "nothing due"}\n`);
      }
      return 0;
    }
    stderr.write("Usage: super-outer sweep --plan [--json] | --record <dimension> <result>\n");
    return 2;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}
