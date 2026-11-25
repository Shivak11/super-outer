import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { collectGitEvidence, verifyGitHubActionsEvidence } from "./git-evidence.mjs";

// A rendered review of the built screens against the recorded product intent
// (intent-conformance) and the owner's acceptance of them (owner-acceptance)
// are both things a person saw in the running product, so like a journey they
// need a direct observation and a local check cannot establish them.
const LEVELS = new Set([
  "source", "ci", "package", "installation", "host-discovery", "runtime",
  "journey", "intent-conformance", "owner-acceptance", "scheduled", "published", "publication-verified",
  "production-observed",
]);
const DIRECT_LEVELS = new Set(["ci", "host-discovery", "runtime", "journey", "intent-conformance", "owner-acceptance", "scheduled", "published", "publication-verified", "production-observed"]);
// Observation 0262: the completion contract carries a line saying the change can be observed in production.
export const PRODUCTION_OBSERVED_LINE = Object.freeze({ level: "production-observed", expected_result: "The change can be observed in production" });
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const LIMITATION = "Local records bind the supplied files and declared observation; they cannot authenticate the observer or detect unobserved external changes. Runtime context must be refreshed from the actual target before making a completion claim.";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, maximum) => typeof value === "string" && value.trim().length > 0
  && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const relativeFile = (value) => text(value, 1024) && !path.isAbsolute(value)
  && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) && !value.includes("\\")
  && !value.split("/").some((part) => part === "..")
  && ![".", ""].includes(path.normalize(value));

const fields = (value, allowed, prefix, errors) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) errors.push(`${prefix} contains unsupported fields`);
};

/** Validate the requested outcome without accepting evidence or changing state. */
export function validateCompletionContract(contract) {
  const errors = [];
  if (!record(contract)) return { valid: false, errors: ["Completion contract must be an object"] };
  fields(contract, ["schema_version", "claims"], "Completion contract", errors);
  if (contract.schema_version !== "1.0.0") errors.push("Completion contract schema_version must be 1.0.0");
  if (!Array.isArray(contract.claims) || contract.claims.length < 1 || contract.claims.length > 32) {
    errors.push("Completion contract must contain between 1 and 32 claims");
  }
  const ids = new Set();
  for (const [index, claim] of (Array.isArray(contract.claims) ? contract.claims.slice(0, 32) : []).entries()) {
    const label = `Claim ${index + 1}`;
    if (!record(claim)) { errors.push(`${label} must be an object`); continue; }
    fields(claim, ["id", "level", "actor_ref", "client", "environment", "action", "expected_result", "context_file"], label, errors);
    if (typeof claim.id !== "string" || !SAFE_ID.test(claim.id)) errors.push(`${label} needs a safe id`);
    else if (ids.has(claim.id)) errors.push(`${label} repeats a claim id`);
    else ids.add(claim.id);
    if (!LEVELS.has(claim.level)) errors.push(`${label} has an unsupported proof level`);
    if (typeof claim.actor_ref !== "string" || !SAFE_ID.test(claim.actor_ref)) errors.push(`${label} needs an opaque actor_ref`);
    for (const key of ["client", "environment", "action", "expected_result"]) {
      if (!text(claim[key], ["action", "expected_result"].includes(key) ? 2048 : 256)) errors.push(`${label} needs a bounded non-empty ${key}`);
    }
    if (!relativeFile(claim.context_file)) errors.push(`${label} context_file must be a repository-relative file path`);
  }
  return { valid: errors.length === 0, errors };
}

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};

/** Object-key order and claim order do not alter the contract's meaning. */
export function completionContractDigest(contract) {
  const validation = validateCompletionContract(contract);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const ordered = { ...contract, claims: [...contract.claims].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0) };
  return sha256(JSON.stringify(canonical(ordered)));
}

const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** Read only regular, contained files and never read more than the size limit. */
export const readContained = (root, filename, { label, limit = MAX_RECORD_BYTES, missingState = "UNPROVEN" } = {}) => {
  if (!text(root, 4096)) return { state: "FAILED", reason: "The repository root must be a non-empty directory path" };
  if (!relativeFile(filename)) return { state: "FAILED", reason: `${label} must use a repository-relative file path` };
  let descriptor;
  try {
    const canonicalRoot = fs.realpathSync(root);
    if (!fs.statSync(canonicalRoot).isDirectory()) return { state: "FAILED", reason: "The repository root must be a directory" };
    const requested = path.resolve(canonicalRoot, filename);
    if (!inside(canonicalRoot, requested)) return { state: "FAILED", reason: `${label} must stay inside the repository` };
    const resolved = fs.realpathSync(requested);
    if (!inside(canonicalRoot, resolved)) return { state: "FAILED", reason: `${label} resolves outside the repository` };
    if (!fs.statSync(resolved).isFile()) return { state: "FAILED", reason: `${label} must be a regular file` };
    descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) return { state: "FAILED", reason: `${label} must be a regular file` };
    if (stat.size > limit) return { state: "FAILED", reason: `${label} exceeds the supported file size` };
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = fs.readSync(descriptor, buffer, size, buffer.length - size, null);
      if (read === 0) break;
      size += read;
    }
    if (size > limit) return { state: "FAILED", reason: `${label} exceeds the supported file size` };
    if (size === 0) return { state: "FAILED", reason: `${label} is empty` };
    return { bytes: buffer.subarray(0, size) };
  } catch (error) {
    return ["ENOENT", "ENOTDIR"].includes(error.code)
      ? { state: missingState, reason: `${label} is missing` }
      : { state: "FAILED", reason: `${label} could not be read safely` };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
};

const readJson = (root, filename, options) => {
  const result = readContained(root, filename, options);
  if (!result.bytes) return result;
  try { return { ...result, value: JSON.parse(result.bytes.toString("utf8")) }; }
  catch { return { state: "FAILED", reason: `${options.label} is not valid JSON` }; }
};

// Date.parse alone accepts impossible dates such as 30 February.
const instant = (value) => {
  if (!text(value, 40)) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days[Number(month) - 1]
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
    || (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validateReceipt = (receipt) => {
  const errors = [];
  if (!record(receipt)) return ["Completion receipt must be an object"];
  fields(receipt, ["schema_version", "claims"], "Completion receipt", errors);
  if (receipt.schema_version !== "1.0.0") errors.push("Completion receipt schema_version must be 1.0.0");
  if (!Array.isArray(receipt.claims) || receipt.claims.length > 32) errors.push("Completion receipt claims must be an array with at most 32 entries");
  const ids = new Set();
  for (const [index, claim] of (Array.isArray(receipt.claims) ? receipt.claims.slice(0, 32) : []).entries()) {
    const label = `Receipt claim ${index + 1}`;
    if (!record(claim)) { errors.push(`${label} must be an object`); continue; }
    fields(claim, ["id", "level", "contract_sha256", "context_sha256", "status", "observed_at", "expires_at", "evidence_file", "evidence_sha256", "method"], label, errors);
    if (typeof claim.id !== "string" || !SAFE_ID.test(claim.id)) errors.push(`${label} needs a safe id`);
    else if (ids.has(claim.id)) errors.push(`${label} repeats a claim id`);
    else ids.add(claim.id);
    if (!LEVELS.has(claim.level)) errors.push(`${label} has an unsupported proof level`);
    for (const key of ["contract_sha256", "context_sha256", "evidence_sha256"]) {
      if (typeof claim[key] !== "string" || !DIGEST.test(claim[key])) errors.push(`${label} needs a valid ${key}`);
    }
    if (!["PASS", "FAIL"].includes(claim.status)) errors.push(`${label} status must be PASS or FAIL`);
    if (!["local-check", "direct-observation"].includes(claim.method)) errors.push(`${label} has an unsupported observation method`);
    if (!relativeFile(claim.evidence_file)) errors.push(`${label} evidence_file must be a repository-relative file path`);
    const observed = instant(claim.observed_at);
    const expires = instant(claim.expires_at);
    if (observed === null || expires === null) errors.push(`${label} needs valid observed_at and expires_at timestamps`);
    else if (expires <= observed) errors.push(`${label} expires_at must be after observed_at`);
  }
  return errors;
};

const result = (state, claims, reason) => ({ state, pass: state === "PROVED", claims, limitation: LIMITATION, reason });
const claimResult = (claim, state, reason) => ({ id: claim.id, level: claim.level, state, reason });

const directContextErrors = (context, claim) => {
  const errors = [];
  for (const key of ["actor_ref", "client", "environment"]) {
    if (!text(context[key], key === "actor_ref" ? 128 : 256)) errors.push(`Current claim context needs a bounded non-empty ${key}`);
    else if (context[key] !== claim[key]) errors.push(`Current claim context ${key} does not match the intended ${key}`);
  }
  for (const key of ["route", "revision", "permissions", "artifact_ref"]) {
    if (!text(context[key], key === "route" ? 1024 : 256)) errors.push(`Current claim context needs a bounded non-empty ${key}`);
  }
  if (text(context.route, 1024) && (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(context.route) || context.route.startsWith("//"))) {
    try {
      const route = new URL(context.route, context.route.startsWith("//") ? "https://route.invalid" : undefined);
      if (route.username || route.password || context.route.includes("?") || context.route.includes("#")) {
        errors.push("Current claim context URL route must exclude credentials, queries and fragments");
      }
    } catch { errors.push("Current claim context route is not a valid URL"); }
  }
  return errors;
};

const verifyCiObservation = (root, bytes, context, resolver) => {
  let claim;
  try { claim = JSON.parse(bytes.toString("utf8")); }
  catch { return { state: "FAILED", reason: "CI observation evidence must be a named GitHub Actions run in JSON" }; }
  if (!record(claim) || claim.provider !== "github-actions" || !text(claim.repository, 256)
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(claim.repository)
    || !text(claim.workflow, 256) || typeof claim.run_id !== "string" || !/^[0-9]{1,32}$/.test(claim.run_id)) {
    return { state: "FAILED", reason: "CI observation evidence must name its GitHub Actions repository, workflow and run" };
  }
  if (!/^[a-f0-9]{40}$/.test(context.revision)) return { state: "STALE", reason: "The CI context revision must identify the current repository head" };
  let live;
  try {
    if (typeof resolver !== "function") throw new Error("CI resolver unavailable");
    live = resolver({ cwd: root, claim });
  } catch { return { state: "UNPROVEN", reason: "The named CI run could not be verified live" }; }
  if (!record(live) || live.verified_by !== "github-api-live" || live.valid !== true) {
    return { state: "UNPROVEN", reason: "The named CI run was not independently verified live" };
  }
  if (live.provider !== "github-actions" || typeof live.repository !== "string"
    || live.repository.toLowerCase() !== claim.repository.toLowerCase()
    || live.run_id !== claim.run_id || live.workflow !== claim.workflow) {
    return { state: "FAILED", reason: "Live CI evidence does not match the named repository, workflow and run" };
  }
  if (live.status !== "completed") return { state: "UNPROVEN", reason: "The named CI run has not completed" };
  if (live.conclusion !== "success") return { state: "FAILED", reason: "The named CI run did not succeed" };
  let git;
  try { git = collectGitEvidence({ cwd: root }); }
  catch { return { state: "UNPROVEN", reason: "The current repository revision could not be checked for this CI observation" }; }
  if (context.revision !== git.head) return { state: "STALE", reason: "The CI context revision differs from the current repository head" };
  if (live.head_sha !== git.head || live.head_sha !== context.revision) {
    return { state: "STALE", reason: "The named CI run covers a different repository revision" };
  }
  return null;
};

/** Evaluate supplied observations without mutating the contract, receipt or files. */
export function evaluateCompletion(root, { contract, evidencePath, now, ciEvidenceResolver = verifyGitHubActionsEvidence } = {}) {
  if (contract === undefined || contract === null) return result("NOT_RECORDED", [], "No completion contract is recorded; local source proof does not establish a user outcome");
  const validation = validateCompletionContract(contract);
  if (!validation.valid) return result("FAILED", [], validation.errors.join("; "));
  const failAll = (state, reason) => result(state, contract.claims.map((claim) => claimResult(claim, state, reason)), reason);
  const currentTime = now === undefined ? Date.now() : typeof now === "number" ? now : now instanceof Date ? now.getTime() : instant(now);
  if (currentTime === null || !Number.isFinite(currentTime) || !Number.isFinite(new Date(currentTime).getTime())) return failAll("FAILED", "The evaluation time is invalid");
  if (evidencePath === undefined || evidencePath === null || evidencePath === "") return failAll("UNPROVEN", "No completion receipt is recorded");
  const receipt = readJson(root, evidencePath, { label: "Completion receipt" });
  if (!receipt.bytes) return failAll(receipt.state, receipt.reason);
  const receiptErrors = validateReceipt(receipt.value);
  if (receiptErrors.length) return failAll("FAILED", receiptErrors.join("; "));
  const ids = new Set(contract.claims.map(({ id }) => id));
  if (receipt.value.claims.some(({ id }) => !ids.has(id))) return failAll("FAILED", "The completion receipt names a claim outside this contract");
  const receipts = new Map(receipt.value.claims.map((claim) => [claim.id, claim]));
  const digest = completionContractDigest(contract);
  const claims = contract.claims.map((claim) => {
    const evidence = receipts.get(claim.id);
    const respond = (state, reason) => claimResult(claim, state, reason);
    if (!evidence) return respond("UNPROVEN", "No observation is recorded for this required claim");
    if (evidence.level !== claim.level) return respond("FAILED", "Evidence from a different proof level cannot prove this claim");
    if (evidence.contract_sha256 !== digest) return respond("STALE", "The completion contract changed since this observation");
    if (DIRECT_LEVELS.has(claim.level) && evidence.method !== "direct-observation") return respond("UNPROVEN", "This claim requires a direct observation in the intended client and environment; a local check does not establish it");
    if (instant(evidence.observed_at) > currentTime) return respond("FAILED", "The observation time is in the future");
    if (instant(evidence.expires_at) <= currentTime) return respond("STALE", "The completion observation has expired");
    const context = readJson(root, claim.context_file, { label: "Current claim context", missingState: "STALE" });
    if (!context.bytes) return respond(context.state, context.reason);
    if (!record(context.value) || Object.keys(context.value).length === 0) return respond("FAILED", "Current claim context must be a non-empty JSON object");
    if (DIRECT_LEVELS.has(claim.level)) {
      const errors = directContextErrors(context.value, claim);
      if (errors.length) return respond("FAILED", errors.join("; "));
    }
    if (sha256(context.bytes) !== evidence.context_sha256) return respond("STALE", "The current claim context changed since this observation");
    const artifact = readContained(root, evidence.evidence_file, { label: "Observation evidence", limit: MAX_ARTIFACT_BYTES, missingState: "STALE" });
    if (!artifact.bytes) return respond(artifact.state, artifact.reason);
    if (sha256(artifact.bytes) !== evidence.evidence_sha256) return respond("STALE", "The observation evidence changed since it was recorded");
    if (claim.level === "ci") {
      const failure = verifyCiObservation(root, artifact.bytes, context.value, ciEvidenceResolver);
      if (failure) return respond(failure.state, failure.reason);
    }
    if (evidence.status === "FAIL") return respond("FAILED", "The recorded observation failed for this claim");
    return respond("PROVED", "Current same-level observation matches the contract, context and evidence files");
  });
  const state = ["FAILED", "STALE", "UNPROVEN"].find((candidate) => claims.some((claim) => claim.state === candidate)) ?? "PROVED";
  return result(state, claims, state === "PROVED" ? "Current observations cover every required claim" : "One or more required claims lack current passing evidence");
}
