import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectGitEvidence, describeDeliveryFailures, verifyDeliveryEvidence, verifyGitHubActionsEvidence } from "../src/git-evidence.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: "2026-08-03T00:00:00Z", GIT_COMMITTER_DATE: "2026-08-03T00:00:00Z" } }).trim();
const write = (root, relative, content) => { fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), content); };
const ciEvidence = (head_sha, overrides = {}) => ({
  provider: "github-actions",
  repository: "fixture/repository",
  workflow: "CI",
  run_id: "12345",
  status: "completed",
  conclusion: "success",
  head_sha,
  verified_by: "github-api-live",
  ...overrides,
});

const repository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-git-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  write(root, "rename-me.txt", "one\n"); write(root, "delete-me.txt", "delete\n");
  git(root, "add", "."); git(root, "commit", "-m", "base");
  const base = git(root, "rev-parse", "HEAD");
  git(root, "switch", "-c", "feature");
  git(root, "mv", "rename-me.txt", "renamed.txt"); fs.unlinkSync(path.join(root, "delete-me.txt")); write(root, "new.txt", "new\n");
  git(root, "add", "-A"); git(root, "commit", "-m", "rename delete add");
  return { root, base };
};

test("Git evidence conforms to the shared schema and detects rename, deletion, dirty state, and stale CI", () => {
  const { root } = repository();
  write(root, "dirty.txt", "dirty\n");
  fs.mkdirSync(path.join(root, "nested"));
  const stale = collectGitEvidence({ cwd: path.join(root, "nested"), baseRef: "main", ciEvidence: ciEvidence("0".repeat(40)) });
  assert.deepEqual(Object.keys(stale).sort(), ["ahead", "base_ref", "behind", "branch", "changed_files", "ci_evidence", "ci_head", "commits", "deleted_files", "dirty", "exact_head", "head", "merge_base", "release_exact_head", "release_head", "repository_root_hash", "schema_version", "worktree_hash"].sort());
  assert.equal(stale.branch, "feature");
  assert.equal(stale.ahead, 1);
  assert.equal(stale.dirty, true);
  assert.equal(stale.exact_head, false);
  assert.ok(stale.changed_files.includes("renamed.txt"));
  assert.deepEqual(stale.deleted_files, ["delete-me.txt"]);
  assert.equal(stale.details.renamedFiles[0].previousPath, "rename-me.txt");
  const failures = verifyDeliveryEvidence(stale, { depth: "FULL" }).failures.sort();
  assert.deepEqual(failures, ["ci-sha-stale", "worktree-dirty"]);
  assert.match(describeDeliveryFailures(failures), /different version/);
  const current = collectGitEvidence({ cwd: root, baseRef: "main", ciEvidence: ciEvidence(stale.head) });
  assert.equal(current.exact_head, true);
  assert.equal(current.ci_evidence.verified_by, "github-api-live");
  assert.equal(verifyDeliveryEvidence(current, { depth: "FULL", requireClean: false }).pass, true);
  const staleRelease = collectGitEvidence({ cwd: root, baseRef: "main", releaseSha: "f".repeat(40) });
  assert.equal(staleRelease.release_exact_head, false);
  assert.ok(verifyDeliveryEvidence(staleRelease, { depth: "QUICK", requireClean: false }).failures.includes("release-sha-stale"));
  const currentRelease = collectGitEvidence({ cwd: root, baseRef: "main", releaseSha: stale.head });
  assert.equal(currentRelease.release_exact_head, true);
});

test("FULL and CRITICAL delivery require a terminal passing CI record, not a caller-supplied SHA", () => {
  const { root } = repository();
  const head = git(root, "rev-parse", "HEAD");
  const shaOnly = collectGitEvidence({ cwd: root, baseRef: "main", ciSha: head });
  assert.equal(shaOnly.exact_head, true);
  assert.deepEqual(
    verifyDeliveryEvidence(shaOnly, { depth: "FULL" }).failures,
    ["ci-result-missing"],
  );

  const running = collectGitEvidence({
    cwd: root,
    baseRef: "main",
    ciEvidence: ciEvidence(head, { status: "in_progress", conclusion: "" }),
  });
  assert.deepEqual(
    verifyDeliveryEvidence(running, { depth: "CRITICAL" }).failures.sort(),
    ["ci-not-passing", "ci-not-terminal"].sort(),
  );

  const failed = collectGitEvidence({
    cwd: root,
    baseRef: "main",
    ciEvidence: ciEvidence(head, { conclusion: "failure" }),
  });
  assert.deepEqual(verifyDeliveryEvidence(failed, { depth: "FULL" }).failures, ["ci-not-passing"]);

  const unverified = collectGitEvidence({
    cwd: root,
    baseRef: "main",
    ciEvidence: { ...ciEvidence(head), verified_by: "" },
  });
  assert.deepEqual(verifyDeliveryEvidence(unverified, { depth: "FULL" }).failures, ["ci-evidence-invalid"]);
});

test("GitHub Actions evidence is reread from the named remote run", () => {
  const { root } = repository();
  const head = git(root, "rev-parse", "HEAD");
  git(root, "remote", "add", "origin", "git@github.com:fixture/repository.git");
  const seen = [];
  const verified = verifyGitHubActionsEvidence({
    cwd: root,
    claim: { provider: "github-actions", repository: "fixture/repository", run_id: "12345" },
    commandRunner: (command) => {
      seen.push(command);
      return { status: 0, stdout: JSON.stringify({
        id: 12345,
        name: "CI",
        status: "completed",
        conclusion: "success",
        head_sha: head,
        repository: { full_name: "fixture/repository" },
      }), stderr: "" };
    },
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.verified_by, "github-api-live");
  assert.deepEqual(seen[0].args, ["api", "repos/fixture/repository/actions/runs/12345"]);
});

test("Git evidence identifies linked worktrees, stacked branches, and merge commits", () => {
  const { root } = repository();
  git(root, "switch", "main");
  git(root, "switch", "-c", "side"); write(root, "side.txt", "side\n"); git(root, "add", "."); git(root, "commit", "-m", "side");
  git(root, "switch", "feature"); git(root, "merge", "--no-ff", "side", "-m", "merge side");
  const merged = collectGitEvidence({ cwd: root, baseRef: "main" });
  assert.ok(merged.details.commitDetails.some((entry) => entry.parents.length === 2));

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-linked-"));
  fs.rmdirSync(worktree);
  git(root, "worktree", "add", "-b", "stacked", worktree, "feature");
  write(worktree, "stacked.txt", "stacked\n"); git(worktree, "add", "."); git(worktree, "commit", "-m", "stacked");
  const linked = collectGitEvidence({ cwd: worktree, baseRef: "feature" });
  assert.equal(linked.branch, "stacked");
  assert.equal(linked.ahead, 1);
  assert.notEqual(linked.worktree_hash, merged.worktree_hash);
  assert.equal(linked.details.commonDirectory, merged.details.commonDirectory);
  git(root, "worktree", "remove", worktree);
});
