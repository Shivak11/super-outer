import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const GIT_EVIDENCE_SCHEMA_VERSION = "1.0.0";

const runGit = (cwd, args, { allowFailure = false } = {}) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "" };
};
const gitText = (cwd, args, options) => runGit(cwd, args, options).stdout.trim();
const sha256 = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
const slash = (value) => String(value || "").split(path.sep).join("/");
const CI_SHA_PATTERN = /^[a-f0-9]{40}$/;

export const normalizeTerminalCiEvidence = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = {
    provider: String(input.provider || "").trim().toLowerCase(),
    repository: String(input.repository || "").trim(),
    workflow: String(input.workflow || "").trim(),
    run_id: String(input.run_id || "").trim(),
    status: String(input.status || "").trim().toLowerCase(),
    conclusion: String(input.conclusion || "").trim().toLowerCase(),
    head_sha: String(input.head_sha || "").trim().toLowerCase(),
    verified_by: String(input.verified_by || "").trim().toLowerCase(),
  };
  return {
    ...value,
    valid: value.provider === "github-actions" && Boolean(value.repository) &&
      Boolean(value.workflow) && /^[0-9]+$/.test(value.run_id) && CI_SHA_PATTERN.test(value.head_sha) &&
      value.verified_by === "github-api-live",
  };
};

const githubRepositoryFromRemote = (remote) => {
  const value = String(remote || "").trim().replace(/\.git$/, "");
  const match = value.match(/(?:github\.com[/:])([^/]+\/[^/]+)$/i);
  return match?.[1] || null;
};

const defaultCiCommandRunner = ({ executable, args, cwd }) => {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
  });
  return { status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || result.error?.message || "" };
};

export const verifyGitHubActionsEvidence = ({ cwd = process.cwd(), claim, commandRunner = defaultCiCommandRunner } = {}) => {
  const requested = normalizeTerminalCiEvidence({ ...claim, verified_by: "" });
  if (!requested || requested.provider !== "github-actions" || !requested.repository || !requested.run_id) {
    throw new Error("The CI claim must name a GitHub Actions repository and run.");
  }
  const root = fs.realpathSync(gitText(cwd, ["rev-parse", "--show-toplevel"]));
  const origin = runGit(root, ["remote", "get-url", "origin"], { allowFailure: true });
  const repository = githubRepositoryFromRemote(origin.stdout);
  if (!repository) throw new Error("The repository origin is not a GitHub repository, so its CI run cannot be checked independently.");
  if (repository.toLowerCase() !== requested.repository.toLowerCase()) {
    throw new Error("The CI claim names a different repository from the checked Git origin.");
  }
  const result = commandRunner({
    executable: "gh",
    args: ["api", `repos/${repository}/actions/runs/${requested.run_id}`],
    cwd: root,
  });
  if (Number(result.status ?? 1) !== 0) {
    throw new Error(`GitHub did not verify the named CI run: ${String(result.stderr || result.stdout || "request failed").trim()}`);
  }
  let live;
  try { live = JSON.parse(result.stdout); }
  catch { throw new Error("GitHub returned an unreadable CI run record."); }
  const verified = normalizeTerminalCiEvidence({
    provider: "github-actions",
    repository: live.repository?.full_name || repository,
    workflow: live.name || String(live.workflow_id || ""),
    run_id: String(live.id || ""),
    status: live.status,
    conclusion: live.conclusion,
    head_sha: live.head_sha,
    verified_by: "github-api-live",
  });
  if (!verified?.valid || verified.repository.toLowerCase() !== repository.toLowerCase() || verified.run_id !== requested.run_id) {
    throw new Error("GitHub returned CI evidence that does not match the named repository and run.");
  }
  return verified;
};

const resolveRef = (root, candidates) => {
  for (const candidate of candidates.filter(Boolean)) {
    const result = runGit(root, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], { allowFailure: true });
    if (result.ok) return { ref: candidate, sha: result.stdout.trim() };
  }
  return { ref: "HEAD", sha: gitText(root, ["rev-parse", "HEAD"]) };
};

const parseNameStatus = (raw) => {
  const tokens = raw ? raw.split("\0") : [];
  const entries = [];
  for (let index = 0; index < tokens.length && tokens[index];) {
    const status = tokens[index++];
    if (/^[RC]/.test(status)) entries.push({ status, previousPath: slash(tokens[index++] || ""), path: slash(tokens[index++] || "") });
    else entries.push({ status, path: slash(tokens[index++] || "") });
  }
  return entries;
};

const parsePorcelain = (raw) => {
  const records = raw ? raw.split("\0") : [];
  const changes = [];
  for (let index = 0; index < records.length && records[index];) {
    const record = records[index++];
    const code = record.slice(0, 2);
    const change = { index: code[0], worktree: code[1], path: slash(record.slice(3)) };
    if (code.includes("R") || code.includes("C")) change.previousPath = slash(records[index++] || "");
    changes.push(change);
  }
  return changes;
};

const parseWorktrees = (raw) => {
  const result = [];
  let current;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) result.push(current);
      current = { path: path.resolve(line.slice(9)) };
    } else if (current && line) {
      const split = line.indexOf(" ");
      current[split < 0 ? line : line.slice(0, split)] = split < 0 ? true : line.slice(split + 1);
    }
  }
  if (current) result.push(current);
  return result;
};

export const collectGitEvidence = ({ cwd = process.cwd(), baseRef, ciSha = process.env.SUPER_OUTER_CI_HEAD || process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || process.env.BUILD_SOURCEVERSION || "", ciEvidence, releaseSha = process.env.SUPER_OUTER_RELEASE_SHA || "" } = {}) => {
  const root = fs.realpathSync(gitText(cwd, ["rev-parse", "--show-toplevel"]));
  const head = gitText(root, ["rev-parse", "HEAD"]);
  const branchResult = runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const branch = branchResult.ok ? branchResult.stdout.trim() : `detached:${head.slice(0, 12)}`;
  const base = resolveRef(root, [baseRef, process.env.SUPER_OUTER_BASE, "refs/remotes/origin/main", "main", "refs/remotes/origin/master", "master", "HEAD^"]);
  const mergeBase = gitText(root, ["merge-base", base.sha, head]);
  const [behindRaw = "0", aheadRaw = "0"] = gitText(root, ["rev-list", "--left-right", "--count", `${base.sha}...${head}`]).split(/\s+/);
  const changes = parseNameStatus(runGit(root, ["diff", "--name-status", "-z", "-M", `${mergeBase}..${head}`]).stdout);
  const dirtyChanges = parsePorcelain(runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout);
  const commitDetails = gitText(root, ["log", "--format=%H%x00%P%x00%s", `${mergeBase}..${head}`], { allowFailure: true }).split("\n").filter(Boolean).map((line) => {
    const [sha, parents, subject] = line.split("\0");
    return { sha, parents: parents ? parents.split(" ") : [], subject: subject || "" };
  });
  const gitDirectory = path.resolve(root, gitText(root, ["rev-parse", "--git-dir"]));
  const commonDirectory = path.resolve(root, gitText(root, ["rev-parse", "--git-common-dir"]));
  const worktrees = parseWorktrees(runGit(root, ["worktree", "list", "--porcelain"]).stdout);
  const currentWorktree = worktrees.find((entry) => {
    try { return fs.realpathSync(entry.path) === root; } catch { return entry.path === root; }
  }) || { path: root };
  const terminalCi = normalizeTerminalCiEvidence(ciEvidence);
  const ciHead = terminalCi?.head_sha || String(ciSha || "").trim() || null;
  const result = {
    schema_version: GIT_EVIDENCE_SCHEMA_VERSION,
    repository_root_hash: sha256(root),
    branch,
    base_ref: base.ref,
    merge_base: mergeBase,
    head,
    ahead: Number(aheadRaw),
    behind: Number(behindRaw),
    changed_files: changes.filter((entry) => !entry.status.startsWith("D")).map((entry) => entry.path),
    deleted_files: changes.filter((entry) => entry.status.startsWith("D")).map((entry) => entry.path),
    commits: commitDetails.map((entry) => entry.sha),
    dirty: dirtyChanges.length > 0,
    worktree_hash: sha256(`${root}\0${gitDirectory}\0${commonDirectory}`),
    ci_head: ciHead,
    ci_evidence: terminalCi,
    exact_head: ciHead ? ciHead === head : true,
    release_head: String(releaseSha || "").trim() || null,
    release_exact_head: releaseSha ? String(releaseSha).trim() === head : true
  };
  Object.defineProperty(result, "details", { enumerable: false, value: {
    repositoryRoot: root, baseSha: base.sha, changes, renamedFiles: changes.filter((entry) => entry.status.startsWith("R")),
    dirtyChanges, commitDetails, gitDirectory, commonDirectory, currentWorktree, worktrees,
    ciEvidence: terminalCi,
    releaseSha: result.release_head,
    releaseMatchesHead: result.release_exact_head
  } });
  return result;
};

export const verifyDeliveryEvidence = (evidence, { depth = "FULL", requireClean = true } = {}) => {
  const failures = [];
  if (!evidence?.repository_root_hash || !evidence?.head || !evidence?.merge_base) failures.push("git-topology-incomplete");
  if (requireClean && evidence?.dirty) failures.push("worktree-dirty");
  if (["FULL", "CRITICAL"].includes(String(depth).toUpperCase())) {
    const ci = evidence?.ci_evidence;
    if (!ci) failures.push("ci-result-missing");
    else if (!ci.valid) failures.push("ci-evidence-invalid");
    else {
      if (ci.status !== "completed") failures.push("ci-not-terminal");
      if (ci.conclusion !== "success") failures.push("ci-not-passing");
      if (!evidence.exact_head) failures.push("ci-sha-stale");
    }
  }
  if (evidence?.release_head && !evidence.release_exact_head) failures.push("release-sha-stale");
  return { pass: failures.length === 0, failures };
};

const DELIVERY_FAILURE_MESSAGES = Object.freeze({
  "git-topology-incomplete": "I cannot safely identify the exact repository version.",
  "worktree-dirty": "The repository contains changes that are not part of the verified version.",
  "ci-result-missing": "The remote checks have not yet returned a completed result for the exact version we would deliver.",
  "ci-evidence-invalid": "The remote-check record is incomplete, so it cannot prove the version we would deliver.",
  "ci-not-terminal": "The remote checks are still running and have not reached a final result.",
  "ci-not-passing": "The remote checks reached a final result but did not pass.",
  "ci-sha-stale": "The remote checks passed for a different version from the one we would deliver.",
  "release-sha-stale": "The release points to a different version from the one that was reviewed.",
});

export const describeDeliveryFailures = (failures = []) => failures
  .map((failure) => DELIVERY_FAILURE_MESSAGES[failure] || "A required delivery check is incomplete.")
  .join(" ");
