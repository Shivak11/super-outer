#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { approvalAllows, consumeApproval, issueApproval, recordUserTurn } from "../src/approval.mjs";
import { collectGitEvidence, describeDeliveryFailures, verifyDeliveryEvidence } from "../src/git-evidence.mjs";
import { typedText } from "../src/host-blocks.mjs";
import { namesNewKindOfSystem, readsAsFixOrTask, routeTask, startsNewWork } from "../src/router.mjs";
import { namesNewProduct } from "../src/change-shape.mjs";
import { taskCompletionReport } from "../src/completion-report.mjs";
import { completionContractDigest } from "../src/completion.mjs";
import { LEDGER_PATH, ledgerRouteLines, routeLedgerCheck } from "../src/sequencing.mjs";
import { readProjectFacts } from "../src/project-facts.mjs";
import { sessionStartLine } from "../src/session-start.mjs";
import { addCandidate } from "../src/eval-candidates.mjs";
import { loadArchetypes, SEARCH_TERMS_BUDGET_MS, searchTerms } from "../src/archetypes.mjs";
import {
  AFTER_JEV_RESERVE_MS, AFTER_SEARCH_RESERVE_MS, JEV_FLOOR_MS, SEARCH_FLOOR_MS, stepBudget,
} from "../src/hook-deadline.mjs";
import {
  asksToPlanOrBuild, buildsAgentProduct, checkMoments, detectAgentProduct, isPlanFile, journeyMapRecorded, MOMENT_SEARCH_LIMIT_MS, momentList,
  noteWork, productRecords, readWork, readsAsAddedScope, readsAsCorrection, readsAsRequirementChange, readsAsScopeChange, recordsDescribeAgent, repositoryOf,
  uncoveredMoments, walkRecorded,
} from "../src/work-under-way.mjs";

const readInput = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
};

const firstString = (...values) => values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
const findRoot = (cwd) => {
  let current = path.resolve(cwd || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd || process.cwd());
    current = parent;
  }
};

const readTask = (root) => {
  for (const filename of [
    path.join(root, ".engineering", "super-outer", "current-task.json"),
    path.join(root, ".engineering", "super-outer", "task.json")
  ]) {
    try { return JSON.parse(fs.readFileSync(filename, "utf8")); } catch {}
  }
  return null;
};

const userIdentity = () => {
  try { const info = os.userInfo(); return `${info.uid}:${info.username}`; }
  catch { return String(process.getuid?.() ?? "unknown-user"); }
};

const completionScopeDigest = (contract) => {
  try { return completionContractDigest(contract); }
  catch {
    // Invalid bookkeeping must remain visible without blocking ordinary tools.
    return `invalid-${createHash("sha256").update(JSON.stringify(contract)).digest("hex")}`;
  }
};

const resolveScope = (input, task, evidence) => ({
  client: firstString(process.env.SUPER_OUTER_CLIENT, input.client, input.client_name, process.env.CODEX_THREAD_ID ? "codex" : "", process.env.CLAUDE_SESSION_ID ? "claude" : "", "unknown-client"),
  user: firstString(process.env.SUPER_OUTER_USER, input.user, userIdentity()),
  session: firstString(process.env.SUPER_OUTER_SESSION_ID, input.session_id, input.sessionId, input.transcript_path, input.transcriptPath),
  repository: evidence.details.repositoryRoot,
  branch: evidence.branch,
  task: task.task_id,
  actions: task.allowed_actions,
  paths: task.allowed_paths,
  destinations: task.allowed_destinations?.length ? task.allowed_destinations : ["none"],
  environment: Array.isArray(task.environment) ? task.environment.join("+") : (task.environment || "none"),
  repositoryState: `${evidence.head}:${evidence.dirty}:${JSON.stringify(evidence.details.dirtyChanges)}${task.completion_contract ? `:${completionScopeDigest(task.completion_contract)}` : ""}`
});

const eventName = (input) => firstString(process.argv[2], input.hook_event_name, input.event_name, input.hookEventName);
const prompt = (input) => firstString(input.prompt, input.user_prompt, input.userPrompt, input.message?.text, typeof input.message === "string" ? input.message : "");
const assistantMessage = (input) => firstString(input.last_assistant_message, input.lastAssistantMessage);
const toolName = (input) => firstString(input.tool_name, input.toolName, input.tool, input.name);
const toolInput = (input) => input.tool_input || input.arguments || input.input || input.args || {};

const ANSI = {
  yellow: "\u001b[1;38;5;226m",
  orange: "\u001b[1;38;5;208m",
  red: "\u001b[1;31m",
  reset: "\u001b[0m"
};
/**
 * One emoji-led line per severity, not five rows of block letters.
 *
 * The ASCII art existed so the signal survived a terminal that strips colour.
 * An emoji survives that too, so this keeps the intent — legible without
 * colour — and drops the wall of text that made every routine bookkeeping
 * nudge look like an outage. A notice nobody reads protects nobody.
 */
const SEVERITY_MARKS = {
  CAUTION: { emoji: "💡", label: "Heads up" },
  BEWARE: { emoji: "⚠️", label: "Worth a look" },
  STOP: { emoji: "🛑", label: "Stopping here" }
};

// One colour per severity, so the line alone states how much attention is owed.
const SEVERITY_COLOURS = { CAUTION: "yellow", BEWARE: "orange", STOP: "red" };
// Most serious first, so a turn carrying several notices leads with the worst.
const SEVERITY_ORDER = ["STOP", "BEWARE", "CAUTION"];

const renderBanner = (name) => {
  const { emoji, label } = SEVERITY_MARKS[name];
  const line = `${emoji}  ${label}`;
  if (Object.hasOwn(process.env, "NO_COLOR")) return line;
  return `${ANSI[SEVERITY_COLOURS[name]]}${line}${ANSI.reset}`;
};
const severityBlock = (name, message) => `${renderBanner(name)} — ${message}`;
const warning = (message) => severityBlock("BEWARE", message);
const blocking = (message) => severityBlock("STOP", message);
// A notice is plain text (BEWARE, the default) or text tagged with its own
// severity. Bookkeeping nudges tag themselves CAUTION so a stale record never
// wears the same banner as a genuine risk.
const cautionNotice = (text) => (text ? { severity: "CAUTION", text } : "");
const withWarning = (value, ...notices) => {
  const grouped = new Map();
  for (const notice of notices.flat()) {
    if (!notice) continue;
    const severity = typeof notice === "string" ? "BEWARE" : notice.severity;
    const text = typeof notice === "string" ? notice : notice.text;
    if (!text) continue;
    grouped.set(severity, [...(grouped.get(severity) || []), text]);
  }
  if (grouped.size === 0) return value;
  const blocks = SEVERITY_ORDER
    .filter((severity) => grouped.has(severity))
    .map((severity) => severityBlock(severity, grouped.get(severity).join(" ")));
  return { ...value, systemMessage: [value.systemMessage, ...blocks].filter(Boolean).join("\n\n") };
};

const oncePerSessionWarning = (message, scope, ...identity) => {
  if (!message) return message;
  const key = createHash("sha256")
    .update(JSON.stringify([scope.session, scope.repository, ...identity]))
    .digest("hex");
  const stateRoot = process.env.SUPER_OUTER_STATE_DIR || path.join(os.tmpdir(), "super-outer-state");
  const directory = path.join(path.resolve(stateRoot), "warnings");
  const filename = path.join(directory, `${key}.shown`);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const descriptor = fs.openSync(filename, "wx", 0o600);
    fs.closeSync(descriptor);
    return message;
  } catch (error) {
    return error?.code === "EEXIST" ? "" : message;
  }
};

const deny = (reason, { critical = false } = {}) => {
  const rendered = critical ? blocking(reason) : warning(reason);
  return {
    decision: "block",
    reason: rendered,
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: rendered }
  };
};

const stop = (reason, { critical = false } = {}) => ({
  decision: "block",
  reason: critical ? blocking(reason) : warning(reason)
});

const shellHasControlSyntax = (command) => /[|;&><`$]|\x00|\r|\n/.test(command);

const shellWords = (command) => {
  const words = [];
  let word = "";
  let quote = "";
  let escaped = false;
  let started = false;
  for (const character of command) {
    if (escaped) { word += character; escaped = false; started = true; continue; }
    if (character === "\\" && quote !== "'") { escaped = true; started = true; continue; }
    if (quote) {
      if (character === quote) quote = "";
      else word += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; started = true; continue; }
    if (/[\[\]{}?*]/.test(character)) return null;
    if (/\s/.test(character)) {
      if (started) { words.push(word); word = ""; started = false; }
      continue;
    }
    word += character;
    started = true;
  }
  if (quote || escaped) return null;
  if (started) words.push(word);
  return words;
};

const readOnlyGit = (words) => {
  if (words[0] !== "git") return false;
  let commandIndex = 1;
  while (["-C", "--git-dir", "--work-tree"].includes(words[commandIndex]) && words[commandIndex + 1]) commandIndex += 2;
  while (/^--(?:git-dir|work-tree)=/.test(words[commandIndex] || "")) commandIndex += 1;
  const [subcommand, ...args] = words.slice(commandIndex);
  if (args.some((argument) => argument === "--output" || argument.startsWith("--output=") || ["--ext-diff", "--textconv"].includes(argument))) return false;
  if (["status", "log", "show", "rev-parse", "merge-base", "rev-list"].includes(subcommand)) return true;
  if (subcommand === "clean") {
    const shortFlags = args.filter((argument) => /^-[a-zA-Z]+$/.test(argument)).join("");
    return args.includes("--dry-run") || /n/i.test(shortFlags);
  }
  if (subcommand === "worktree") return args[0] === "list" && args.slice(1).every((argument) => ["--porcelain", "-z"].includes(argument));
  if (subcommand !== "branch") return false;
  if (!args.length) return true;
  if (args[0] === "--show-current") return args.length === 1;
  return ["--list", "-a", "-r"].includes(args[0]);
};

const readOnlyShell = (command) => {
  const value = String(command || "").trim();
  if (!value || shellHasControlSyntax(value)) return false;
  const words = shellWords(value);
  if (!words?.length) return false;
  if (["pwd", "ls", "stat", "cat", "head", "tail", "echo", "printf"].includes(words[0])) return true;
  if (words[0] === "find") {
    const mutating = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"]);
    return !words.some((word) => mutating.has(word));
  }
  if (words[0] === "sed") {
    const args = words.slice(1);
    return args.length >= 3 && args[0] === "-n" && /^[0-9]+(?:,[0-9$]+)?p$/.test(args[1]);
  }
  if (words[0] === "rg") return !words.some((word) => word === "--pre" || word.startsWith("--pre="));
  if (words[0] === "git" && words[1] === "diff") return readOnlyGit(["git", "show", ...words.slice(2)]);
  return readOnlyGit(words);
};

const patchPaths = (source) => [...String(source || "").matchAll(/^\*\*\*\s+(?:(?:Add|Update|Delete) File:|Move to:)\s+(.+)$/gm)].map((match) => match[1].trim());

const LOCAL_PATCH_TOOLS = new Set(["apply_patch", "applypatch"]);
const LOCAL_FILE_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "notebookedit",
  "notebook_edit",
  "editnotebook",
  "write_file",
  "edit_file",
  "strreplace",
  "searchreplace",
  "delete",
  "deletefile"
]);
const LOCAL_SHELL_TOOLS = new Set(["bash", "shell", "exec", "exec_command", "command"]);

const annotatedLocalRequest = (annotation, base) => {
  if (!annotation || typeof annotation !== "object") return base;
  if (base.unknown) return base;
  const action = firstString(annotation.action);
  const paths = Array.isArray(annotation.paths)
    ? annotation.paths.filter((candidate) => typeof candidate === "string" && candidate.trim())
    : [];
  const destinations = Array.isArray(annotation.destinations)
    ? annotation.destinations.filter((candidate) => typeof candidate === "string" && candidate.trim())
    : [];
  const environment = firstString(annotation.environment);
  if (!action || action !== base.action || !paths.length || !destinations.length || environment !== base.environment) {
    return { ...base, unknown: true };
  }
  return {
    ...base,
    paths: [...new Set([...base.paths, ...paths])],
    destinations: [...new Set([...base.destinations, ...destinations])]
  };
};

const annotatedShellRequest = (annotation) => {
  if (!annotation || typeof annotation !== "object") return null;
  const action = firstString(annotation.action);
  const paths = Array.isArray(annotation.paths)
    ? annotation.paths.filter((candidate) => typeof candidate === "string" && candidate.trim())
    : [];
  const destinations = Array.isArray(annotation.destinations)
    ? annotation.destinations.filter((candidate) => typeof candidate === "string" && candidate.trim())
    : [];
  const environment = firstString(annotation.environment);
  return {
    mutating: true,
    unknown: !action || !paths.length || !destinations.length || !environment,
    action,
    paths,
    destinations,
    environment
  };
};

const isLocalCheckCommand = (command) => {
  const value = String(command || "").trim();
  if (!value || shellHasControlSyntax(value)) return false;
  const words = shellWords(value);
  if (!words?.length) return false;
  const executable = path.basename(words[0]);
  const args = words.slice(1);
  if (["npm", "pnpm", "yarn"].includes(executable)) {
    if (args[0] === "test") return true;
    return args[0] === "run" && /^(?:test|lint|check|verify|type-?check|build|format)(?::[a-z0-9_.-]+)?$/i.test(args[1] || "");
  }
  if (executable === "node") {
    return (args[0] === "--test" || args[0]?.startsWith("--test="))
      && !args.some((argument) => ["-e", "--eval", "-p", "--print"].includes(argument));
  }
  if (/^python(?:3(?:\.\d+)*)?$/.test(executable)) {
    return args[0] === "-m" && ["pytest", "unittest"].includes(args[1]);
  }
  return false;
};

const wrappedShellCommand = (command) => {
  const match = String(command || "").trim().match(/^(?:sh|bash|zsh)\s+-c\s+(["'])([\s\S]*)\1$/i);
  return match?.[2] || "";
};

const readOnlyPipeline = (command) => {
  const value = String(command || "").trim();
  if (!value.includes("|") || /[;&><`$]|\x00|\r|\n/.test(value)) return false;
  const segments = value.split("|").map((segment) => segment.trim());
  return segments.length > 1 && segments.every((segment) => segment && readOnlyShell(segment));
};

const readOnlySegment = (command) => readOnlyShell(command) || readOnlyPipeline(command);

const readOnlySequence = (command) => {
  const value = String(command || "").trim();
  if (!value.includes(";") || /[&><`$]|\x00|\r|\n/.test(value)) return false;
  const segments = value.split(";").map((segment) => segment.trim());
  return segments.length > 1 && segments.every((segment) => segment && readOnlySegment(segment));
};

const harmlessShellCommand = (command) => {
  if (readOnlySegment(command) || readOnlySequence(command)) return true;
  const wrapped = wrappedShellCommand(command);
  return Boolean(wrapped && (readOnlySegment(wrapped) || readOnlySequence(wrapped)));
};

const irreversibleRecursiveDeletion = (command) => {
  const value = String(command || "");
  const pattern = /\brm\s+((?:(?:-[a-zA-Z]+|--[a-zA-Z][a-zA-Z0-9-]*(?:=[^\s;&|]+)?)\s+)+)(?:--\s+)?(["']?)(?:\/(?:\*)?|~(?:\/(?:\*)?)?|\$HOME(?:\/(?:\*)?)?|\$\{HOME\}(?:\/(?:\*)?)?|\.{1,2}(?:\/(?:\*)?)?|(?:\.\/)?\.\*|(?:(?:\/|\.{1,2}\/)?(?:[^/\s;&|]+\/)*)?\.git(?:[?*][^/\s;&|]*)?(?:\/[^\s;&|]+)*)\2(?=\s|[;&|]|$)/gi;
  for (const match of value.matchAll(pattern)) {
    const options = match[1].trim().split(/\s+/);
    const shortFlags = options.filter((option) => /^-[a-zA-Z]+$/.test(option)).join("");
    const recursive = options.includes("--recursive") || /r/i.test(shortFlags);
    const forced = options.includes("--force") || /f/i.test(shortFlags);
    if (recursive && forced) return true;
  }
  return false;
};

const destructiveGitOperation = (command) => {
  const value = String(command || "");
  const prefix = "\\bgit\\s+(?:(?:(?:-C|--git-dir|--work-tree)\\s+(?:[\"'][^\"']*[\"']|[^\\s;&|]+)|--(?:git-dir|work-tree)=[^\\s;&|]+)\\s+)*";
  if (new RegExp(`${prefix}reset\\s+--hard\\b`, "i").test(value)) return true;
  if (new RegExp(`${prefix}branch\\s+-D\\s+(?:main|master|production|prod|release)\\b`, "i").test(value)) return true;
  const protectedPush = new RegExp(`${prefix}push\\b([^\\n;&|]*)`, "gi");
  for (const match of value.matchAll(protectedPush)) {
    const args = match[1];
    const rewritesHistory = /--force(?:-with-lease)?\b|--delete\b|(?:^|\s):\S+/.test(args);
    const protectedTarget = /(?:^|[\s/:])(?:main|master|production|prod|release)(?:$|\s)/i.test(args);
    if (rewritesHistory && protectedTarget) return true;
  }
  const cleanInvocation = /\bgit\s+(?:(?:(?:-C|--git-dir|--work-tree)\s+(?:["'][^"']*["']|[^\s;&|]+)|--(?:git-dir|work-tree)=[^\s;&|]+)\s+)*clean\b([^;&|\n]*)/gi;
  for (const match of value.matchAll(cleanInvocation)) {
    const args = match[1].trim().split(/\s+/).filter(Boolean);
    const shortFlags = args.filter((argument) => /^-[a-zA-Z]+$/.test(argument)).join("");
    const dryRun = args.includes("--dry-run") || /n/i.test(shortFlags);
    const forced = args.includes("--force") || /f/i.test(shortFlags);
    const broad = /[dx]/i.test(shortFlags);
    if (!dryRun && forced && broad) return true;
  }
  return false;
};

const criticalShellReason = (command) => {
  const value = String(command || "").trim();
  if (!value) return "";
  if (destructiveGitOperation(value)) return "a destructive repository operation";
  if (irreversibleRecursiveDeletion(value)) return "an irreversible recursive deletion";
  const explicitlyProduction = /\bprod(?:uction)?\b/i.test(value);
  const destructiveCloud = /\baws\s+(?:rds\s+delete-db-instance|dynamodb\s+delete-table|secretsmanager\s+delete-secret|iam\s+delete-\S+)\b/i.test(value);
  const protectedKubernetes = /\bkubectl\b[^\n;&|]*\bdelete\s+(?:secret|clusterrole|clusterrolebinding|role|rolebinding)\b/i.test(value);
  const protectedSqlData = /\b(?:drop\s+(?:database|schema|table)|truncate\s+table)\s+(?:if\s+exists\s+)?(?:["'`]?)(?:customer|user|private|personal|company|payment|production|prod|pii|phi)[a-z0-9_.-]*/i.test(value);
  const productionInfrastructure = explicitlyProduction && /\b(?:terraform\s+destroy|kubectl\b[^\n;&|]*\bdelete\s+(?:namespace|persistentvolume|persistentvolumeclaim)|(?:drop\s+(?:database|schema|table)|truncate\s+table))\b/i.test(value);
  if (destructiveCloud || protectedKubernetes || protectedSqlData || productionInfrastructure) return "a destructive protected infrastructure, secret, or data operation";
  if (/\b(?:npm\s+publish|gh\s+release\s+create|(?:deploy|release|publish|promote|migrate)(?:ctl)?\b.*\bprod(?:uction)?\b)\b/i.test(value)) return "a production publish, deployment, release, promotion, or migration";
  if (/\b(?:aws\s+iam\s+(?:create|delete|update|attach|detach|put|remove|add|change|reset|set|tag|untag)\S*|aws\s+secretsmanager\s+(?:create|delete|put|update|rotate|cancel)\S*|gcloud\s+\S*(?:iam|secrets)\S*\s+(?:add|remove|set|create|delete|destroy|disable|enable)|az\s+(?:role|keyvault)\s+(?:create|delete|update|set|remove))\b/i.test(value)) return "an identity, permission, or secrets change";
  return "";
};

const opaqueShellReason = (command) => {
  const value = String(command || "").trim();
  if (/(?:^|[|;&]\s*)eval\b/i.test(value)) return "opaque dynamic shell execution";
  if (/^(?:sh|bash|zsh)\s+-c\b/i.test(value)) return "opaque dynamic shell execution";
  if (shellHasControlSyntax(value)) return "an opaque shell command using pipeline or control syntax";
  return "";
};

const isAlwaysCriticalAction = (action) => {
  const value = String(action || "").trim().toLowerCase().replaceAll("_", "-").replace(/-+/g, "-");
  const parts = new Set(value.split("-").filter(Boolean));
  const hasAny = (...names) => names.some((name) => parts.has(name));
  const destructiveData = hasAny("delete", "destroy", "erase", "wipe", "export", "expose", "publish", "share", "send", "transfer", "upload", "post", "disclose")
    && parts.has("data")
    && hasAny("private", "personal", "customer", "user", "company", "production", "pii", "phi");
  const authorityChange = hasAny("change", "update", "rotate", "revoke", "grant", "delete", "disable", "enable", "set")
    && hasAny("iam", "identity", "permission", "permissions", "access", "role", "roles", "secret", "secrets", "credential", "credentials", "key", "keys", "payment", "payments", "privacy", "security");
  const consequentialOutbound = hasAny("charge", "refund")
    || (parts.has("transfer") && hasAny("payment", "payments", "fund", "funds", "money", "external", "customer", "user", "private", "personal", "company", "production", "data"))
    || (hasAny("send", "publish", "post", "dispatch", "deliver") && hasAny("email", "message", "webhook", "notification"))
    || (parts.has("external") && parts.has("transaction"));
  const protectionDefeat = hasAny("disable", "bypass", "delete") && hasAny("rollback", "audit", "protection", "protected");
  return destructiveData || authorityChange || consequentialOutbound || protectionDefeat;
};
const PRODUCTION_ACTION = /(?:^|[-_])(?:delete|destroy|drop|truncate|erase|wipe|deploy|release|publish|promote|migrate|migration)(?:$|[-_])/i;
const productionTarget = (request = {}) => /\bprod(?:uction)?\b/i.test(`${String(request.action || "").replaceAll("_", "-")} ${request.environment || ""} ${(request.destinations || []).join(" ")}`);
const isExtremelyCritical = (request = {}) => Boolean(
  request.criticalReason
  || isAlwaysCriticalAction(request.action)
  || (PRODUCTION_ACTION.test(String(request.action || "")) && productionTarget(request))
);

const criticalCategory = (request = {}) => {
  const action = String(request.action || "").toLowerCase().replaceAll("_", "-");
  if (PRODUCTION_ACTION.test(action) && productionTarget(request)) return "production";
  if (/(?:delete|destroy|drop|truncate|erase|wipe|export|expose|publish|share|send|transfer|upload|post|disclose).*(?:private|personal|customer|user|company|production|pii|phi).*data|(?:private|personal|customer|user|company|production|pii|phi).*data.*(?:delete|destroy|drop|truncate|erase|wipe|export|expose|publish|share|send|transfer|upload|post|disclose)/.test(action)) return "data";
  if (/(?:iam|identity|permission|access|role|secret|credential|payment|privacy|security|key)/.test(action)) return "authority";
  if (/(?:send|publish|post|dispatch|deliver|charge|refund|transaction|transfer)/.test(action)) return "external";
  if (/(?:rollback|audit|protection|protected|history)/.test(action)) return "protection";
  return "";
};

const actionParts = (action) => new Set(String(action || "").toLowerCase().replaceAll("_", "-").split("-").filter(Boolean));

const criticalShellOperation = (command, criticalReason) => {
  const value = String(command || "").toLowerCase();
  if (criticalReason === "an irreversible recursive deletion") return ["delete"];
  if (criticalReason === "a destructive repository operation") {
    if (/\bgit\b.*\breset\s+--hard\b/.test(value)) return ["reset", "history"];
    if (/\bgit\b.*\bbranch\s+-d\b/i.test(value)) return ["delete", "branch"];
    if (/\bgit\b.*\bpush\b/.test(value)) return ["rewrite", "history"];
    return ["delete", "files"];
  }
  if (criticalReason === "a destructive protected infrastructure, secret, or data operation") {
    const kubernetes = value.match(/\bkubectl\b[^\n;&|]*\bdelete\s+(namespace|secret|persistentvolumeclaim|persistentvolume|clusterrolebinding|clusterrole|rolebinding|role)\b/);
    if (kubernetes) return ["delete", kubernetes[1]];
    if (/\bterraform\s+destroy\b/.test(value)) return ["destroy", "infrastructure"];
    if (/\baws\s+rds\s+delete-db-instance\b/.test(value)) return ["delete", "database"];
    if (/\baws\s+dynamodb\s+delete-table\b/.test(value)) return ["delete", "table"];
    if (/\baws\s+secretsmanager\s+delete-secret\b/.test(value)) return ["delete", "secret"];
    if (/\baws\s+iam\s+delete-/.test(value)) return ["delete", "identity"];
    const sql = value.match(/\b(drop|truncate)\s+(database|schema|table)\b/);
    return sql ? [sql[1], sql[2]] : [];
  }
  if (criticalReason === "a production publish, deployment, release, promotion, or migration") {
    if (/\bnpm\s+publish\b/.test(value)) return ["publish", "package"];
    if (/\bgh\s+release\s+create\b/.test(value)) return ["release"];
    const operation = value.match(/\b(deploy|release|publish|promote|migrate)(?:ctl)?\b/);
    return operation ? [operation[1]] : [];
  }
  if (criticalReason === "an identity, permission, or secrets change") {
    const operation = value.match(/\b(create|delete|update|attach|detach|put|remove|add|change|reset|set|tag|untag|rotate|cancel|destroy|disable|enable)\w*\b/);
    const domain = value.match(/\b(iam|identity|permission|role|secret|credential|keyvault|key)\w*\b/);
    return [operation?.[1], domain?.[1]].filter(Boolean);
  }
  return [];
};

const criticalShellTargets = (command, criticalReason) => {
  const words = shellWords(String(command || ""));
  if (!words?.length) return [];
  const lowered = words.map((word) => word.toLowerCase());
  const kubectlDelete = path.basename(lowered[0] || "") === "kubectl" ? lowered.indexOf("delete") : -1;
  if (kubectlDelete >= 0 && words[kubectlDelete + 2]) return [words[kubectlDelete + 2]];
  const sqlOperation = lowered.findIndex((word) => word === "drop" || word === "truncate");
  if (sqlOperation >= 0 && words[sqlOperation + 2]) {
    let targetIndex = sqlOperation + 2;
    if (lowered[targetIndex] === "if" && lowered[targetIndex + 1] === "exists") targetIndex += 2;
    return words[targetIndex] ? [words[targetIndex].replace(/^["'`]|["'`;]$/g, "")] : [];
  }
  for (const option of ["--db-instance-identifier", "--table-name", "--secret-id"]) {
    const optionIndex = lowered.indexOf(option);
    if (optionIndex >= 0 && words[optionIndex + 1]) return [words[optionIndex + 1]];
  }
  if (criticalReason === "a production publish, deployment, release, promotion, or migration") {
    if (lowered[0] === "npm" && lowered[1] === "publish") {
      const packageTarget = words.slice(2).find((word) => !word.startsWith("-"));
      return [packageTarget || "."];
    }
    if (lowered[0] === "gh" && lowered[1] === "release" && lowered[2] === "create") {
      const optionsWithValues = new Set(["--repo", "-R", "--notes", "--notes-file", "--title", "--target", "--discussion-category"]);
      for (let index = 3; index < words.length; index += 1) {
        const word = words[index];
        if (optionsWithValues.has(word)) { index += 1; continue; }
        if (word.startsWith("-")) continue;
        return [word];
      }
      return [];
    }
    const namedTarget = words.slice(1).map((word) => word.match(/^--(?:service|target|app|application|project)=([^\s]+)$/i)?.[1]).find(Boolean);
    if (namedTarget) return [namedTarget];
    const candidates = words.slice(1).filter((word) => {
      const value = word.toLowerCase();
      return !word.startsWith("-")
        && !/^(?:prod|production)$/.test(value)
        && !/^(?:deploy|deployctl|release|releasectl|publish|publishctl|promote|promotectl|migrate|migratectl)$/.test(value);
    });
    return candidates.slice(0, 1);
  }
  return [];
};

const recursiveDeletionTargets = (command) => {
  const value = String(command || "");
  const targets = [];
  const pattern = /\brm\s+(?:(?:-[a-zA-Z]+|--[a-zA-Z][a-zA-Z0-9-]*(?:=[^\s;&|]+)?)\s+)+(?:--\s+)?([^\s;&|]+)/gi;
  for (const match of value.matchAll(pattern)) targets.push(match[1].replace(/^["']|["']$/g, ""));
  return targets;
};

const criticalShellAnnotationCompatible = (request, command, criticalReason) => {
  if (!request || request.unknown || !isExtremelyCritical(request)) return false;
  const requiredOperation = criticalShellOperation(command, criticalReason);
  const declaredOperation = actionParts(request.action);
  if (!requiredOperation.length || !requiredOperation.every((part) => declaredOperation.has(part))) return false;
  if (criticalReason === "an irreversible recursive deletion") {
    const targets = recursiveDeletionTargets(command);
    return targets.length > 0 && targets.every((target) => request.paths.includes(target));
  }
  if (criticalReason === "a destructive repository operation") {
    return criticalCategory(request) === "protection" && request.paths.some((target) => target === "." || /\.git(?:\/|$)/.test(target));
  }
  const actualTargets = criticalShellTargets(command, criticalReason);
  if (actualTargets.some((target) => !request.paths.includes(target) && !request.destinations.includes(target))) return false;
  if (criticalReason === "a destructive protected infrastructure, secret, or data operation") {
    const commandTargetsProduction = /\bprod(?:uction)?\b/i.test(String(command || ""));
    return (!commandTargetsProduction || productionTarget(request)) && ["production", "data", "authority"].includes(criticalCategory(request));
  }
  if (criticalReason === "a production publish, deployment, release, promotion, or migration") {
    return productionTarget(request) && criticalCategory(request) === "production";
  }
  if (criticalReason === "an identity, permission, or secrets change") return criticalCategory(request) === "authority";
  return false;
};

const stringsFrom = (...values) => values.flatMap((value) => Array.isArray(value) ? value : [value])
  .filter((value) => typeof value === "string" && value.trim())
  .map((value) => value.trim());

const inferredToolRequest = (name, args) => {
  const toolAction = name.replaceAll("__", "-").replaceAll("_", "-") || "external-write";
  const explicitAction = firstString(args.action, args.operation, args.intent).replaceAll("_", "-");
  const subject = firstString(args.data_type, args.dataType, args.resource, args.object, args.kind).replaceAll("_", "-");
  const action = [toolAction, explicitAction, subject].filter(Boolean).join("-");
  const paths = stringsFrom(args.path, args.file_path, args.file, args.filename, args.paths);
  const destinations = stringsFrom(args.destination, args.destinations, args.target, args.repository, args.repo, args.url, args.endpoint, args.channel, args.recipient);
  const environment = firstString(args.environment, args.env, args.stage, "unknown");
  const request = { mutating: true, unknown: !paths.length || !destinations.length || environment === "unknown", action, paths, destinations, environment };
  return isExtremelyCritical(request)
    ? { ...request, criticalReason: "a protected data, authority, financial, production, or consequential external action" }
    : request;
};

const taskIsExtremelyCritical = (task) => String(task.mode || "").toUpperCase() === "CRITICAL"
  || (task.allowed_actions || []).some((action) => isAlwaysCriticalAction(action))
  || (/\bprod(?:uction)?\b/i.test(Array.isArray(task.environment) ? task.environment.join(" ") : String(task.environment || ""))
    && (task.allowed_actions || []).some((action) => PRODUCTION_ACTION.test(String(action))));

const textClaimsProductionDelivery = (message) => String(message || "")
  .replace(/\b(was|were|is|are|has|have|had)n['’]t\b/gi, "$1 not")
  .split(/[.!?\n]+/)
  .flatMap((sentence) => sentence.split(/\s*(?:;|\bbut\b|\bhowever\b|\balthough\b|\bwhereas\b)\s*/i))
  .some((clause) => {
    const positive = /\b(?:deployed|released|published|promoted|migrated|delivered)\s+(?:to|into|in)\s+production\b/i.test(clause)
      || /\bproduction\s+(?:deployment|release|publication|promotion|migration)\s+(?:is\s+)?(?:complete|completed|successful|succeeded|done|live)\b/i.test(clause)
      || /\b(?:app|service|site|system|release|version|build|it|this)\s+(?:is|are)\s+live\s+(?:in|on)\s+production\b/i.test(clause);
    if (!positive) return false;
    const modifiers = "(?:(?:yet|actually|successfully|fully|ever|currently)\\s+)*";
    const deliveryVerb = "(?:deployed|released|published|promoted|migrated|delivered)";
    const optionalBeen = `(?:been\\s+${modifiers})?`;
    const negated = new RegExp(`\\b(?:not|never)\\s+${modifiers}${optionalBeen}${deliveryVerb}\\s+(?:to|into|in)\\s+production\\b`, "i").test(clause)
      || new RegExp(`\\b(?:was|were|is|are|has|have|had)\\s+not\\s+${modifiers}${optionalBeen}${deliveryVerb}\\s+(?:to|into|in)\\s+production\\b`, "i").test(clause)
      || /\bno\s+production\s+(?:deployment|release|publication|promotion|migration)\b/i.test(clause)
      || /\b(?:not|never)\s+(?:currently\s+)?live\s+(?:in|on)\s+production\b/i.test(clause)
      || /\b(?:is|are|was|were)\s+not\s+(?:currently\s+)?live\s+(?:in|on)\s+production\b/i.test(clause);
    return !negated;
  });

const explicitProductionDeliveryClaim = (input) => input.production_delivery_claim === true
  || input.productionDeliveryClaim === true
  || textClaimsProductionDelivery(assistantMessage(input));

const independentReviewPassed = (task, evidence) => task.independent_review?.enforcement === "REQUIRED"
  && task.independent_review?.review_status === "PROVED"
  && task.independent_review?.independent_verdict === "PASS"
  && task.independent_review?.exact_task === true
  && task.independent_review?.exact_head === true
  && task.evidence_binding?.source?.head === evidence.head;

const independentReviewWarning = (task) => {
  const review = task.independent_review;
  if (!review) {
    return String(task.mode || "").toUpperCase() === "FULL" && task.status === "PROVED"
      ? "A separate review is not recorded. This is advisory for ordinary work and remains visible; it is not production proof."
      : "";
  }
  if (review.review_status === "PROVED" && review.independent_verdict === "PASS") return "";
  let state = "is incomplete";
  if (!review.provided || review.review_status === "NOT RUN") state = "was not run";
  else if (review.review_status === "BLOCKED") state = "could not be completed";
  else if (review.independent_verdict === "FAIL") state = "finished but did not pass";
  return `The separate review ${state}. This is advisory for ordinary work and remains visible; it is not production proof.`;
};

const deliveryEvidenceWithoutLocalTaskState = (evidence) => {
  const dirtyChanges = evidence?.details?.dirtyChanges || [];
  const taskStateOnly = dirtyChanges.length > 0 && dirtyChanges.every(({ path: changedPath }) =>
    /^\.engineering\/super-outer\/(?:current-task\.json|tasks\/[^/]+\.json)$/.test(String(changedPath || ""))
  );
  return taskStateOnly ? { ...evidence, dirty: false } : evidence;
};

const ordinaryScopeReason = (failures = []) => {
  const messages = {
    "action-outside-scope": "This operation is not one of the recorded actions.",
    "path-outside-repository": "This operation targets a path outside the repository.",
    "path-outside-scope": "This operation targets a path outside the recorded paths.",
    "destination-outside-scope": "This operation targets a destination that was not recorded.",
    "environment-outside-scope": "This operation targets a different environment from the one recorded."
  };
  return [...new Set(failures)].map((failure) => messages[failure] || "This operation falls outside the approved scope.").join(" ");
};

const ordinaryApprovalReason = (error) => {
  const message = String(error?.message || error || "");
  if (/already been used/i.test(message)) return "That approval has already authorised one operation. Review the remaining work and approve it again.";
  if (/already being consumed/i.test(message)) return "Another operation is using this approval. This operation was stopped so that approval cannot be used twice.";
  if (/expired/i.test(message)) return "The approval expired. Review the current scope and approve it again.";
  if (/invalidated|scope drifted|scope changed/i.test(message)) return "The earlier approval is no longer valid because the task scope or conversation changed. Review the current scope and approve it again.";
  if (/not pending/i.test(message)) return "This phrase is not confirming the currently pending approval. Review the current scope and request a fresh phrase.";
  if (/not confirmed|No approval envelope|MISSING_OR_INVALID/i.test(message)) return "This operation needs a confirmed approval phrase before it can run.";
  if (/did not match/i.test(message)) return "The phrase did not match the pending approval. Review the current scope and request a fresh phrase.";
  return "The approval could not be verified safely. Review the current scope and approve it again.";
};

const mutationRequest = (input) => {
  const name = toolName(input).toLowerCase();
  const args = toolInput(input);
  const annotation = args.super_outer_scope || input.super_outer_scope;
  if (/^(?:read|read_file|glob|grep|search|web|web_search|view|view_image|list|list_files|find|skill|load_skill|toolsearch|tool_search|video|viewvideo|view_video|analysevideo|analyse_video|analyzevideo|analyze_video)$/.test(name)) return { mutating: false };
  if (LOCAL_PATCH_TOOLS.has(name)) {
    const source = firstString(args.command, args.patch, args.input, args.source, args.code);
    const paths = patchPaths(source);
    const base = paths.length
      ? { mutating: true, action: "edit-files", paths, destinations: ["none"], environment: "local" }
      : { mutating: true, unknown: true, action: "edit-files", paths: [], destinations: ["none"], environment: "local" };
    return annotatedLocalRequest(annotation, base);
  }
  if (LOCAL_FILE_TOOLS.has(name)) {
    const target = firstString(args.file_path, args.path, args.filename);
    const base = target
      ? { mutating: true, action: "edit-files", paths: [target], destinations: ["none"], environment: "local" }
      : { mutating: true, unknown: true, action: "edit-files", paths: [], destinations: ["none"], environment: "local" };
    return annotatedLocalRequest(annotation, base);
  }
  if (LOCAL_SHELL_TOOLS.has(name)) {
    const command = firstString(args.command, args.cmd, args.script);
    if (harmlessShellCommand(command)) return { mutating: false };
    const criticalReason = criticalShellReason(command);
    if (criticalReason) {
      const annotated = annotatedShellRequest(annotation);
      const exactCriticalAnnotation = criticalShellAnnotationCompatible(annotated, command, criticalReason);
      return exactCriticalAnnotation
        ? { ...annotated, criticalReason }
        : { ...(annotated || { mutating: true, action: "shell-write", paths: [], destinations: [], environment: "unknown" }), unknown: true, criticalReason };
    }
    const opaqueReason = opaqueShellReason(command);
    if (opaqueReason) {
      return { mutating: true, unknown: true, action: "shell-write", paths: [], destinations: [], environment: "unknown", opaqueReason };
    }
    if (isLocalCheckCommand(command)) {
      return annotatedLocalRequest(annotation, { mutating: true, action: "run-tests", paths: ["."], destinations: ["none"], environment: "local" });
    }
    const annotated = annotatedShellRequest(annotation);
    if (annotated) return annotated;
    return { mutating: true, unknown: true, action: "shell-write", paths: [], destinations: [] };
  }
  const annotated = annotatedShellRequest(annotation);
  const inferred = inferredToolRequest(name, args);
  if (isExtremelyCritical(inferred)) {
    const compatibleAnnotation = annotated && !annotated.unknown && isExtremelyCritical(annotated)
      && criticalCategory(annotated) === criticalCategory(inferred)
      && inferred.paths.every((target) => annotated.paths.includes(target))
      && inferred.destinations.every((target) => annotated.destinations.includes(target))
      && (inferred.environment === "unknown" || annotated.environment === inferred.environment);
    return compatibleAnnotation ? { ...annotated, criticalReason: inferred.criticalReason } : { ...inferred, unknown: true };
  }
  return annotated || inferred;
};

let activeProbeEvent = "unknown";
// `details` carries bounded facts only, such as which reader decided the
// design line. A probe line never holds the prompt or the key.
const recordProbe = (phase, details = {}) => {
  if (!process.env.SUPER_OUTER_HOOK_PROBE_FILE) return;
  try {
    const probeFile = path.resolve(process.env.SUPER_OUTER_HOOK_PROBE_FILE);
    fs.mkdirSync(path.dirname(probeFile), { recursive: true, mode: 0o700 });
    fs.appendFileSync(probeFile, `${JSON.stringify({
      event: activeProbeEvent,
      client: process.env.SUPER_OUTER_CLIENT || "unknown",
      activation_id: process.env.SUPER_OUTER_ACTIVATION_ID || "unknown",
      source_digest: process.env.SUPER_OUTER_SOURCE_DIGEST || "unknown",
      version: process.env.SUPER_OUTER_VERSION || "unknown",
      phase,
      // When the line was written, and how long after the process launched,
      // so a probe can tell a slow start from slow work.
      at: Date.now(),
      launched_at: Math.round(performance.timeOrigin),
      since_launch_ms: Math.round(performance.now()),
      ...details
    })}\n`, { mode: 0o600 });
  } catch {}
};
const output = (value = {}) => {
  process.stdout.write(JSON.stringify(value));
  recordProbe("completed");
};
const input = await readInput();
const event = eventName(input);
activeProbeEvent = event || "unknown";
recordProbe("started");

/**
 * One owner per Cursor event.
 *
 * Cursor runs the hooks of Claude Code's enabled plugins by default, so with
 * Super-outer in both hosts this hook ran twice for every Cursor prompt, tool
 * call and stop: once through the Cursor bridge and once as the Claude Code
 * plugin. Cursor lets a refusal from either copy win. The Claude Code copy
 * keeps its approvals under another client name and, without the bridge's
 * help, never sees the assistant's text, so it refused every extremely
 * critical action the person had approved through the bridge.
 *
 * The bridge owns every Cursor event, because only it has the assistant's
 * text, the project folder and the Cursor client name. The Claude Code copy
 * returns nothing when Cursor's own settings run the bridge for the same
 * event. A bridge from before 5.10.1 sent the route in a field Cursor ignores
 * on a prompt, so with such a bridge the Claude Code copy still routes prompts
 * and leaves tool calls and stops to the bridge. Without the bridge, the
 * Claude Code copy is the only copy and keeps every event. Only the user-level
 * Cursor settings, where `npm run install:cursor` puts the bridge, are read.
 */
const CURSOR_EVENTS = { UserPromptSubmit: "beforeSubmitPrompt", PreToolUse: "preToolUse", Stop: "stop" };
const cursorBridgeOwnsEvent = () => {
  const cursorEvent = CURSOR_EVENTS[event];
  if (!cursorEvent || !firstString(input.cursor_version)) return false;
  if ([process.env.SUPER_OUTER_CLIENT, input.client, input.client_name].some((name) => String(name || "").toLowerCase() === "cursor")) return false;
  try {
    const cursorDir = path.join(firstString(process.env.SUPER_OUTER_INSTALL_HOME) || os.homedir(), ".cursor");
    const entries = JSON.parse(fs.readFileSync(path.join(cursorDir, "hooks.json"), "utf8"))?.hooks?.[cursorEvent];
    if (!Array.isArray(entries) || !entries.some((entry) => String(entry?.command || "").includes("super-outer-bridge.mjs"))) return false;
    const bridge = fs.readFileSync(path.join(cursorDir, "hooks", "super-outer-bridge.mjs"), "utf8");
    return event !== "UserPromptSubmit" || bridge.includes("additional_context");
  } catch {
    return false;
  }
};
if (cursorBridgeOwnsEvent()) {
  recordProbe("left_to_cursor_bridge");
  output({});
  process.exit(0);
}

// Cursor sends no cwd with a prompt or a stop, and starts a Claude Code
// plugin's hook in the plugin's own folder, so on a prompt its workspace root
// names the project. Stop keeps the old folder: there, a failed evidence check
// returns a block, Cursor turns a block into a follow-up message, and it sets
// no limit on follow-ups from Claude Code hooks.
const cwd = firstString(
  input.cwd,
  input.working_directory,
  input.project_dir,
  event === "UserPromptSubmit" && Array.isArray(input.workspace_roots) ? input.workspace_roots[0] : "",
  process.cwd()
);
const root = findRoot(cwd);
const task = readTask(root);

/**
 * From 6.0. SessionStart prints at most one line, only when a measured ledger
 * trigger fired or the metrics snapshot is stale, and from 6.3 when the tool
 * check is missing, unanswered or stale (src/session-start.mjs).
 * PostToolBatch (Claude Code) and PostToolUse (Codex) hand a one-line summary
 * of the tool call to the manual-work detector and print nothing. Claude Code
 * also fires PostToolUse; there it is skipped so a call is recorded once.
 */
if (event === "SessionStart") {
  const line = sessionStartLine(root);
  if (line) output({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: line } });
  else recordProbe("completed");
  process.exit(0);
}
if (event === "PostToolBatch" || event === "PostToolUse") {
  const isCodex = String(process.env.SUPER_OUTER_CLIENT || "").toLowerCase() === "codex" || Boolean(process.env.CODEX_THREAD_ID);
  if (event === "PostToolBatch" || isCodex) {
    try {
      const { recordCandidate } = await import("../src/suggestions.mjs");
      const calls = Array.isArray(input.tool_calls) ? input.tool_calls : [{ tool_name: input.tool_name, tool_input: input.tool_input }];
      for (const call of calls) {
        const toolName = firstString(call?.tool_name, call?.name);
        if (!toolName) continue;
        const toolInput = call?.tool_input ?? call?.input ?? {};
        const summary = String(firstString(toolInput.command, toolInput.description, toolInput.file_path, toolInput.query) || "").slice(0, 200);
        await recordCandidate({ root, toolName, summary });
      }
    } catch {}
  }
  recordProbe("completed");
  process.exit(0);
}

// The design path is named when the product UI specialist is selected and the
// change shape is a new feature, an overhaul, a replacement or a coordinated
// change across systems. The line is worded as a possibility because a request
// phrased as a new feature can still be a small visual correction, such as
// "Add padding to the settings screen", which needs only a before and after
// render. Whether a full design package is required is recorded in the task
// record by the assistant after reading the request and the repository.
const DESIGN_PATH_SHAPES = new Set(["new_feature", "major_overhaul", "replacement", "coordinated_cross_system_change"]);
/**
 * From 5.19 every file the route names is an absolute path in the installed
 * skill, built from this hook's own location, and the route names the skill to
 * use. A path such as "skills/super-outer/references/story-walk.md" resolved
 * only inside this repository, never in the owner's project. The lines are
 * written as statements of what the route includes, as Claude Code's hook
 * guidance asks of added context, and the procedures stay in the skill.
 */
const SKILL_DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "skills", "super-outer");
const ref = (name) => path.join(SKILL_DIR, "references", name);
// Cursor installs the skill on its own, outside a plugin, so it has no
// plugin prefix there.
const SKILL_NAME = process.env.SUPER_OUTER_CLIENT === "cursor" ? "super-outer" : "super-outer:super-outer";

const DESIGN_PATH_LINE = `This may be a user-facing new feature or redesign. For those, Super-outer records the product intent, asks only the design questions that change the outcome, and renders the main working screen for the owner before any screen is built: ${ref("product-intent.md")} and ${ref("design-package.md")}. A small visual correction needs only a before and after render.`;
const namesDesignPath = (route) => route.selected_modules.includes("product-ui-ux-motion")
  && DESIGN_PATH_SHAPES.has(route.change_shape?.shape);

/**
 * The allowance has to arrive on its own.
 *
 * Until 5.5.0 nothing invoked the router. It was a command an assistant had to
 * remember to run, so depth and question allowance were recalled from a table
 * rather than computed — and recall settles on the middle row. Measured across
 * twenty realistic tasks, the tool allocated twelve questions nine times and
 * four questions twice, while the assistant asked at most four.
 *
 * So the route is computed here and handed over as context on every typed
 * prompt. From 5.14.0 a short follow-up inside a task gets a line saying it
 * belongs to that task instead (see continuesTask).
 * It is deliberately not a `systemMessage`: the allowance is working material
 * for the assistant, not a notice for the reader, and a line that appears on
 * every turn carries no information for a person.
 *
 * This needs no task record on purpose. A missing record is ordinary — most
 * repositories have none — and anticipation must not depend on bookkeeping that
 * is optional everywhere else.
 *
 * Only the typed words are routed. The host puts its own text into the prompt
 * field (reminders, a notice that a background task ended, CI events, command
 * output), and all of it used to be routed as the request. A reminder that
 * named a payments task made "yes, start the offline build" CRITICAL. A prompt
 * with nothing typed in it, such as a finished background task, gets no route.
 */
/**
 * From 5.8.0 a second reader can decide the design line.
 *
 * Jev, TypeSafe's decision model, reads the typed request when the person has
 * switched it on with a key placed for Super-outer, and its reading decides
 * whether the design path is named. Its "yes" also brings the product UI
 * specialist and the new-feature floor, and it may add lines that ask for more
 * care. It never lowers depth or the allowance and never chooses libraries.
 * Everything about what may be sent, the 2.5-second limit and the combining
 * rule lives in src/jev/. When Jev is off, has no key or fails, the route is
 * the word lists' alone, as in 5.7.0. See references/jev-routing.md.
 */
/**
 * From 5.10 the hook points new work at the product brief and the story walk.
 *
 * The brief (.engineering/super-outer/product-brief.md) records who uses the
 * product, how many, and what was decided, so later tasks read it instead of
 * asking again. Only its front-matter header is read here. The brief line is
 * shown when the file is missing and the work is new: a new product, a new
 * feature or overhaul, or a new kind of system. A fix never starts the
 * interview. When the header records heavy use, a change on a customer-facing
 * or server path also gets the scale specialist, because the numbers were
 * stated even though this request does not repeat them.
 */
const BRIEF_FILE = path.join(".engineering", "super-outer", "product-brief.md");
const BRIEF_OFFER_LINE = `No product brief yet. For a plain new feature, Super-outer drafts one from what the code shows, saves it, and offers the interview without holding up the change: ${ref("product-brief.md")}.`;
const BRIEF_LINE = `No product brief yet, and this request reads as new work. For new work, Super-outer runs the brief interview, writes the journey map with the owner phase by phase, walks one customer's story through the simplest design and looks up how this kind of system is built (${ref("product-brief.md")}, ${ref("journey-map.md")} and ${ref("story-walk.md")}). The owner sees that plan, and nothing is built until the owner replies, including when the owner asked for defaults. The interview sits outside this task's question allowance.`;
// With a brief in place, the story walk is for work that changes the shape of
// the system: a new kind of system, a new product, an overhaul, or work Jev
// reads as new. A plain new feature such as a filter needs only the
// assumption check.
const WALK_LINE = `A product brief exists at .engineering/super-outer/product-brief.md. It is read before any question, and its answers are not asked again. This work changes the shape of the system, so Super-outer writes the journey map with the owner, or changes the rows this work touches when a map is recorded (${ref("journey-map.md")}), walks one customer's story through the simplest design and looks up how this kind of system is built (${ref("story-walk.md")}), asks only what the brief does not answer, and shows the owner the plan. Nothing is built until the owner replies.`;
const WALK_SHAPES = new Set(["major_overhaul", "replacement", "coordinated_cross_system_change"]);
const HEAVY_USE_DAILY_USERS = 10000;
const HOT_PATH_MODULES = new Set(["product-ui-ux-motion", "frontend-client", "backend-api", "data-migrations"]);
const ASSUMPTION_LINE = `For what a customer will see, Super-outer lists its assumptions in one block and asks the owner to reply 'ok' or correct any line, before it is built. That block counts as one question: ${ref("product-intent.md")}.`;

const readBriefHeader = (projectRoot) => {
  try {
    const text = fs.readFileSync(path.join(projectRoot, BRIEF_FILE), "utf8");
    const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const fields = {};
    for (const line of (block?.[1] ?? "").split(/\r?\n/)) {
      const pair = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
      if (pair) fields[pair[1]] = pair[2];
    }
    const dailyUsers = Number.parseInt(String(fields.daily_users ?? "").replace(/[,_\s]/g, ""), 10);
    return {
      exists: true,
      dailyUsers: Number.isFinite(dailyUsers) ? dailyUsers : null,
      launchSpike: /^true$/i.test(fields.launch_spike ?? ""),
    };
  } catch {
    return { exists: false, dailyUsers: null, launchSpike: false };
  }
};

// The words' own route decides, before Jev's design reading rewrites its shape,
// so maintenance never becomes new work here. Jev's reading may add new work
// the words missed, such as "create a booking system for my salon"; it never
// removes new work the words found. Work that reshapes the system (a new
// product, a new kind of system, an overhaul, or work Jev reads as new) waits
// for the owner's look at the plan. A plain new feature in a repository with no
// brief gets a drafted brief and an offer, and is never held up.
const reshapesSystem = (wordRoute, description, jevNewWork) =>
  wordRoute.mode !== "SMALL_SAFE" && wordRoute.change_shape?.shape !== "maintenance"
  && !readsAsFixOrTask(description) && (
    namesNewKindOfSystem(description)
    || namesNewProduct(description)
    || WALK_SHAPES.has(wordRoute.change_shape?.shape)
    || wordRoute.archetypes.some((archetype) => archetype.id === "new-product-setup")
    || jevNewWork
  );

// From 5.17 the brief and walk lines are said once per session. Said on every
// prompt they became noise: 31 times across one project's sessions, with the
// walk never run. The walk-due line and the plan notice carry them after that.
const briefLines = (route, wordRoute, description, jevNewWork, work) => {
  const brief = readBriefHeader(root);
  const reshapes = reshapesSystem(wordRoute, description, jevNewWork) && !work.briefShown;
  if (!brief.exists) {
    if (reshapes) return [BRIEF_LINE];
    return startsNewWork(wordRoute, description) && !work.briefShown ? [BRIEF_OFFER_LINE] : [];
  }
  const lines = [];
  if (reshapes) lines.push(WALK_LINE);
  const heavy = (brief.dailyUsers ?? 0) > HEAVY_USE_DAILY_USERS || brief.launchSpike;
  if (heavy && !route.selected_modules.includes("scale-performance-cost")
    && route.selected_modules.some((id) => HOT_PATH_MODULES.has(id))) {
    const stated = (brief.dailyUsers ?? 0) > HEAVY_USE_DAILY_USERS
      ? `about ${brief.dailyUsers.toLocaleString("en-US")} people a day`
      : "a launch spike";
    lines.push(`The product brief records ${stated}, so this change on the busiest path also gets the scale specialist: ${path.join(SKILL_DIR, "modules", "scale-performance-cost.md")}.`);
  }
  return lines;
};

const assumptionLines = (route) =>
  route.selected_modules.includes("product-ui-ux-motion")
  && route.change_shape?.shape !== "maintenance"
  && (DESIGN_PATH_SHAPES.has(route.change_shape?.shape) || ["FOCUSED", "FULL", "CRITICAL"].includes(route.mode))
    ? [ASSUMPTION_LINE]
    : [];

const APPROACH_MODES = new Set(["FOCUSED", "FULL", "CRITICAL"]);
const APPROACH_LINE = `This route includes the engineering approach stage, which comes before any implementation: ${ref("engineering-approach.md")}.`;
const JEV_DECIDED_LINE = "Jev decided whether the design path applies.";

/**
 * Routing checks the deferral ledger itself, so a deferred part that
 * has come due reaches the owner without anyone running `super-outer ledger
 * check`. Only the repository search runs here, since routing has no metrics
 * file. Every term goes into one `git grep`, which runs after Jev's call
 * because it holds the process until it ends, and which stops within 800 ms.
 *
 * The search runs on every routed prompt in a repository with a ledger, so a
 * part that comes due during a session is said then. Each line is said once
 * per session, and entries that wait on a number share one count line. Any
 * failure here leaves the route line in place.
 */
const ledgerLines = () => {
  try {
    if (!fs.existsSync(path.join(root, LEDGER_PATH))) return [];
    const noticeScope = sessionOnlyScope();
    // A search given no time finds nothing and marks nothing due, so a part
    // that came due is said on a later prompt instead.
    const budgetMs = stepBudget({ elapsedMs: performance.now(), limitMs: SEARCH_TERMS_BUDGET_MS, reserveMs: AFTER_SEARCH_RESERVE_MS, floorMs: SEARCH_FLOOR_MS });
    const check = routeLedgerCheck(root, { searchAll: (terms, searchRoot) => searchTerms(terms, searchRoot, { budgetMs }) });
    const due = check.due.filter((item) => oncePerSessionWarning("due", noticeScope, "ledger-due", item.id));
    return ledgerRouteLines({ ...check, due })
      .filter((line) => line.key.startsWith("due:") || oncePerSessionWarning(line.text, noticeScope, "ledger", line.key))
      .map((line) => line.text);
  } catch {
    return [];
  }
};

/**
 * From 5.14.0 a word that could mean the product's own payments or sign-in, or
 * everyday wording, keeps the route it gives, and the assistant asks the owner
 * which they mean (task-observer observation 55; the owner's rule of 13 October
 * 2026: in doubt, keep the higher care and ask). The router marks such a word
 * with an `ambiguous:` signal.
 */
const AMBIGUOUS_QUESTIONS = Object.freeze({
  payments: {
    meaning: "how customers pay in the product",
    question: "Is this about how customers pay in your product, or about something else, such as a document or a git checkout?",
  },
  authentication: {
    meaning: "how people sign in to the product",
    question: "Is this about how people sign in to your product, or about signing in to a tool or account yourself?",
  },
});

const ambiguityLine = (domains, mode, everydayMode) => {
  const known = domains.filter((domain) => AMBIGUOUS_QUESTIONS[domain]);
  const meanings = known.map((domain) => AMBIGUOUS_QUESTIONS[domain].meaning).join(" or ");
  const questions = known.map((domain) => `"${AMBIGUOUS_QUESTIONS[domain].question}"`).join(" and ");
  return `A word in this request could be about ${meanings}, or could be everyday wording, and nothing else in the request says which. Super-outer settles it with one plain question to the owner before any other step: ${questions} Until the owner answers, the request is treated as ${mode}; as everyday wording it is ${everydayMode}. The question counts toward the allowance.`;
};

/**
 * From 5.14.0 a short message in the middle of a task belongs to that task.
 * Most prompts typed during a task are feedback on it, such as "do that stuck
 * note recording one also", and a fresh question allowance and a fresh approach
 * stage have no use there (task-observer observation 55). A message continues
 * the task only when its own route is no deeper than the task's, adds no
 * protected domain or library, asks about no ambiguous word, is not new work,
 * names no design path, and gets no added line or new-work reading from Jev.
 * Otherwise it is routed afresh. The task keeps
 * the higher of the two routes, so this never lowers care.
 *
 * Only the mode, the library and protected-domain ids, a hash of the request
 * that set the route and a time are kept, per session and repository, never
 * the typed text.
 */
const FOLLOW_UP_WORDS = 30;
const FOLLOW_UP_WINDOW_MS = 60 * 60 * 1000;
const DEPTH = ["SMALL_SAFE", "QUICK", "FOCUSED", "FULL", "CRITICAL"];

const sessionRouteFile = () => {
  const scope = sessionOnlyScope();
  if (!scope.session) return null;
  const key = createHash("sha256").update(JSON.stringify([scope.session, scope.repository, "task-route"])).digest("hex");
  const stateRoot = process.env.SUPER_OUTER_STATE_DIR || path.join(os.tmpdir(), "super-outer-state");
  return path.join(path.resolve(stateRoot), "session-routes", `${key}.json`);
};

const readSessionRoute = () => {
  try {
    const file = sessionRouteFile();
    if (!file) return null;
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!DEPTH.includes(saved.mode) || !Array.isArray(saved.libraries) || !Array.isArray(saved.protected)) return null;
    if (!(Date.now() - Number(saved.at) < FOLLOW_UP_WINDOW_MS)) return null;
    return saved;
  } catch {
    return null;
  }
};

const requestHash = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 32);

const writeSessionRoute = ({ mode, libraries, protected: protectedIds, request }) => {
  try {
    const file = sessionRouteFile();
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify({ mode, libraries, protected: protectedIds, request, at: Date.now() }), { mode: 0o600 });
  } catch {}
};

const continuesTask = (previous, route, wordRoute, description, ambiguous, jevLines, designShown) => {
  if (!previous || !["FOCUSED", "FULL", "CRITICAL"].includes(previous.mode)) return false;
  // The request that set the task's route, sent again, is the task itself and
  // gets its full route again.
  if (previous.request === requestHash(description)) return false;
  if (description.split(/\s+/).filter(Boolean).length > FOLLOW_UP_WORDS) return false;
  if (DEPTH.indexOf(route.mode) > DEPTH.indexOf(previous.mode)) return false;
  if (ambiguous.length > 0 || jevLines.length > 0 || designShown) return false;
  const protectedIds = route.signals.filter((signal) => signal.startsWith("protected:")).map((signal) => signal.slice(10));
  if (protectedIds.some((id) => !previous.protected.includes(id))) return false;
  if (route.archetypes.some((archetype) => !previous.libraries.includes(archetype.id))) return false;
  if (![null, undefined, "maintenance"].includes(wordRoute.change_shape?.shape)) return false;
  if (namesNewKindOfSystem(description) || namesNewProduct(description)) return false;
  return true;
};

const continuationLine = (previous) =>
  `Super-outer read this message as part of the ${previous.mode} task already in progress in this session. It is handled inside that task: it adds no new question allowance and no new engineering approach stage, and it keeps that task's route${previous.libraries.length ? `, failure-mode libraries (${previous.libraries.join(", ")})` : ""} and specialists.`;

/**
 * From 5.17 the hook follows the work under way in this session as well as the
 * message. New work is recorded once and kept, so "go ahead plan the build"
 * after a design discussion is read as planning that work, and a requirement
 * changed mid-build is sent back to the records.
 */
// From 6.6 the same line also names a missing journey map. A repository with a
// recorded map and no walk gets the 6.5 wording unchanged, and one with a
// recorded walk gets no line, whether or not it has a map.
const WALK_DUE = (moments, mapRecorded) => [
  mapRecorded
    ? `No customer story walk is recorded for the new work this session is planning. Before the plan, Super-outer walks one customer's week through the design with the owner and saves the walk table to the product brief or the intent record (${ref("story-walk.md")}).`
    : `No customer story walk is recorded for the new work this session is planning, and no journey map is recorded either. Before the plan, Super-outer writes the journey map with the owner phase by phase (${ref("journey-map.md")}), then walks one customer's week through the design with the owner (${ref("story-walk.md")}), and saves both tables to the product brief or the intent record.`,
  `Not yet covered by the code or a recorded walk: ${momentList(moments)}. The owner is asked only the choices that are theirs, in the customer's terms.`,
].join(" ");
const recordNames = (records) => records.length
  ? records.slice(0, 3).map((file) => path.relative(root, file)).join(", ")
  : "the product brief or the intent record for this work";
// From 5.18 a change is sorted first. A detail gets the one-line note; a scope
// change reopens the interview and the plan, because the roadmap may have moved
// without anyone saying so (owner decision, 15 October 2026).
const REQUIREMENT_LINE = (records, isScope) => [
  isScope ? "This message reads as a possible change to the product's scope." : "",
  `A change to something already decided for the work under way is sorted first, as a detail or a scope change (${ref("requirement-changes.md")}). A detail (look, wording, layout or order inside something decided) gets a dated change line in ${recordNames(records)} and one line to the owner on what changed and what it affects.`,
  "A scope change (who the product serves, what it can do, the kind of system, where it runs or is deployed, where data lives or who sees it, an outside integration, or the roadmap) is said plainly to the owner, reopens only the interview questions it opens, re-walks the affected moments, and gets a blast-radius estimate layer by layer from the code (interface, client state, server, data and migrations, access, AI and tools, jobs, integrations, deployment, observability, tests, cost) with any new stack each layer needs, then a revised functional and technical plan listing built parts that need rework. The affected parts wait for the owner's ok before they are built.",
].filter(Boolean).join(" ");

const PROTOTYPE_LINE = `The owner called this a prototype. Read ${ref("prototype-track.md")} and decide first whether the work touches anything real: production, real people, real money, stored data, a secret or anything sent outside. If it does, everything else in this message stands. If it does not, the experiment track replaces the depth, questions, specialists, brief interview, story walk and design path named in this message: at most one question, a scratch folder or a prototype/ branch, made-up data, and a report of what it showed. Keeping the result is a new request at its real depth.`;

const saveCorrectionCandidate = (typed) => {
  try {
    const text = String(typed ?? "").trim();
    // addCandidate refuses a long message, a paste, machine or host text, a
    // secret and a person's contact details.
    addCandidate({
      source: "hook",
      correction: text,
      host: firstString(process.env.SUPER_OUTER_CLIENT, input.client, input.client_name, process.env.CODEX_THREAD_ID ? "codex" : "", process.env.CLAUDE_SESSION_ID ? "claude" : "", "unknown"),
      repo: path.basename(root),
      session: firstString(input.session_id, input.sessionId, input.conversation_id),
      transcript: firstString(input.transcript_path, input.transcriptPath),
    });
  } catch {
    // Collection never costs the user their prompt.
  }
};

// Said once a session, because a correction's value is the changed source, and a
// line on every correction would be read as noise.
const CORRECTION_LINE = `This message reads as a correction. After fixing what the owner pointed at, name the instruction, file or assumption that led to the mistake and correct that source in the same piece of work (${ref("learning-loop.md")}).`;

// The new checks read the start of a message only: a requirement change or a
// request to plan is said early, and a hostile megabyte prompt must not cost
// the hook its time limit.
const WORK_READ_CHARS = 4000;

const workLines = (wordRoute, fullDescription, newWorkHere) => {
  const description = String(fullDescription ?? "").slice(0, WORK_READ_CHARS);
  const workScope = sessionOnlyScope();
  const isFix = readsAsFixOrTask(description) || wordRoute.change_shape?.shape === "maintenance";
  let work = readWork(workScope);
  const agentHere = newWorkHere && detectAgentProduct({ description, root }).isAgent;
  const records = productRecords(root);
  const planning = !isFix && asksToPlanOrBuild(description);
  if (newWorkHere || planning) work = noteWork(workScope, { newWork: newWorkHere, planning, kinds: agentHere ? ["ai-agent"] : [] });
  const isAgent = work.kinds.includes("ai-agent") || ((planning || newWorkHere) && recordsDescribeAgent(root));
  const lines = [];
  if (planning && (work.newWork || records.length > 0) && !walkRecorded(root)) {
    const budgetMs = stepBudget({ elapsedMs: performance.now(), limitMs: MOMENT_SEARCH_LIMIT_MS, reserveMs: AFTER_SEARCH_RESERVE_MS, floorMs: SEARCH_FLOOR_MS });
    const { moments, checked } = checkMoments({ isAgent, root, library: loadArchetypes(), budgetMs });
    // A search that ran out of time leaves the once-a-session notice unused,
    // so a later prompt can say which moments the code really leaves open.
    if (checked) {
      const due = oncePerSessionWarning(WALK_DUE(moments, journeyMapRecorded(root)), workScope, "walk-due");
      if (due) lines.push(due);
    }
  }
  // A bug report can carry a new capability in the same breath ("the upload is
  // broken, also i'd like epubs"); reading it as a fix must not hide the scope.
  const isScope = readsAsScopeChange(description);
  if ((!isFix || readsAsAddedScope(description)) && readsAsRequirementChange(description) && (work.newWork || records.length > 0)) lines.push(REQUIREMENT_LINE(records, isScope));
  if (readsAsCorrection(description)) {
    const correction = oncePerSessionWarning(CORRECTION_LINE, workScope, "owner-correction");
    if (correction) lines.push(correction);
    // Every correction is raw material for an eval case. It is saved on this
    // machine only, in the private data folder, and no model runs.
    saveCorrectionCandidate(fullDescription);
  }
  return { work, lines, addsAgentLibrary: isAgent && (newWorkHere || planning) };
};

// Jev's reading of a message typed while work is under way is recorded beside
// the word lists' answers and decides nothing (question set 6.5.0-r3). It runs
// beside the route reading, inside the same budget, only when the private
// record is on. It reads only a message short enough to be a remark, refuses
// whatever the route reading refuses, and sends at most 200 characters.
const workIsUnderWay = () => {
  try {
    return readWork(sessionOnlyScope()).newWork === true || productRecords(root).length > 0;
  } catch {
    return false;
  }
};
const recordMidBuildReadings = async (description, budgetMs) => {
  try {
    const head = String(description ?? "").slice(0, WORK_READ_CHARS);
    const { askV6, midBuildSummary } = await import("../src/jev/judge.mjs");
    // The whole message is checked, so a paste, machine text or a secret
    // anywhere in it stops both calls.
    const summary = midBuildSummary(description);
    if (summary === null) return;
    await Promise.allSettled([
      askV6({ kind: "scope_change", summary, local: readsAsScopeChange(head), cwd, budgetMs, onlyWhenRecorded: true }),
      askV6({ kind: "owner_correction", summary, local: readsAsCorrection(head), cwd, budgetMs, onlyWhenRecorded: true }),
    ]);
  } catch {
    // A recorded reading never changes the route.
  }
};

const routeContext = async () => {
  try {
    const description = typedText(prompt(input));
    if (!description) return null;
    const wordRoute = routeTask({ description, facts: readProjectFacts(root) });
    if (wordRoute.mode === "SMALL_SAFE") return null;
    // A failure to load or run the Jev modules leaves the word route in place.
    // Jev gets what is left before the hook's deadline, up to its own 2.5
    // seconds; when too little is left, its modules are not even loaded.
    const jevBudgetMs = stepBudget({ elapsedMs: performance.now(), limitMs: Infinity, reserveMs: AFTER_JEV_RESERVE_MS, floorMs: JEV_FLOOR_MS });
    let judged = null;
    const recorded = jevBudgetMs > 0 && workIsUnderWay() ? recordMidBuildReadings(description, jevBudgetMs) : null;
    if (jevBudgetMs > 0) {
      try {
        const { judgeRoute } = await import("../src/jev/judge.mjs");
        judged = await judgeRoute({ typed: description, route: wordRoute, cwd, budgetMs: jevBudgetMs });
      } catch {
        judged = null;
      }
    } else {
      judged = { status: "skipped", reason: "no_time" };
    }
    if (recorded) await recorded;
    const usedJev = judged?.status === "used";
    const route = usedJev ? judged.route : wordRoute;
    const designShown = usedJev ? judged.design.shown : namesDesignPath(wordRoute);
    recordProbe("routed", {
      route_reader: usedJev ? "jev" : "words",
      design_line: designShown,
      mode: route.mode,
      jev_status: judged?.status ?? "unavailable",
      jev_reason: judged?.reason ?? null,
      jev_model: judged?.model ?? null,
      jev_timeout_ms: judged?.timeoutMs ?? null
    });
    const libraries = route.archetypes.map((archetype) => archetype.id);
    const ambiguous = route.signals.filter((signal) => signal.startsWith("ambiguous:")).map((signal) => signal.slice(10));
    const previous = readSessionRoute();
    const jevAdds = usedJev ? [...judged.lines, ...(judged.newWork === true ? ["new work"] : [])] : [];
    // An agent product counts with Jev's new-work reading: a new kind of system,
    // so it gets the brief and the walk like any other.
    const head = description.slice(0, WORK_READ_CHARS);
    // A prototype gets one extra line and loses none: the session decides
    // whether the experiment track applies.
    const isPrototype = wordRoute.signals.includes("prototype");
    const jevNewWork = ((usedJev && judged.newWork === true) || buildsAgentProduct(head))
      && wordRoute.change_shape?.shape !== "maintenance" && !readsAsFixOrTask(description);
    const newWorkHere = reshapesSystem(wordRoute, head, jevNewWork) || startsNewWork(wordRoute, head);
    const underWay = workLines(wordRoute, description, newWorkHere);
    if (underWay.addsAgentLibrary && !libraries.includes("ai-agent-product")) libraries.push("ai-agent-product");
    if (continuesTask(previous, route, wordRoute, description, ambiguous, jevAdds, designShown)) {
      writeSessionRoute(previous);
      recordProbe("continued", { mode: previous.mode });
      // The router's guard reads the new message only. A task that is
      // CRITICAL or touches a protected domain never gets the offer, whatever
      // a follow-up calls itself.
      const offer = isPrototype && previous.mode !== "CRITICAL" && !(previous.protected ?? []).length;
      return [continuationLine(previous), ...(offer ? [PROTOTYPE_LINE] : []), ...underWay.lines, ...ledgerLines()].join(" ");
    }
    writeSessionRoute({
      mode: route.mode,
      libraries,
      protected: route.signals.filter((signal) => signal.startsWith("protected:")).map((signal) => signal.slice(10)),
      request: requestHash(description),
    });
    const ledger = ledgerLines();
    const briefs = briefLines(route, wordRoute, description, jevNewWork, underWay.work);
    if (briefs.some((line) => [BRIEF_LINE, BRIEF_OFFER_LINE, WALK_LINE].includes(line))) noteWork(sessionOnlyScope(), { briefShown: true });
    return [
      `Super-outer routed this request as ${route.mode}.`,
      `Its skill is ${SKILL_NAME}.`,
      ...(ambiguous.length ? [ambiguityLine(ambiguous, route.mode, routeTask({ description }, { readAsEveryday: ambiguous }).mode)] : []),
      `Question allowance: up to ${route.question_budget} (a ceiling, not a quota; the floor is one).`,
      `Specialists: ${route.selected_modules.join(", ") || "none selected"}.`,
      libraries.length
        ? `Failure-mode libraries for this request, worked in "now" then "decide" order before any question of Super-outer's own: ${libraries.map((id) => ref(path.join("archetypes", `${id}.json`))).join(", ")}. Each mode is checked against the repository first, and one the repository already answers is reported as settled, not asked.`
        : "No failure-mode library matched; the edge cases come from the selected specialists.",
      ...(isPrototype ? [PROTOTYPE_LINE] : []),
      ...underWay.lines,
      // Due deferrals sit beside the settled questions, as the skill says.
      ...ledger,
      // The approach stage applies to most routes, so it comes before the
      // design line, which stays last when Jev is not used, as in 5.7.0.
      // Jev may add new work only where the words read neither a fix nor
      // maintenance, so a fix never starts the interview.
      ...briefs,
      ...(APPROACH_MODES.has(route.mode) ? [APPROACH_LINE] : []),
      ...assumptionLines(route),
      ...(designShown ? [DESIGN_PATH_LINE] : []),
      ...(usedJev ? [JEV_DECIDED_LINE, ...judged.lines.map((line) => line.text)] : []),
    ].join(" ");
  } catch {
    // Routing is an aid. A failure here must never cost the user their prompt.
    return null;
  }
};

// The route is worked out when the output is built, which is after the user
// turn has been recorded. The host stops this hook at its time limit, and a
// prompt can be megabytes long. If routing ran first and ran out of time, the
// turn would go unrecorded and a pending approval would outlive a turn that
// should have cancelled it. The call to Jev happens here too, for the same
// reason. Until 5.20.1 its own limit of 2.5 seconds was meant to keep the hook
// inside five, but the searches after it and a late start under load added to
// it, and the host then discarded the whole route. Jev and the searches now
// share one deadline (src/hook-deadline.mjs), and the host allows ten seconds.
// Cursor runs this hook twice for one prompt when Super-outer is installed in
// both hosts: once through the Cursor bridge, and once as the Claude Code
// plugin that Cursor imports by default. Both copies receive the same
// generation_id, so the first to claim it delivers the route and the other
// stays quiet, which also spares the second call to Jev. If the claiming copy
// then fails, that turn has no route. Claude Code and Codex never send
// cursor_version, so this changes nothing for them, and a turn without an
// identifier keeps its route. From 5.10.2 the Claude Code copy usually steps
// aside before this point (see cursorBridgeOwnsEvent), so this claim matters
// only when it cannot see a bridge that delivers the route, or is older.
const firstCursorRouteForTurn = () => {
  const turn = firstString(input.generation_id);
  if (!firstString(input.cursor_version) || !turn) return true;
  const stateRoot = process.env.SUPER_OUTER_STATE_DIR || path.join(os.tmpdir(), "super-outer-state");
  const directory = path.join(path.resolve(stateRoot), "cursor-routes");
  const key = createHash("sha256").update(turn).digest("hex").slice(0, 32);
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.closeSync(fs.openSync(path.join(directory, `${key}.claimed`), "wx", 0o600));
    return true;
  } catch (error) {
    return error?.code !== "EEXIST";
  }
};

let promptContext;
const withRouteContext = async (value = {}) => {
  if (promptContext === undefined) {
    promptContext = event === "UserPromptSubmit" && firstCursorRouteForTurn() ? await routeContext() : null;
  }
  return promptContext
    ? { ...value, hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: promptContext } }
    : value;
};

/**
 * Said once per session, with the first tool call, when Jev is neither
 * switched on nor switched off. Prompt submission stays silent, as it has
 * since 5.4.1, so the notice travels with a tool call like every other
 * bookkeeping notice. A repository without a task record has no session scope,
 * so one is built from what the host sends.
 */
const jevKeyNotice = async (noticeScope) => {
  try {
    const { loadSettings, resolveConfigDir } = await import("../src/jev/settings.mjs");
    const settings = loadSettings();
    const file = path.join(resolveConfigDir(), "jev.env");
    let text = "";
    if (settings.state === "no_key") {
      text = `Super-outer chooses routes with its word lists. To let Jev, TypeSafe's routing model, decide which requests need the design path, add SUPER_OUTER_OPENROUTER_KEY=<your OpenRouter key> to ${file} and make that file readable only by you (chmod 600). Super-outer then sends each typed request, up to 1,500 characters, to OpenRouter and TypeSafe. To stop this notice, add SUPER_OUTER_JEV=off to that file.`;
    } else if (settings.state === "key_file_permissions") {
      text = `Super-outer did not use ${file}, because other people on this computer can read it. Run chmod 600 on that file to use the key in it, or set SUPER_OUTER_JEV=off to stop this notice.`;
    }
    return cautionNotice(oncePerSessionWarning(text, noticeScope, "jev-key-notice"));
  } catch {
    return "";
  }
};
const sessionOnlyScope = () => ({
  session: firstString(process.env.SUPER_OUTER_SESSION_ID, input.session_id, input.sessionId, input.transcript_path, input.transcriptPath),
  repository: root
});

/**
 * The plan notice, from 5.17. When a build plan is saved, or plan mode ends,
 * while new work is under way and no customer story walk is recorded, the
 * owner sees one notice naming the moments nobody has checked. It never stops
 * the tool: the owner chose a warning over a gate on 15 October 2026.
 */
const planWalkNotice = () => {
  try {
    const tool = String(input.tool_name ?? input.toolName ?? input.tool ?? "");
    const isPlanMode = /^exit_?plan_?mode$/i.test(tool);
    const plans = isPlanMode ? [] : (mutationRequest(input).paths ?? []).filter(isPlanFile);
    if (!isPlanMode && plans.length === 0) return "";
    const target = plans[0] ?? "";
    const planRoot = target ? repositoryOf(target, root) : root;
    const noticeScope = sessionOnlyScope();
    const work = readWork(noticeScope);
    // Only a session that started new work or asked for a plan gets the notice,
    // so a plan for a bug fix in a repository with older records stays quiet.
    if (!work.newWork && !work.planning) return "";
    if (walkRecorded(planRoot) || walkRecorded(root)) return "";
    const isAgent = work.kinds.includes("ai-agent") || recordsDescribeAgent(planRoot);
    const moments = uncoveredMoments({ isAgent, root: planRoot, library: loadArchetypes() });
    // From 6.6 the notice also names a missing journey map. With a map
    // recorded it keeps the 6.5 wording.
    const mapRecorded = journeyMapRecorded(planRoot) || journeyMapRecorded(root);
    return oncePerSessionWarning(
      mapRecorded
        ? `This build plan is being saved before anyone walked a customer's story through the design. Not yet covered by the code or a recorded walk: ${momentList(moments)}. Ask Claude to walk these with you before building, or carry on if they are settled.`
        : `This build plan is being saved before anyone walked a customer's story through the design. No journey map is recorded for this work either (${ref("journey-map.md")}). Not yet covered by the code or a recorded walk: ${momentList(moments)}. Ask Claude to write the journey map and walk these with you before building, or carry on if they are settled.`,
      noticeScope,
      "plan-walk",
      target ? path.resolve(target) : "plan-mode",
    );
  } catch {
    return "";
  }
};

// The owner sees the plan notice as a warning, and the session sees it too, so
// a plan saved in a later turn still reaches the one writing it. No permission
// decision is set: the tool always runs.
const withPlanContext = (value, notice) => (notice
  ? { ...value, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: `Super-outer: ${notice}` } }
  : value);
const planNotice = event === "PreToolUse" ? planWalkNotice() : "";

// A missing task record is ordinary, and used to end the hook here. The route
// still has to reach the assistant, so only the record-dependent work below is
// skipped. Approval bookkeeping is untouched: with no record there is no
// approval to invalidate, and with one the original handler still runs.
if (!task) {
  if (event === "PreToolUse") output(withPlanContext(withWarning({}, planNotice, await jevKeyNotice(sessionOnlyScope())), planNotice));
  else output(await withRouteContext());
  process.exit(0);
}

let evidence;
let scope;
let branchMismatch = "";
let expectedBranch = "";
try {
  evidence = collectGitEvidence({
    cwd: root,
    baseRef: task.base?.split("@")[0],
    ...(task.evidence_binding?.ci ? { ciEvidence: task.evidence_binding.ci } : {})
  });
  scope = resolveScope(input, task, evidence);
  expectedBranch = firstString(task.branch);
  if (!expectedBranch || expectedBranch !== evidence.branch) {
    branchMismatch = `Super-outer expected task branch ${expectedBranch || "<missing>"}, but this repository is on ${evidence.branch || "<unknown>"}.`;
  }
} catch (error) {
  if (event === "PreToolUse") output(deny(error.message));
  else output(stop(error.message));
  process.exit(0);
}
// Branch mismatch is bookkeeping, never a risk: it reports that the recorded
// context is stale, not that anything is unsafe. It earns CAUTION, not BEWARE.
const branchWarning = () => cautionNotice(oncePerSessionWarning(
  branchMismatch ? `${branchMismatch} The recorded context may be stale. Ordinary work may continue; refresh it before critical delivery.` : "",
  scope,
  expectedBranch,
  evidence.branch
));

// Nudge, not a gate. Once linked worktrees exist, the primary checkout is
// shared infrastructure, and loose work left in it is exactly what another
// session's branch switch or stash carries off without any signal reaching you.
const sharedCheckoutNudge = () => {
  const details = evidence?.details || {};
  if (!details.gitDirectory || !details.commonDirectory) return "";
  if (path.resolve(details.gitDirectory) !== path.resolve(details.commonDirectory)) return "";
  const linked = Math.max((details.worktrees || []).length - 1, 0);
  const loose = (details.dirtyChanges || []).length;
  if (linked < 1 || loose < 1) return "";
  return cautionNotice(oncePerSessionWarning(
    `This is the primary checkout, on ${evidence.branch || "an unknown branch"}, holding ${loose} uncommitted file${loose === 1 ? "" : "s"} while ${linked} linked worktree${linked === 1 ? "" : "s"} sit beside it. It is shared build infrastructure: another session switching branches or stashing here takes those files with it. Ordinary work may continue; give new work its own worktree, and land or clear what is loose here.`,
    scope,
    "shared-checkout-loose-work"
  ));
};

/**
 * Prompt submission stays silent.
 *
 * Bookkeeping notices used to arrive here, which put them in front of the user
 * before any work had happened — and the host labels every line of this event's
 * output with the event name, so a one-line notice arrived wearing a paragraph
 * of machinery. The same notices already travel with the first tool call, where
 * they sit beside the action they are actually about.
 *
 * Turn recording still happens; only the user-facing text moved. A genuine
 * approval failure still speaks, because that one is not bookkeeping.
 *
 * Turn recording reads the prompt exactly as submitted, never the typed words
 * that routing uses. An approval phrase counts only when it is the whole
 * prompt, so text the host adds can never complete an approval. Removing host
 * blocks first would let a block be written so that the bare phrase is what
 * remains. The cost is accepted: a phrase that arrives beside host text, and
 * any prompt made only of host text, cancels a pending approval as any other
 * turn does, and a fresh phrase is needed.
 */
if (event === "UserPromptSubmit") {
  if (!scope.session) { output(await withRouteContext()); process.exit(0); }
  try { recordUserTurn({ message: prompt(input), scope }); }
  catch (error) { output(stop(ordinaryApprovalReason(error))); process.exit(0); }
  output(await withRouteContext());
  process.exit(0);
}

if (event === "Stop") {
  const match = assistantMessage(input).match(/(?:^|\n)APPROVE SUPER-OUTER ([A-Z0-9]{6,16})(?:$|\n)/);
  if (match) {
    if (!taskIsExtremelyCritical(task)) {
      output(withWarning({
        systemMessage: "No Super-outer approval is needed for this ordinary work. Continue with the task; keep any relevant warning or proof gap visible."
      }, branchWarning()));
      process.exit(0);
    }
    if (!scope.session) {
      output(stop("This extremely critical approval cannot be bound safely because the host did not provide a session identifier.", { critical: true }));
      process.exit(0);
    }
    try {
      issueApproval({ scope, token: match[1] });
      output(withWarning({ systemMessage: "Super-outer approval is bound to this extremely critical action, repository state, and next user turn." }, branchWarning()));
    } catch (error) { output(stop(error.message)); }
    process.exit(0);
  }
  const productionClaim = explicitProductionDeliveryClaim(input);
  const mode = String(task.mode || "").toUpperCase();
  const completion = taskCompletionReport(root, task);
  const completionGap = completion.warnings.join(" ");
  if (productionClaim && ((!completion.pass && task.completion_contract) || !completion.obligations_pass)) {
    output(stop(`Production delivery is unproved. ${completionGap}`, { critical: true }));
    process.exit(0);
  }
  const deliveryClaimNeedsCheck = productionClaim || (["FULL", "CRITICAL"].includes(mode) && task.status === "PROVED");
  if (deliveryClaimNeedsCheck) {
    const result = verifyDeliveryEvidence(deliveryEvidenceWithoutLocalTaskState(evidence), { depth: productionClaim ? "CRITICAL" : mode });
    if (!result.pass) {
      const reason = describeDeliveryFailures(result.failures);
      if (productionClaim) {
        output(stop(`Production delivery cannot continue yet. ${reason}`, { critical: true }));
      } else {
        const reviewGap = independentReviewWarning(task);
        output(withWarning({}, [
          `Super-outer expected complete independent delivery evidence, but some checks are still missing or failed: ${reason} This work may continue, but please keep the review gap visible.`,
          reviewGap,
          completionGap
        ].filter(Boolean).join(" ")));
      }
      process.exit(0);
    }
    if (productionClaim && !independentReviewPassed(task, evidence)) {
      output(stop("Production delivery cannot continue yet because passing exact-version separate review is not recorded.", { critical: true }));
      process.exit(0);
    }
  }
  output(withWarning({}, branchWarning(), sharedCheckoutNudge(), independentReviewWarning(task),
    task.completion_contract || task.status === "PROVED" || !completion.obligations_pass ? completionGap : ""));
  process.exit(0);
}

if (event === "PreToolUse") {
  // The key reminder is claimed only by a call that shows it, so a blocked
  // first call never uses it up unseen.
  const keyNotice = () => jevKeyNotice(scope);
  const request = mutationRequest(input);
  const critical = isExtremelyCritical(request);
  if (branchMismatch && critical) {
    output(deny(`${branchMismatch} The recorded context may be stale. This action is extremely critical because it involves ${request.criticalReason || "production, destructive, privileged, or externally consequential work"}, so it cannot continue from the unexpected branch.`, { critical: true }));
    process.exit(0);
  }
  if (!request.mutating) { output(withPlanContext(withWarning({}, planNotice, branchWarning(), sharedCheckoutNudge(), await keyNotice()), planNotice)); process.exit(0); }
  if (process.env.SUPER_OUTER_ENFORCEMENT === "advisory") {
    // Said once per session, then silent. This fired on every mutating call,
    // which is how a notice stops being read: a line that always appears
    // carries no information. It is also the reason fifteen hook tests failed
    // for anyone running advisory mode — the path CI never exercises.
    output(withPlanContext(withWarning({}, oncePerSessionWarning(
      cautionNotice("Super-outer is advising, not gating. Your repository's own delivery checks still apply."),
      scope,
      "advisory-mode",
    ), planNotice, branchWarning(), await keyNotice()), planNotice));
    process.exit(0);
  }
  if (!critical) {
    const notices = [planNotice, branchWarning(), sharedCheckoutNudge(), await keyNotice()];
    if (task.status === "SKIPPED") {
      notices.push(oncePerSessionWarning(
        "This task was recorded as small and safe, but it now includes a change. Work may continue; refresh the task record if the scope has materially grown.",
        scope,
        "skipped-task-now-mutating"
      ));
    }
    if (!request.unknown) {
      const recorded = approvalAllows({ scope, ...request });
      if (!recorded.allowed) {
        notices.push(oncePerSessionWarning(
          `This operation differs from the recorded task scope. ${ordinaryScopeReason(recorded.failures)} It is not an extremely critical action, so work may continue; refresh the task record when convenient.`,
          scope,
          "ordinary-scope-drift",
          request.action,
          ...recorded.failures.sort()
        ));
      }
    }
    output(withPlanContext(withWarning({}, ...notices), planNotice));
    process.exit(0);
  }

  if (task.status === "SKIPPED") {
    output(deny("This task was marked small and safe, but the requested action has an extremely critical consequence. Reassess and record the exact critical scope before continuing.", { critical: true }));
    process.exit(0);
  }
  if (request.unknown) {
    const reason = request.criticalReason || "an extremely critical consequence";
    output(deny(`This operation appears to involve ${reason}, but its exact action, path, destination, and environment are not clear. Record that exact critical scope before continuing.`, { critical: true }));
    process.exit(0);
  }
  if (!scope.session) {
    output(deny("This extremely critical action needs a host session identifier so any approval can be safely isolated.", { critical: true }));
    process.exit(0);
  }
  const allowed = approvalAllows({ scope, ...request });
  if (!allowed.allowed) {
    output(deny(`This extremely critical action does not match the recorded critical scope. ${ordinaryScopeReason(allowed.failures)}`, { critical: true }));
    process.exit(0);
  }
  try { consumeApproval({ scope }); output(withWarning({}, branchWarning())); }
  catch (error) { output(deny(ordinaryApprovalReason(error), { critical: true })); }
  process.exit(0);
}

output({});

if (process.argv[1] && path.resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) process.exit(0);
