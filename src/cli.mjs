import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { collectGitEvidence, describeDeliveryFailures, verifyDeliveryEvidence, verifyGitHubActionsEvidence } from "./git-evidence.mjs";
import { assertSchema, validateSchema } from "./schema-validation.mjs";
import { completionContractDigest, readContained, validateCompletionContract } from "./completion.mjs";
import { taskCompletionReport } from "./completion-report.mjs";

const SOURCE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI_FILE = path.join(SOURCE_ROOT, "bin", "super-outer.mjs");
const TASK_STATUSES = new Set(["UNASSESSED", "NEEDS_CLARIFICATION", "AWAITING_APPROVAL", "CONFIRMED", "ACTIVE", "VERIFYING", "PROVED", "SKIPPED", "CANCELLED", "BLOCKED", "BUDGET_EXCEEDED", "ROLLED_BACK"]);
const TERMINAL_TASK_STATUSES = new Set(["PROVED", "SKIPPED", "CANCELLED", "BLOCKED", "BUDGET_EXCEEDED", "ROLLED_BACK"]);
const MODES = new Set(["QUICK", "FOCUSED", "FULL", "CRITICAL"]);
const MANAGED_START = "# >>> super-outer v4 managed gate >>>";
const MANAGED_END = "# <<< super-outer v4 managed gate <<<";

const parseArguments = (argv) => {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { positionals.push(value); continue; }
    const equal = value.indexOf("=");
    const key = equal >= 0 ? value.slice(2, equal) : value.slice(2);
    const optionValue = equal >= 0 ? value.slice(equal + 1) : (argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true);
    const current = options.get(key) || [];
    current.push(optionValue);
    options.set(key, current);
  }
  const get = (name, fallback) => options.has(name) ? options.get(name).at(-1) : fallback;
  const list = (name, fallback = []) => options.has(name)
    ? options.get(name).flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean)
    : fallback;
  return { positionals, options, get, list, has: (name) => options.has(name) };
};

const atomicJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
};

const gitText = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Git command failed").trim());
  return result.stdout.trim();
};

const repositoryRoot = (cwd, explicit) => path.resolve(explicit || gitText(cwd, ["rev-parse", "--show-toplevel"]));
const shellQuote = (value) => `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
const configPath = (root) => path.join(root, ".engineering", "super-outer", "repository-enforcement.json");
const verificationSchema = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, "schemas", "verification-record.schema.json"), "utf8"));
const taskSchema = JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, "schemas", "task-record.schema.json"), "utf8"));
const sha256Bytes = (value) => crypto.createHash("sha256").update(value).digest("hex");
const insideRoot = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const repositoryContainedPath = (root, candidate, label) => {
  if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`${label} must stay inside the repository`);
  const canonicalRoot = fs.realpathSync(root);
  const requested = path.resolve(canonicalRoot, candidate);
  if (!insideRoot(canonicalRoot, requested)) throw new Error(`${label} must stay inside the repository`);
  const suffix = [];
  let probe = requested;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    suffix.unshift(path.basename(probe));
    probe = parent;
  }
  const canonical = path.join(fs.realpathSync(probe), ...suffix);
  if (!insideRoot(canonicalRoot, canonical)) throw new Error(`${label} must stay inside the repository`);
  return canonical;
};
const readCiEvidence = (parsed, cwd, resolver = verifyGitHubActionsEvidence, repositoryCwd = cwd) => {
  const filename = parsed.get("ci-evidence");
  if (!filename || filename === true) return null;
  const claim = JSON.parse(fs.readFileSync(path.resolve(cwd, filename), "utf8"));
  const resolved = resolver({ cwd: repositoryCwd, claim });
  if (
    String(resolved?.provider || "").toLowerCase() !== "github-actions" ||
    String(resolved?.repository || "").toLowerCase() !== String(claim?.repository || "").toLowerCase() ||
    String(resolved?.run_id || "") !== String(claim?.run_id || "") ||
    (claim?.workflow && String(resolved?.workflow || "") !== String(claim.workflow))
  ) {
    throw new Error("The live CI result does not match the named GitHub Actions repository, workflow, and run");
  }
  return resolved;
};
const bindLocalSourceEvidence = ({ parsed, cwd, sourceCheck = null, head }) => {
  const expectedDigest = String(sourceCheck?.artifact_sha256 || "").trim().toLowerCase();
  if (sourceCheck && !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("PROVED requires a source PASS check with a SHA-256 evidence artifact");
  }
  const filename = parsed.get("source-evidence");
  if (!filename || filename === true) {
    throw new Error("PROVED requires --source-evidence <exact-head source evidence JSON>");
  }
  const absolute = path.resolve(cwd, filename);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error("The source evidence artifact does not exist as a regular file");
  }
  const artifactBytes = fs.readFileSync(absolute);
  const actualDigest = sha256Bytes(artifactBytes);
  if (expectedDigest && actualDigest !== expectedDigest) throw new Error("The source evidence artifact digest does not match the independent verification record");
  let evidence;
  try { evidence = JSON.parse(artifactBytes.toString("utf8")); }
  catch { throw new Error("The source evidence artifact must be readable JSON"); }
  if (evidence?.status !== "PASS") throw new Error("The source evidence artifact does not report PASS");
  if (evidence?.head !== head) throw new Error("The source evidence artifact belongs to a different repository head");
  const contradictoryFailure = (evidence.exit_code !== undefined && Number(evidence.exit_code) !== 0)
    || evidence.passed === false
    || evidence.success === false
    || (Array.isArray(evidence.failures) && evidence.failures.length > 0)
    || (Array.isArray(evidence.failed_checks) && evidence.failed_checks.length > 0)
    || /^(?:FAIL|FAILED|ERROR|CANCELLED|TIMED_OUT)$/i.test(String(evidence.result || evidence.conclusion || ""));
  if (contradictoryFailure) throw new Error("The source evidence artifact contradicts its PASS claim with a failed result");
  return {
    head,
    artifact_sha256: actualDigest,
    status: "PASS",
    producer_authenticated: false,
    limitation: "This binds the supplied evidence bytes and reported result to the clean exact head; it does not authenticate who produced the artifact or independently rerun its underlying check.",
  };
};

const independentReviewSummary = ({ verification, record, head, required, ciBound, additionalRisks = [] }) => {
  const provided = Boolean(verification);
  const exactTask = provided && verification.task_id === record.task_id;
  const exactHead = provided && verification.head === head;
  const checks = (verification?.checks || []).map(({ name, scope, status }) => ({ name, scope, status }));
  const residualRisks = [...(verification?.residual_risks || [])];
  const addRisk = (risk) => { if (!residualRisks.includes(risk)) residualRisks.push(risk); };
  if (!provided) addRisk("Independent review was not run or supplied for this closure.");
  else {
    if (!exactTask) addRisk("The supplied independent review belongs to a different task.");
    if (!exactHead) addRisk("The supplied independent review covers a different repository version.");
    if (verification.status !== "PROVED") addRisk(`Independent review status was ${verification.status}, not PROVED.`);
    if (verification.independent_verdict !== "PASS") addRisk(`Independent reviewer verdict was ${verification.independent_verdict}, not PASS.`);
    for (const check of checks.filter(({ status }) => ["FAIL", "NOT RUN"].includes(status))) {
      addRisk(`Independent review check "${check.name}" was ${check.status}.`);
    }
  }
  if (record.mode === "FULL" && !ciBound) {
    addRisk("Exact-head terminal CI was not independently confirmed; this record does not prove production delivery.");
  }
  for (const risk of additionalRisks) addRisk(risk);
  return {
    enforcement: required ? "REQUIRED" : "ADVISORY",
    provided,
    review_status: verification?.status || "NOT RUN",
    independent_verdict: verification?.independent_verdict || "NOT RUN",
    exact_task: exactTask,
    exact_head: exactHead,
    checks,
    residual_risks: residualRisks,
  };
};

const hookPath = (root) => {
  const raw = gitText(root, ["rev-parse", "--git-path", "hooks/pre-commit"]);
  return path.resolve(root, raw);
};

const managedHookBlock = () => `${MANAGED_START}\n${shellQuote(process.execPath)} ${shellQuote(CLI_FILE)} repo verify --root \"$(git rev-parse --show-toplevel)\" --commit-gate\n${MANAGED_END}`;

const installRepositoryHook = (root) => {
  const filename = hookPath(root);
  const existing = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "#!/bin/sh\n";
  if (existing.includes(MANAGED_START)) return { hook: filename, changed: false };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const next = `${existing.replace(/\s*$/, "\n")}${managedHookBlock()}\n`;
  fs.writeFileSync(filename, next, { mode: 0o755 });
  fs.chmodSync(filename, 0o755);
  return { hook: filename, changed: true };
};

const removeRepositoryHook = (root) => {
  const filename = hookPath(root);
  if (!fs.existsSync(filename)) return { hook: filename, changed: false };
  const existing = fs.readFileSync(filename, "utf8");
  const expression = new RegExp(`\\n?${MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "g");
  const next = existing.replace(expression, "\n");
  if (next === existing) return { hook: filename, changed: false };
  if (next.trim() === "#!/bin/sh") fs.unlinkSync(filename);
  else { fs.writeFileSync(filename, next, { mode: 0o755 }); fs.chmodSync(filename, 0o755); }
  return { hook: filename, changed: true };
};

export const validateTaskRecord = (record) => {
  const errors = [];
  const allowed = new Set(["schema_version", "task_id", "status", "repository", "branch", "base", "mode", "selected_modules", "allowed_actions", "allowed_paths", "allowed_destinations", "plan", "approval_digest", "approved_at", "environment", "excluded_actions", "created_at", "attempt_limit", "minute_budget", "attempts", "verification_digest", "evidence_binding", "independent_review", "production_delivery_claim", "completion_contract", "completion_evidence", "completion_state", "product_intent", "design_package"]);
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: ["task record must be an object"] };
  for (const key of Object.keys(record)) if (!allowed.has(key)) errors.push(`unknown task property: ${key}`);
  if (record.schema_version !== "1.0.0" && record.schema_version !== "bootstrap-1") errors.push("invalid schema_version");
  if (!record.task_id || typeof record.task_id !== "string") errors.push("task_id is required");
  if (!TASK_STATUSES.has(record.status)) errors.push("invalid task status");
  if (!MODES.has(record.mode)) errors.push("invalid task mode");
  for (const key of ["repository", "branch", "base", "plan"]) if (typeof record[key] !== "string") errors.push(`${key} must be a string`);
  for (const key of ["selected_modules", "allowed_actions", "allowed_paths", "allowed_destinations"]) if (!Array.isArray(record[key]) || new Set(record[key]).size !== record[key].length) errors.push(`${key} must be a unique array`);
  if (record.schema_version === "1.0.0") {
    if (typeof record.created_at !== "string" || Number.isNaN(Date.parse(record.created_at))) errors.push("created_at must be a date-time");
    if (!Number.isInteger(record.attempt_limit) || record.attempt_limit < 1 || record.attempt_limit > 100) errors.push("attempt_limit must be 1-100");
    if (!Number.isInteger(record.minute_budget) || record.minute_budget < 1 || record.minute_budget > 10080) errors.push("minute_budget must be 1-10080");
    if (!Array.isArray(record.attempts) || record.attempts.length > 100) errors.push("attempts must be an array of at most 100 records");
    else {
      let previousElapsed = -1;
      record.attempts.forEach((attempt, index) => {
        const keys = ["attempt_number", "recorded_at", "elapsed_minutes", "strategy", "change", "evidence", "result"];
        if (!attempt || typeof attempt !== "object" || Object.keys(attempt).some((key) => !keys.includes(key))) errors.push(`attempt ${index + 1} has invalid fields`);
        else {
          if (attempt.attempt_number !== index + 1) errors.push(`attempt ${index + 1} has wrong attempt_number`);
          if (typeof attempt.recorded_at !== "string" || Number.isNaN(Date.parse(attempt.recorded_at))) errors.push(`attempt ${index + 1} needs recorded_at`);
          if (!Number.isFinite(attempt.elapsed_minutes) || attempt.elapsed_minutes < previousElapsed) errors.push(`attempt ${index + 1} elapsed_minutes must be cumulative`);
          previousElapsed = attempt.elapsed_minutes;
          for (const key of ["strategy", "change"]) if (typeof attempt[key] !== "string" || !attempt[key].trim()) errors.push(`attempt ${index + 1} needs ${key}`);
          if (!Array.isArray(attempt.evidence) || !attempt.evidence.length || attempt.evidence.some((value) => typeof value !== "string" || !value.trim())) errors.push(`attempt ${index + 1} needs evidence`);
          if (!new Set(["CONTINUE", "PASS", "FAIL", "BLOCKED"]).has(attempt.result)) errors.push(`attempt ${index + 1} has invalid result`);
        }
      });
    }
  }
  if (record.production_delivery_claim === true) {
    if (record.status !== "PROVED") errors.push("production_delivery_claim requires PROVED status");
    if (!record.evidence_binding?.ci) errors.push("production_delivery_claim requires exact-head CI evidence");
    if (record.independent_review?.enforcement !== "REQUIRED" || record.independent_review?.review_status !== "PROVED" || record.independent_review?.independent_verdict !== "PASS") {
      errors.push("production_delivery_claim requires passing independent review");
    }
  }
  if (record.completion_contract !== undefined) errors.push(...validateCompletionContract(record.completion_contract).errors);
  errors.push(...validateSchema(taskSchema, record).map((error) => `schema ${error}`));
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
};

const safeTaskId = (value) => {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error("task id must be a safe filename token");
  return id;
};

const taskFiles = (root, id) => ({
  durable: path.join(root, ".engineering", "super-outer", "tasks", `${safeTaskId(id)}.json`),
  current: path.join(root, ".engineering", "super-outer", "current-task.json")
});

const profileCommand = async (action, parsed, cwd) => {
  const profileModule = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "profile.mjs")));
  const root = fs.realpathSync(path.resolve(parsed.get("root", cwd)));
  const filename = repositoryContainedPath(root, parsed.get("file", ".engineering/super-outer/repository-profile.json"), "Profile file");
  if (action === "create") {
    const inputFile = parsed.get("input");
    const specification = inputFile ? JSON.parse(fs.readFileSync(path.resolve(cwd, inputFile), "utf8")) : {};
    const profile = await profileModule.createRepositoryProfile({
      root,
      repository: parsed.get("repository", specification.repository ?? path.basename(root)),
      extends: parsed.get("extends", specification.extends),
      sections: specification.sections ?? {}
    });
    atomicJson(filename, profile);
    return { created: true, file: filename, profile };
  }
  const profile = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (action === "validate") return { file: filename, ...profileModule.validateProfile(profile) };
  if (action === "refresh") {
    const rereadFile = parsed.get("reread");
    const rereads = rereadFile ? JSON.parse(fs.readFileSync(path.resolve(cwd, rereadFile), "utf8")) : null;
    const result = await profileModule.refreshProfile(profile, {
      root,
      ...(rereads ? { rereadSection: async ({ sectionId }) => rereads[sectionId] } : {})
    });
    if (result.missingSources.length || result.pendingRereadSections.length) {
      return {
        refreshed: false,
        stale: true,
        file: filename,
        pendingRereadSections: result.pendingRereadSections,
        missingSources: result.missingSources
      };
    }
    atomicJson(filename, result.profile);
    return { refreshed: true, stale: false, file: filename, changedSections: result.changedSections };
  }
  throw new Error(`Unknown profile command: ${action || "missing"}`);
};

const readStreamJson = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("route --stdin received no JSON input");
  return JSON.parse(raw);
};

const routeCommand = async (parsed, cwd, stdin) => {
  let input;
  const inputFile = parsed.get("input");
  if (inputFile) input = JSON.parse(fs.readFileSync(path.resolve(cwd, inputFile), "utf8"));
  else if (parsed.has("stdin")) input = await readStreamJson(stdin);
  else throw new Error("route requires --input <JSON file> or --stdin; task content is not accepted in argv");
  const { routeTask } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "router.mjs")));
  return routeTask(input);
};

const repoCommand = async (action, parsed, cwd, ciEvidenceResolver) => {
  const root = repositoryRoot(cwd, parsed.get("root"));
  const filename = configPath(root);
  if (action === "enable") {
    const evidence = collectGitEvidence({ cwd: root, baseRef: parsed.get("base") });
    const hook = installRepositoryHook(root);
    const config = {
      schema_version: "1.0.0",
      enabled: true,
      base_ref: evidence.base_ref,
      mode: "local-git-hook",
      command: "super-outer repo verify --commit-gate",
    };
    atomicJson(filename, config);
    return { enabled: true, root, hook };
  }
  if (action === "disable") {
    const hook = removeRepositoryHook(root);
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
    return { enabled: false, root, hook };
  }
  if (action === "verify") {
    if (!fs.existsSync(filename)) throw new Error("Repository enforcement is not enabled");
    const config = JSON.parse(fs.readFileSync(filename, "utf8"));
    let depth = parsed.get("depth", parsed.has("commit-gate") ? "QUICK" : "FULL");
    const currentTask = path.join(root, ".engineering", "super-outer", "current-task.json");
    depth = String(depth).toUpperCase();
    if (!parsed.has("commit-gate") && fs.existsSync(currentTask)) {
      const taskDepth = String(JSON.parse(fs.readFileSync(currentTask, "utf8")).mode || "").toUpperCase();
      const depthOrder = ["QUICK", "FOCUSED", "FULL", "CRITICAL"];
      if (depthOrder.indexOf(taskDepth) > depthOrder.indexOf(depth)) depth = taskDepth;
    }
    if (!MODES.has(depth)) throw new Error("Repository verification depth must be QUICK, FOCUSED, FULL, or CRITICAL");
    const productionDelivery = parsed.has("production-delivery");
    const strictCi = depth === "CRITICAL" || productionDelivery;
    let resolvedCiEvidence = null;
    let ciResolutionWarning = null;
    try { resolvedCiEvidence = readCiEvidence(parsed, cwd, ciEvidenceResolver, root); }
    catch (error) {
      if (strictCi) throw error;
      ciResolutionWarning = error.message;
    }
    const evidence = collectGitEvidence({
      cwd: root,
      baseRef: parsed.get("base", config.base_ref),
      ciSha: parsed.get("ci-sha", ""),
      ciEvidence: resolvedCiEvidence,
    });
    const requireClean = !parsed.has("allow-dirty") && !parsed.has("commit-gate");
    const result = verifyDeliveryEvidence(evidence, { depth: strictCi ? "CRITICAL" : "QUICK", requireClean });
    if (!result.pass) throw new Error(describeDeliveryFailures(result.failures));
    const advisoryFailures = strictCi || depth !== "FULL"
      ? []
      : verifyDeliveryEvidence(evidence, { depth: "FULL", requireClean }).failures.filter((failure) => failure.startsWith("ci-"));
    const ciDetail = [
      ...(ciResolutionWarning ? [ciResolutionWarning] : []),
      ...(advisoryFailures.length ? [describeDeliveryFailures(advisoryFailures)] : []),
    ].join(" ");
    const advisories = ciDetail
      ? [`FULL verification expected completed passing remote checks for this repository version. ${ciDetail} This matters before production delivery. Local work may continue, but production delivery is not proved.`]
      : [];
    let completion = null;
    if (!parsed.has("commit-gate") && fs.existsSync(currentTask)) {
      const task = JSON.parse(fs.readFileSync(currentTask, "utf8"));
      completion = taskCompletionReport(root, task);
      advisories.push(...completion.warnings);
      if (strictCi && ((!completion.pass && task.completion_contract) || !completion.obligations_pass)) {
        throw new Error(completion.warnings.join(" "));
      }
    }
    return { verified: true, evidence, ...(completion ? { completion } : {}), ...(advisories.length ? { advisories } : {}) };
  }
  throw new Error(`Unknown repo command: ${action || "missing"}`);
};

const taskCommand = async (action, parsed, cwd, ciEvidenceResolver) => {
  const root = repositoryRoot(cwd, parsed.get("root"));
  const completionInput = () => {
    const filename = parsed.get("completion-contract");
    if (!filename || filename === true) throw new Error("--completion-contract requires a JSON file");
    let value, descriptor;
    try {
      const absolute = repositoryContainedPath(root, path.resolve(fs.realpathSync(cwd), filename), "Completion contract");
      descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("Invalid contract file");
      const buffer = Buffer.alloc(1024 * 1024 + 1);
      let size = 0;
      while (size < buffer.length) {
        const count = fs.readSync(descriptor, buffer, size, buffer.length - size, null);
        if (count === 0) break;
        size += count;
      }
      if (size > 1024 * 1024) throw new Error("Oversized contract file");
      value = JSON.parse(buffer.subarray(0, size).toString("utf8"));
    } catch {
      throw new Error("Completion contract must be valid JSON in a repository-contained regular file of at most 1 MiB");
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    const result = validateCompletionContract(value);
    if (!result.valid) throw new Error(`Invalid completion contract: ${result.errors.join(", ")}`);
    return value;
  };
  const completionEvidencePath = () => {
    const filename = parsed.get("completion-evidence");
    if (!filename || filename === true) throw new Error("--completion-evidence requires a JSON file");
    const requested = path.resolve(fs.realpathSync(cwd), filename);
    const canonical = fs.existsSync(requested) ? fs.realpathSync(requested) : requested;
    const relative = path.relative(fs.realpathSync(root), canonical);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
      throw new Error("Completion evidence must be inside the repository");
    }
    return relative;
  };
  if (action === "create") {
    const evidence = collectGitEvidence({ cwd: root, baseRef: parsed.get("base") });
    const id = safeTaskId(parsed.get("id", `task-${Date.now().toString(36)}`));
    const record = {
      schema_version: "1.0.0", task_id: id, status: "UNASSESSED",
      repository: parsed.get("repository", root), branch: evidence.branch,
      base: `${evidence.base_ref}@${evidence.details.baseSha}`, mode: String(parsed.get("mode", "FOCUSED")).toUpperCase(),
      selected_modules: parsed.list("modules"), allowed_actions: parsed.list("actions", ["edit-files", "run-tests"]),
      allowed_paths: parsed.list("paths", ["."]), allowed_destinations: parsed.list("destinations", ["none"]),
      plan: parsed.get("plan", "none"), environment: parsed.get("environment", "local"), excluded_actions: parsed.list("excluded", ["all-other-mutations"]),
      created_at: new Date().toISOString(), attempt_limit: Number(parsed.get("attempt-limit", 4)),
      minute_budget: Number(parsed.get("minute-budget", 60)), attempts: [],
      ...(parsed.has("completion-contract") ? { completion_contract: completionInput() } : {}),
      ...(parsed.has("completion-evidence") ? { completion_evidence: completionEvidencePath() } : {})
    };
    const validation = validateTaskRecord(record);
    if (!validation.valid) throw new Error(`Invalid task: ${validation.errors.join(", ")}`);
    const files = taskFiles(root, id);
    atomicJson(files.durable, record);
    atomicJson(files.current, record);
    return { created: true, files, task: record };
  }
  const id = safeTaskId(parsed.get("id"));
  const files = taskFiles(root, id);
  if (!fs.existsSync(files.durable)) throw new Error(`Task does not exist: ${id}`);
  const record = JSON.parse(fs.readFileSync(files.durable, "utf8"));
  if (action === "validate") return { file: files.durable, ...validateTaskRecord(record) };
  if (action === "completion") {
    const changing = parsed.has("completion-contract") || parsed.has("completion-evidence");
    if (changing && TERMINAL_TASK_STATUSES.has(record.status)) throw new Error("Create a new task before changing a terminal task's completion contract");
    const updated = {
      ...record,
      ...(parsed.has("completion-contract") ? { completion_contract: completionInput() } : {}),
      ...(parsed.has("completion-evidence") ? { completion_evidence: completionEvidencePath() } : {}),
    };
    const completion = taskCompletionReport(root, updated);
    if (changing) {
      // A changed target cannot inherit approval or final verification state.
      const changedContract = parsed.has("completion-contract") && (!record.completion_contract
        || completionContractDigest(record.completion_contract) !== completionContractDigest(updated.completion_contract));
      if (changedContract) {
        delete updated.approval_digest;
        delete updated.approved_at;
      }
      if (changedContract || updated.completion_evidence !== record.completion_evidence) {
        for (const field of ["verification_digest", "evidence_binding", "independent_review", "completion_state"]) delete updated[field];
      }
      const validation = validateTaskRecord(updated);
      if (!validation.valid) throw new Error(`Invalid task: ${validation.errors.join(", ")}`);
      atomicJson(files.durable, updated); atomicJson(files.current, updated);
    }
    return { updated: changing, completion, task: updated };
  }
  if (action === "design") {
    // Records whether a user-facing change needs a design package, and pins the
    // package and intent versions that builders and reviewers must cite. The
    // manifest is hashed the same way the closure check hashes it.
    if (TERMINAL_TASK_STATUSES.has(record.status)) throw new Error("Create a new task before changing a terminal task's design record");
    const requiredValue = String(parsed.get("required", "")).toLowerCase();
    if (!["yes", "no", "true", "false"].includes(requiredValue)) throw new Error("task design requires --required yes or no");
    const reason = String(parsed.get("reason", "")).trim();
    if (!reason) throw new Error("task design requires --reason with one plain sentence");
    const containedHash = (relative, label) => {
      const snapshot = readContained(root, relative, { label });
      if (!snapshot.bytes) throw new Error(`${label} could not be read inside the repository: ${relative}`);
      return crypto.createHash("sha256").update(snapshot.bytes).digest("hex");
    };
    const designPackage = { required: requiredValue === "yes" || requiredValue === "true", reason };
    // A run without --package keeps the package already pinned, so updating the
    // reason cannot silently drop the version that receipts are tied to.
    const previous = record.design_package ?? {};
    if (!parsed.has("package") && typeof previous.path === "string" && typeof previous.sha256 === "string") {
      Object.assign(designPackage, { path: previous.path, version: previous.version, sha256: previous.sha256 });
    }
    if (parsed.has("package")) {
      const folder = String(parsed.get("package")).replace(/\/+$/, "");
      const version = String(parsed.get("package-version", "")).trim();
      if (!version) throw new Error("task design --package requires --package-version");
      Object.assign(designPackage, { path: folder, version, sha256: containedHash(`${folder}/manifest.json`, "Design package manifest") });
    }
    const updated = { ...record, design_package: designPackage };
    if (parsed.has("intent")) {
      const intentPath = String(parsed.get("intent"));
      const intentVersion = String(parsed.get("intent-version", "")).trim();
      if (!intentVersion) throw new Error("task design --intent requires --intent-version");
      updated.product_intent = { path: intentPath, version: intentVersion, sha256: containedHash(intentPath, "Product intent record") };
    }
    // Final verification recorded against an earlier package or intent, or
    // under a different requirement, is stale. A reworded reason changes neither.
    const pinned = (value) => JSON.stringify(value ? { required: value.required, path: value.path, version: value.version, sha256: value.sha256 } : null);
    const changed = pinned(record.design_package) !== pinned(updated.design_package)
      || JSON.stringify(record.product_intent ?? null) !== JSON.stringify(updated.product_intent ?? null);
    if (changed) for (const field of ["verification_digest", "evidence_binding", "independent_review", "completion_state"]) delete updated[field];
    const validation = validateTaskRecord(updated);
    if (!validation.valid) throw new Error(`Invalid task: ${validation.errors.join(", ")}`);
    atomicJson(files.durable, updated); atomicJson(files.current, updated);
    return { updated: true, design_package: updated.design_package, product_intent: updated.product_intent ?? null, task: updated };
  }
  if (action === "attempt") {
    if (TERMINAL_TASK_STATUSES.has(record.status)) throw new Error(`Task is terminal: ${record.status}`);
    if (record.attempts.length >= record.attempt_limit || record.attempts.at(-1)?.elapsed_minutes >= record.minute_budget) {
      const exhausted = { ...record, status: "BUDGET_EXCEEDED" };
      atomicJson(files.durable, exhausted); atomicJson(files.current, exhausted);
      return { recorded: false, budget_exceeded: true, task: exhausted };
    }
    const strategy = String(parsed.get("strategy", "")).trim();
    const change = String(parsed.get("change", "")).trim();
    const evidence = parsed.list("evidence");
    const result = String(parsed.get("result", "")).toUpperCase();
    if (!strategy || !change || !evidence.length) throw new Error("task attempt requires --strategy, --change, and at least one --evidence");
    if (!new Set(["CONTINUE", "PASS", "FAIL", "BLOCKED"]).has(result)) throw new Error("task attempt result must be CONTINUE, PASS, FAIL, or BLOCKED");
    if (record.attempts.at(-1)?.strategy.trim().toLowerCase() === strategy.toLowerCase()) throw new Error("A retry must change strategy rather than repeat the previous attempt");
    const computedElapsed = Math.max(0, (Date.now() - Date.parse(record.created_at)) / 60_000);
    const elapsed = Number(parsed.get("elapsed-minutes", computedElapsed));
    if (!Number.isFinite(elapsed) || elapsed < (record.attempts.at(-1)?.elapsed_minutes ?? 0)) throw new Error("elapsed-minutes must be cumulative and non-decreasing");
    const attempt = {
      attempt_number: record.attempts.length + 1,
      recorded_at: new Date().toISOString(),
      elapsed_minutes: elapsed,
      strategy,
      change,
      evidence,
      result
    };
    const attempts = [...record.attempts, attempt];
    const budgetExceeded = result !== "PASS" && result !== "BLOCKED" && (attempts.length >= record.attempt_limit || elapsed >= record.minute_budget);
    const status = budgetExceeded ? "BUDGET_EXCEEDED" : result === "PASS" ? "VERIFYING" : result === "BLOCKED" ? "BLOCKED" : "ACTIVE";
    const updated = { ...record, status, attempts };
    const validation = validateTaskRecord(updated);
    if (!validation.valid) throw new Error(`Invalid task attempt: ${validation.errors.join(", ")}`);
    atomicJson(files.durable, updated); atomicJson(files.current, updated);
    return { recorded: true, budget_exceeded: budgetExceeded, attempt, task: updated };
  }
  if (action === "close") {
    if (!parsed.has("status")) throw new Error("task close requires an explicit --status");
    const status = String(parsed.get("status")).toUpperCase().replaceAll("-", "_");
    if (!TERMINAL_TASK_STATUSES.has(status)) throw new Error("task close requires a terminal status");
    let verification = null;
    let verificationDigest = null;
    let evidenceBinding = null;
    let independentReview = null;
    let completion = null;
    if (status === "PROVED") {
      completion = taskCompletionReport(root, record, {
        evidencePath: parsed.has("completion-evidence") ? completionEvidencePath() : undefined,
        closingAsProved: true,
      });
      // A task that records a required design package also needs a passing
      // rendered review against the product intent, the owner's acceptance and
      // an unchanged package before it can close as PROVED.
      if ((record.completion_contract && !completion.pass) || !completion.obligations_pass
        || (record.design_package?.required && !completion.design_pass)) {
        throw new Error(`Cannot mark the requested work PROVED. ${completion.warnings.join(" ")} Ordinary work may continue.`);
      }
      const productionDelivery = parsed.has("production-delivery");
      const reviewRequired = record.mode === "CRITICAL" || productionDelivery;
      const verificationFile = parsed.get("verification");
      if (reviewRequired && (!verificationFile || verificationFile === true)) {
        throw new Error(`${productionDelivery ? "Production delivery" : "CRITICAL PROVED"} requires --verification <independent exact-head record>`);
      }
      let verificationBytes = null;
      if (verificationFile && verificationFile !== true) {
        const absoluteVerification = path.resolve(cwd, verificationFile);
        verificationBytes = fs.readFileSync(absoluteVerification);
        verification = JSON.parse(verificationBytes.toString("utf8"));
        assertSchema(verificationSchema, verification, "independent verification record");
      }
      let git = collectGitEvidence({ cwd: root, baseRef: record.base?.split("@")[0] });
      if (git.dirty) throw new Error("PROVED requires a clean repository at the verified head");
      const exactReview = verification?.task_id === record.task_id && verification?.head === git.head;
      if (reviewRequired) {
        if (verification.task_id !== record.task_id) throw new Error("Verification belongs to a different task");
        if (verification.head !== git.head) throw new Error("Verification belongs to a different repository head");
        if (verification.status !== "PROVED" || verification.independent_verdict !== "PASS") {
          throw new Error("Independent verification did not return PASS and PROVED");
        }
        if (verification.checks.some((check) => ["FAIL", "NOT RUN"].includes(check.status))) {
          throw new Error("Independent verification still contains a failed or unrun check");
        }
      }
      const sourceChecks = exactReview ? verification.checks.filter((check) => check.scope === "source") : [];
      if (sourceChecks.some((check) => ["FAIL", "NOT RUN"].includes(check.status))) {
        throw new Error("PROVED cannot include a failed or unrun exact-head source check");
      }
      const sourceCheck = sourceChecks.find((check) => check.status === "PASS") || null;
      if (reviewRequired && !sourceCheck) throw new Error("Independent verification has no passing source check");
      const sourceCheckHasDigest = /^[a-f0-9]{64}$/.test(String(sourceCheck?.artifact_sha256 || "").trim().toLowerCase());
      const sourceBinding = bindLocalSourceEvidence({ parsed, cwd, sourceCheck: reviewRequired || sourceCheckHasDigest ? sourceCheck : null, head: git.head });
      let ciBinding = null;
      const advisoryRisks = [];
      if (reviewRequired) {
        if (!verification.checks.some((check) => check.scope === "ci" && check.status === "PASS")) {
          throw new Error(`${productionDelivery ? "Production delivery" : record.mode} verification requires terminal CI on the exact head`);
        }
        if (!parsed.has("ci-evidence")) {
          throw new Error(`${productionDelivery ? "Production delivery" : record.mode} PROVED requires --ci-evidence <named GitHub Actions run>`);
        }
        const liveCiEvidence = readCiEvidence(parsed, cwd, ciEvidenceResolver, root);
        git = collectGitEvidence({
          cwd: root,
          baseRef: record.base?.split("@")[0],
          ciEvidence: liveCiEvidence,
        });
        const delivery = verifyDeliveryEvidence(git, { depth: "CRITICAL", requireClean: true });
        if (!delivery.pass) throw new Error(describeDeliveryFailures(delivery.failures));
        ciBinding = git.ci_evidence;
      } else if (parsed.has("ci-evidence")) {
        try {
          const liveCiEvidence = readCiEvidence(parsed, cwd, ciEvidenceResolver, root);
          git = collectGitEvidence({ cwd: root, baseRef: record.base?.split("@")[0], ciEvidence: liveCiEvidence });
          const delivery = verifyDeliveryEvidence(git, { depth: "FULL", requireClean: true });
          if (!delivery.pass) throw new Error(describeDeliveryFailures(delivery.failures));
          ciBinding = git.ci_evidence;
        } catch (error) {
          advisoryRisks.push(`The supplied CI evidence could not prove production delivery: ${error.message}`);
        }
      }
      verificationDigest = verificationBytes ? sha256Bytes(verificationBytes) : null;
      evidenceBinding = {
        source: { ...sourceBinding, ...(verificationDigest && exactReview && sourceCheckHasDigest ? { verification_record_sha256: verificationDigest } : {}) },
        ...(ciBinding ? { ci: ciBinding } : {}),
      };
      independentReview = independentReviewSummary({ verification, record, head: git.head, required: reviewRequired, ciBound: Boolean(ciBinding), additionalRisks: advisoryRisks });
    }
    const closed = {
      ...record,
      status,
      ...(verificationDigest ? { verification_digest: verificationDigest } : {}),
      ...(evidenceBinding ? { evidence_binding: evidenceBinding } : {}),
      ...(independentReview ? { independent_review: independentReview } : {}),
      ...(completion ? { completion_state: completion.state } : {}),
      ...(parsed.has("completion-evidence") ? { completion_evidence: completionEvidencePath() } : {}),
      ...(status === "PROVED" && parsed.has("production-delivery") ? { production_delivery_claim: true } : {}),
    };
    const validation = validateTaskRecord(closed);
    if (!validation.valid) throw new Error(`Invalid task: ${validation.errors.join(", ")}`);
    atomicJson(files.durable, closed);
    atomicJson(files.current, closed);
    return {
      closed: true,
      task: closed,
      verification_digest: verificationDigest,
      ...(evidenceBinding ? { evidence_binding: evidenceBinding } : {}),
      ...(independentReview ? { independent_review: independentReview } : {}),
      ...(completion ? { completion } : {}),
    };
  }
  throw new Error(`Unknown task command: ${action || "missing"}`);
};

const packageCommand = async (action, parsed) => {
  const module = await import(pathToFileURL(path.join(SOURCE_ROOT, "scripts", "build-package.mjs")));
  if (action === "build") return module.buildPackage({ root: parsed.get("root", SOURCE_ROOT), outputFile: parsed.get("output", undefined), outputDir: parsed.get("output-dir", undefined) });
  if (action === "verify") return module.verifyPackage({ packageFile: parsed.get("package") || parsed.positionals[2], checksumFile: parsed.get("checksum", undefined) });
  throw new Error(`Unknown package command: ${action || "missing"}`);
};

const installCommand = async (command, parsed) => {
  if (command === "rollback") {
    const { rollbackInstallation } = await import(pathToFileURL(path.join(SOURCE_ROOT, "scripts", "rollback.mjs")));
    return rollbackInstallation({ home: parsed.get("home") });
  }
  const installer = await import(pathToFileURL(path.join(SOURCE_ROOT, "scripts", "install.mjs")));
  if (command === "verify") return installer.verifyInstallation({ home: parsed.get("home"), sourceRoot: parsed.get("source", SOURCE_ROOT) });
  let hostAdapter;
  if (parsed.has("promote")) {
    const home = parsed.get("home");
    if (!home) throw new Error("--promote requires an explicit isolated --home");
    const hostModule = await import(pathToFileURL(path.join(SOURCE_ROOT, "scripts", "host-adapter.mjs")));
    hostAdapter = hostModule.createProductionHostAdapter({
      home,
      claudeConfigRoot: parsed.get("claude-config", undefined),
      codexConfigRoot: parsed.get("codex-config", undefined),
      executables: {
        claude: parsed.get("claude-executable", "claude"),
        codex: parsed.get("codex-executable", "codex"),
      },
    });
  }
  return command === "upgrade"
    ? installer.upgradeSuperOuter({ home: parsed.get("home"), sourceRoot: parsed.get("source", SOURCE_ROOT), promote: parsed.has("promote"), hostAdapter })
    : installer.installSuperOuter({ home: parsed.get("home"), sourceRoot: parsed.get("source", SOURCE_ROOT), promote: parsed.has("promote"), hostAdapter });
};

// Jev's settings and the private record. The key itself is never printed.
const jevCommand = async (action) => {
  const settingsModule = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "jev", "settings.mjs")));
  const recordModule = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "jev", "record.mjs")));
  const settings = settingsModule.loadSettings();
  const dataDir = settingsModule.resolveDataDir();
  if (action === "status") {
    return {
      jev: settings.state,
      key_source: settings.keySource,
      key_file: path.join(settingsModule.resolveConfigDir(), "jev.env"),
      record: settings.record,
      record_rows: recordModule.readRecord({ dataDir }).length,
    };
  }
  if (action === "domains") {
    const rows = recordModule.readRecord({ dataDir });
    return { record_rows: rows.length, domains: recordModule.domainCounts(rows) };
  }
  throw new Error(`Unknown jev command: ${action || "missing"}`);
};

// One closed question from another plugin. It prints one JSON line and always returns 0.
const jevAskCommand = async (argv, { cwd, stdin, stdout }) => {
  let line = JSON.stringify({ answer: null, source: "local", confident: false });
  try {
    const { askChoice } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "jev", "ask.mjs")));
    const chunks = [];
    let size = 0;
    for await (const chunk of stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buffer.length;
      if (size <= 64 * 1024) chunks.push(buffer);
    }
    const text = size <= 64 * 1024 ? Buffer.concat(chunks).toString("utf8") : null;
    line = JSON.stringify(await askChoice({ argv, text, cwd }));
  } catch {
    // The default line stands.
  }
  stdout.write(`${line}\n`);
  return 0;
};

// The tool check's trimmer: a raw registry response on stdin, the kept fields out.
// It reads stdin only and makes no network call (src/tool-check-trim.mjs).
const toolCheckTrimCommand = async (argv, { stdin, stdout, stderr }) => {
  const { trim } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "tool-check-trim.mjs")));
  const [source, ...rest] = argv;
  const publisherAt = rest.indexOf("--publisher");
  const publisher = publisherAt >= 0 ? rest[publisherAt + 1] : undefined;
  if (!source || (publisherAt >= 0 && !publisher)) {
    stderr.write("Use: super-outer tool-check trim <skills-search|skills-audit|mcp-registry|npm|pypi> [--publisher <name>] < response.json\n");
    return 1;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size <= 8 * 1024 * 1024) chunks.push(buffer);
  }
  stdout.write(`${trim(source, Buffer.concat(chunks).toString("utf8"), { publisher }).join("\n")}\n`);
  return 0;
};

// The mechanical tool check (src/tool-check.mjs): registry lookups for the
// project's public dependencies, the publishers' skills and MCP servers, and
// the record of the owner's answers. The prompt hook never runs it.
const toolCheckCommand = async (argv, { cwd, stdout, stderr }) => {
  const mod = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "tool-check.mjs")));
  const [action, ...rest] = argv;
  const usage = "Use: super-outer tool-check run [directory] [--need <generic words>]... [--publisher <github-owner>]... [--write] [--json] | shown <id>... [--dir <directory>] | answer <id>... <accepted|declined|later> [--dir <directory>] | trim <skills-search|skills-audit|mcp-registry|npm|pypi> [--publisher <name>]\n";
  if (!action || action === "--help" || action === "help" || rest.includes("--help") || rest.includes("-h")) {
    stdout.write(usage);
    return action ? 0 : 1;
  }
  const flags = { needs: [], publishers: [], write: false, json: false, dir: null, positional: [] };
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--need") flags.needs.push(rest[++index] ?? "");
    else if (rest[index] === "--publisher") flags.publishers.push(rest[++index] ?? "");
    else if (rest[index] === "--write") flags.write = true;
    else if (rest[index] === "--json") flags.json = true;
    else if (rest[index] === "--dir") flags.dir = rest[++index];
    else flags.positional.push(rest[index]);
  }
  if (action === "run") {
    const root = path.resolve(cwd, flags.dir ?? flags.positional[0] ?? ".");
    const fetcher = mod.createFetcher({ fixturesDir: process.env.SUPER_OUTER_TOOL_CHECK_FIXTURES || undefined, recordDir: process.env.SUPER_OUTER_TOOL_CHECK_RECORD || undefined });
    const result = await mod.runToolCheck({ root, needs: flags.needs, extraPublishers: flags.publishers, fetcher, ...(process.env.SUPER_OUTER_TOOL_CHECK_FIXTURES ? { treeCacheFile: null } : {}) });
    const { readToolCheck } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "stack-facts.mjs")));
    // Earlier answers are shown beside each item whether or not this run is written.
    const merged = mod.mergeRecord(readToolCheck(root), result);
    if (flags.write) {
      try {
        const file = mod.writeRecord(root, merged);
        stderr.write(`Recorded in ${path.relative(root, file)}\n`);
      } catch (error) {
        stderr.write(`${error.message}\n`);
        return 1;
      }
    }
    stdout.write(flags.json ? `${JSON.stringify(merged, null, 2)}\n` : `${mod.summarise(merged)}\n`);
    return 0;
  }
  if (action === "shown") {
    try {
      const done = mod.markShown(path.resolve(cwd, flags.dir ?? "."), flags.positional);
      stdout.write(`Marked as shown: ${done.join(", ")}\n`);
      return 0;
    } catch (error) {
      stderr.write(`${error.message}\n`);
      return 1;
    }
  }
  if (action === "answer") {
    const answer = flags.positional.at(-1);
    const ids = flags.positional.slice(0, -1);
    try {
      const done = mod.answerFinding(path.resolve(cwd, flags.dir ?? "."), ids, answer);
      stdout.write(`Recorded: ${done.ids.join(", ")} ${done.answer}\n`);
      return 0;
    } catch (error) {
      stderr.write(`${error.message}\n`);
      return 1;
    }
  }
  stderr.write(usage);
  return 1;
};

// The read-only inventory the engineering approach stage starts from.
const inventoryCommand = async (directory, cwd) => {
  const { inventory, summarise } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "inventory.mjs")));
  const result = await inventory(path.resolve(cwd, directory || "."));
  return { ...result, summary: summarise(result) };
};

// Lesson files checked against the shape in references/learning-loop.md. Read-only.
const lessonsCommand = async (action, directory, cwd) => {
  if (action !== "check") throw new Error(`Unknown lessons command: ${action || "missing"}`);
  const { checkLessonFiles } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "lessons.mjs")));
  return checkLessonFiles(path.resolve(cwd, directory || "."));
};

// Eval candidates collected from the owner's corrections. They live in the
// private data folder; `add` reads its fields from stdin, never from argv.
const evalsCommand = async (action, parsed, stdin) => {
  const candidates = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "eval-candidates.mjs")));
  if (action === "candidates") return candidates.listCandidates({ text: parsed.has("text") });
  if (action === "add") {
    if (!parsed.has("stdin")) throw new Error("evals add requires --stdin with a JSON object: asked, did, should, and kind (behaviour or routing)");
    const input = await readStreamJson(stdin);
    return candidates.addCandidate({ ...input, source: "agent" });
  }
  if (action === "mark") {
    const [, , id, status, caseName] = parsed.positionals;
    return candidates.markCandidate(id, status, caseName);
  }
  throw new Error(`Unknown evals command: ${action || "missing"}`);
};

// Which deferred parts are now due, by repository search and by supplied numbers.
const ledgerCommand = async (action, parsed, cwd) => {
  if (action !== "check") throw new Error(`Unknown ledger command: ${action || "missing"}`);
  const sequencing = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "sequencing.mjs")));
  const { defaultSearch } = await import(pathToFileURL(path.join(SOURCE_ROOT, "src", "archetypes.mjs")));
  let root;
  try { root = repositoryRoot(cwd, parsed.get("root")); } catch { root = path.resolve(cwd); }
  let metrics = null;
  const metricsFile = parsed.get("metrics");
  if (metricsFile !== undefined) {
    if (metricsFile === true) throw new Error("--metrics needs the path of a metrics file");
    const filename = path.resolve(cwd, metricsFile);
    let document;
    try { document = JSON.parse(fs.readFileSync(filename, "utf8")); } catch (error) {
      throw new Error(`The metrics file ${filename} cannot be read: ${error.message}`);
    }
    metrics = sequencing.parseMetrics(document);
  }
  const ledger = sequencing.loadLedgerForCheck(root);
  if (!ledger) {
    return { ledger: null, metrics_file: metricsFile ?? null, due: [], waiting: [], not_measured: [], cannot_check: [], summary: "There is no deferral ledger in this repository, so nothing is deferred." };
  }
  const result = sequencing.checkLedger(root, ledger, { search: defaultSearch, metrics });
  return { ledger: sequencing.LEDGER_PATH, metrics_file: metricsFile ?? null, measured_at: metrics?.measured_at ?? null, ...result };
};

export const runCli = async (argv = [], { cwd = process.cwd(), stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, ciEvidenceResolver = verifyGitHubActionsEvidence } = {}) => {
  if (argv[0] === "jev" && argv[1] === "ask") return jevAskCommand(argv.slice(2), { cwd, stdin, stdout });
  if (argv[0] === "tool-check" && argv[1] === "trim") return toolCheckTrimCommand(argv.slice(2), { stdin, stdout, stderr });
  if (argv[0] === "tool-check") return toolCheckCommand(argv.slice(1), { cwd, stdout, stderr });
  const parsed = parseArguments(argv);
  const [command, action] = parsed.positionals;
  try {
    let result;
    if (["install", "upgrade", "verify", "rollback"].includes(command)) result = await installCommand(command, parsed);
    else if (command === "route") result = await routeCommand(parsed, cwd, stdin);
    else if (command === "profile") result = await profileCommand(action, parsed, cwd);
    else if (command === "repo") result = await repoCommand(action, parsed, cwd, ciEvidenceResolver);
    else if (command === "task") result = await taskCommand(action, parsed, cwd, ciEvidenceResolver);
    else if (command === "package") result = await packageCommand(action, parsed);
    else if (command === "jev") result = await jevCommand(action);
    else if (command === "inventory") result = await inventoryCommand(action, cwd);
    else if (command === "ledger") result = await ledgerCommand(action, parsed, cwd);
    else if (command === "lessons") result = await lessonsCommand(action, parsed.positionals[2], cwd);
    else if (command === "evals") result = await evalsCommand(action, parsed, stdin);
    else if (command === "help" || !command) {
      stdout.write("Super-outer commands: route --input <file>|--stdin, install, upgrade, verify, rollback, profile create|refresh|validate, repo enable|verify|disable, task create|validate|attempt|completion|design|close, package build|verify, jev status|domains|ask --kind <slug> --options <a,b> (request on stdin), inventory [directory], ledger check [--metrics <file>], lessons check [directory], evals candidates [--text], evals add --stdin, evals mark <id> <drafted|dismissed> [case-name], tool-check run [directory] [--need <words>] [--publisher <owner>] [--write] [--json], tool-check shown <id>..., tool-check answer <id>... <accepted|declined|later>, tool-check trim <skills-search|skills-audit|mcp-registry|npm|pypi> (response on stdin), tool-check --help\n");
      return 0;
    } else throw new Error(`Unknown command: ${command}`);
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result?.valid === false || result?.stale === true) return 1;
    return 0;
  } catch (error) {
    stderr.write(error.hostEvidence
      ? `${JSON.stringify({ status: "BLOCKED", reason: error.message, host_evidence: error.hostEvidence }, null, 2)}\n`
      : `${error.message}\n`);
    return 1;
  }
};
