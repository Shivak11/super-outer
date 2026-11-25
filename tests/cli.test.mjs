import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli, validateTaskRecord } from "../src/cli.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const repository = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cli-repo-"));
  git(root, "init", "-b", "main"); git(root, "config", "user.email", "test@example.com"); git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n"); git(root, "add", "."); git(root, "commit", "-m", "base");
  return root;
};
const capture = () => {
  let out = ""; let err = "";
  return { stdout: { write: (value) => { out += value; } }, stderr: { write: (value) => { err += value; } }, get out() { return out; }, get err() { return err; } };
};
const invoke = async (argv, cwd, context = {}) => {
  const io = capture();
  const code = await runCli(argv, { cwd, stdout: io.stdout, stderr: io.stderr, ...context });
  return { code, out: io.out, err: io.err, json: io.out.trim().startsWith("{") ? JSON.parse(io.out) : null };
};

test("repo enable preserves an existing hook, verifies, and disable removes only its managed block", async () => {
  const root = repository();
  const hook = path.join(root, ".git/hooks/pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\necho original-hook\n", { mode: 0o755 });
  const enabled = await invoke(["repo", "enable", "--root", root], root);
  assert.equal(enabled.code, 0, enabled.err);
  const combined = fs.readFileSync(hook, "utf8");
  assert.match(combined, /original-hook/);
  assert.match(combined, /super-outer v4 managed gate/);
  const config = JSON.parse(fs.readFileSync(path.join(root, ".engineering/super-outer/repository-enforcement.json"), "utf8"));
  assert.deepEqual(config, {
    schema_version: "1.0.0",
    enabled: true,
    base_ref: "main",
    mode: "local-git-hook",
    command: "super-outer repo verify --commit-gate",
  });
  assert.doesNotMatch(JSON.stringify(config), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const verified = await invoke(["repo", "verify", "--root", root, "--commit-gate"], root);
  assert.equal(verified.code, 0, verified.err);
  const disabled = await invoke(["repo", "disable", "--root", root], root);
  assert.equal(disabled.code, 0, disabled.err);
  const restored = fs.readFileSync(hook, "utf8");
  assert.match(restored, /original-hook/);
  assert.doesNotMatch(restored, /super-outer v4 managed gate/);
});

test("FULL repository verification reports CI gaps while production and CRITICAL delivery still block", async () => {
  const root = repository();
  assert.equal((await invoke(["repo", "enable", "--root", root], root)).code, 0);
  fs.mkdirSync(path.join(root, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(root, ".engineering/super-outer/current-task.json"), `${JSON.stringify({ mode: "FULL" })}\n`);
  const commitGate = await invoke(["repo", "verify", "--root", root, "--commit-gate"], root);
  assert.equal(commitGate.code, 0, commitGate.err);
  const delivery = await invoke(["repo", "verify", "--root", root, "--allow-dirty"], root);
  assert.equal(delivery.code, 0, delivery.err);
  assert.match(delivery.json.advisories.join("\n"), /remote checks have not yet returned a completed result/i);

  const production = await invoke(["repo", "verify", "--root", root, "--allow-dirty", "--production-delivery"], root);
  assert.equal(production.code, 1);
  assert.match(production.err, /remote checks have not yet returned a completed result/i);
  const critical = await invoke(["repo", "verify", "--root", root, "--allow-dirty", "--depth", "CRITICAL"], root);
  assert.equal(critical.code, 1);
  assert.match(critical.err, /remote checks have not yet returned a completed result/i);
  fs.writeFileSync(path.join(root, ".engineering/super-outer/current-task.json"), `${JSON.stringify({ mode: "CRITICAL" })}\n`);
  const cannotDowngrade = await invoke(["repo", "verify", "--root", root, "--allow-dirty", "--depth", "FULL"], root);
  assert.equal(cannotDowngrade.code, 1);
  assert.match(cannotDowngrade.err, /remote checks have not yet returned a completed result/i);
  fs.writeFileSync(path.join(root, ".engineering/super-outer/current-task.json"), `${JSON.stringify({ mode: "FULL" })}\n`);

  const head = git(root, "rev-parse", "HEAD");
  const shaOnly = await invoke(["repo", "verify", "--root", root, "--allow-dirty", "--ci-sha", head], root);
  assert.equal(shaOnly.code, 0, shaOnly.err);
  assert.match(shaOnly.json.advisories.join("\n"), /completed result/i);

  const ciFile = path.join(root, "terminal-ci.json");
  fs.writeFileSync(ciFile, `${JSON.stringify({
    provider: "github-actions",
    repository: "fixture/repository",
    workflow: "CI",
    run_id: "12345",
    status: "completed",
    conclusion: "success",
    head_sha: head,
  })}\n`);
  const terminal = await invoke(["repo", "verify", "--root", root, "--allow-dirty", "--ci-evidence", ciFile], root);
  assert.equal(terminal.code, 0, terminal.err);
  assert.match(terminal.json.advisories.join("\n"), /origin is not a GitHub repository/i);

  const verified = await invoke(["repo", "verify", "--root", root, "--allow-dirty", "--ci-evidence", ciFile], root, {
    ciEvidenceResolver: ({ claim }) => ({ ...claim, verified_by: "github-api-live", valid: true }),
  });
  assert.equal(verified.code, 0, verified.err);
});

test("task create, validate, and close use the shared task-record shape", async () => {
  const root = repository();
  const created = await invoke(["task", "create", "--root", root, "--id", "cli-task", "--mode", "FULL", "--modules", "backend-api,security-privacy-abuse", "--actions", "edit-files,run-tests", "--paths", "src/**", "--destinations", "none", "--plan", "docs/plan.md"], root);
  assert.equal(created.code, 0, created.err);
  assert.equal(created.json.task.schema_version, "1.0.0");
  assert.equal(created.json.task.mode, "FULL");
  assert.equal(created.json.task.attempt_limit, 4);
  assert.equal(created.json.task.minute_budget, 60);
  assert.deepEqual(created.json.task.attempts, []);
  const validated = await invoke(["task", "validate", "--root", root, "--id", "cli-task"], root);
  assert.equal(validated.code, 0, validated.err);
  assert.equal(validated.json.valid, true);
  const closed = await invoke(["task", "close", "--root", root, "--id", "cli-task", "--status", "BLOCKED"], root);
  assert.equal(closed.code, 0, closed.err);
  assert.equal(closed.json.task.status, "BLOCKED");
});

test("PROVED binds source evidence and live-rereads exact terminal CI", async () => {
  const root = repository();
  assert.equal((await invoke(["task", "create", "--root", root, "--id", "proof-task", "--mode", "CRITICAL"], root)).code, 0);
  const unproved = await invoke(["task", "close", "--root", root, "--id", "proof-task", "--status", "PROVED"], root);
  assert.equal(unproved.code, 1);
  assert.match(unproved.err, /requires --verification/);

  git(root, "add", ".engineering");
  git(root, "commit", "-m", "record task");
  const head = git(root, "rev-parse", "HEAD");
  const sourceEvidenceFile = path.join(os.tmpdir(), `super-outer-source-evidence-${process.pid}.json`);
  fs.writeFileSync(sourceEvidenceFile, `${JSON.stringify({
    schema_version: "1.0.0",
    head,
    status: "PASS",
    check: "npm run verify",
  }, null, 2)}\n`);
  const sourceEvidenceDigest = crypto.createHash("sha256").update(fs.readFileSync(sourceEvidenceFile)).digest("hex");
  const verificationFile = path.join(os.tmpdir(), `super-outer-verification-${process.pid}.json`);
  fs.writeFileSync(verificationFile, `${JSON.stringify({
    schema_version: "1.0.0",
    task_id: "proof-task",
    head,
    status: "PROVED",
    checks: [
      { name: "source suite", scope: "source", status: "PASS", artifact_sha256: sourceEvidenceDigest },
      { name: "exact pull-request checks", scope: "ci", status: "PASS", artifact_sha256: null },
      { name: "not a runtime product", scope: "journey", status: "NOT APPLICABLE", artifact_sha256: null },
    ],
    independent_verdict: "PASS",
    residual_risks: [],
  }, null, 2)}\n`);

  const syntheticCiOnly = await invoke([
    "task", "close", "--root", root, "--id", "proof-task", "--status", "PROVED",
    "--verification", verificationFile, "--source-evidence", sourceEvidenceFile,
  ], root);
  assert.equal(syntheticCiOnly.code, 1);
  assert.match(syntheticCiOnly.err, /requires --ci-evidence/i);

  const wrongSourceFile = path.join(os.tmpdir(), `super-outer-wrong-source-evidence-${process.pid}.json`);
  fs.writeFileSync(wrongSourceFile, `${JSON.stringify({ head, status: "PASS" })}\n`);
  const wrongSource = await invoke([
    "task", "close", "--root", root, "--id", "proof-task", "--status", "PROVED",
    "--verification", verificationFile, "--source-evidence", wrongSourceFile,
  ], root);
  assert.equal(wrongSource.code, 1);
  assert.match(wrongSource.err, /source evidence.*digest/i);

  const ciFile = path.join(os.tmpdir(), `super-outer-ci-claim-${process.pid}.json`);
  const ciClaim = {
    provider: "github-actions",
    repository: "fixture/repository",
    workflow: "CI",
    run_id: "98765",
    status: "completed",
    conclusion: "success",
    head_sha: head,
  };
  fs.writeFileSync(ciFile, `${JSON.stringify(ciClaim)}\n`);
  const differentNamedRun = await invoke([
    "task", "close", "--root", root, "--id", "proof-task", "--status", "PROVED",
    "--verification", verificationFile, "--source-evidence", sourceEvidenceFile,
    "--ci-evidence", ciFile,
  ], root, {
    ciEvidenceResolver: ({ claim }) => ({ ...claim, run_id: "12345", verified_by: "github-api-live", valid: true }),
  });
  assert.equal(differentNamedRun.code, 1);
  assert.match(differentNamedRun.err, /does not match the named GitHub Actions/i);

  const staleCi = await invoke([
    "task", "close", "--root", root, "--id", "proof-task", "--status", "PROVED",
    "--verification", verificationFile, "--source-evidence", sourceEvidenceFile,
    "--ci-evidence", ciFile,
  ], root, {
    ciEvidenceResolver: ({ claim }) => ({ ...claim, head_sha: "f".repeat(40), verified_by: "github-api-live", valid: true }),
  });
  assert.equal(staleCi.code, 1);
  assert.match(staleCi.err, /different version/i);

  let liveRereads = 0;
  const proved = await invoke([
    "task", "close", "--root", root, "--id", "proof-task", "--status", "PROVED",
    "--verification", verificationFile, "--source-evidence", sourceEvidenceFile,
    "--ci-evidence", ciFile, "--production-delivery",
  ], root, {
    ciEvidenceResolver: ({ cwd, claim }) => {
      liveRereads += 1;
      assert.equal(fs.realpathSync(cwd), fs.realpathSync(root));
      return { ...claim, verified_by: "github-api-live", valid: true };
    },
  });
  assert.equal(proved.code, 0, proved.err);
  assert.equal(liveRereads, 1);
  assert.equal(proved.json.task.status, "PROVED");
  assert.equal(proved.json.task.production_delivery_claim, true);
  assert.equal(proved.json.independent_review.enforcement, "REQUIRED");
  assert.match(proved.json.verification_digest, /^[a-f0-9]{64}$/);
  assert.equal(proved.json.evidence_binding.source.head, head);
  assert.equal(proved.json.evidence_binding.source.artifact_sha256, sourceEvidenceDigest);
  assert.equal(proved.json.evidence_binding.source.producer_authenticated, false);
  assert.match(proved.json.evidence_binding.source.limitation, /does not authenticate who produced/i);
  assert.equal(proved.json.evidence_binding.ci.head_sha, head);
  assert.equal(proved.json.evidence_binding.ci.verified_by, "github-api-live");
  const durable = JSON.parse(fs.readFileSync(path.join(root, ".engineering/super-outer/tasks/proof-task.json"), "utf8"));
  assert.equal(durable.verification_digest, proved.json.verification_digest);
  assert.deepEqual(durable.evidence_binding, proved.json.evidence_binding);
  assert.equal(validateTaskRecord(durable).valid, true);
  const tampered = structuredClone(durable);
  tampered.evidence_binding.source.producer_authenticated = true;
  assert.equal(validateTaskRecord(tampered).valid, false);
});

test("FULL closes with failed or unavailable independent review while persisting advisory evidence", async () => {
  const reviewedRoot = repository();
  assert.equal((await invoke(["task", "create", "--root", reviewedRoot, "--id", "advisory-fail", "--mode", "FULL"], reviewedRoot)).code, 0);
  git(reviewedRoot, "add", ".engineering");
  git(reviewedRoot, "commit", "-m", "record advisory task");
  const reviewedHead = git(reviewedRoot, "rev-parse", "HEAD");
  const reviewedSourceFile = path.join(os.tmpdir(), `super-outer-advisory-source-${process.pid}.json`);
  fs.writeFileSync(reviewedSourceFile, `${JSON.stringify({ head: reviewedHead, status: "PASS", check: "node --test" })}\n`);
  const reviewedSourceDigest = crypto.createHash("sha256").update(fs.readFileSync(reviewedSourceFile)).digest("hex");
  const failedReviewFile = path.join(os.tmpdir(), `super-outer-advisory-review-${process.pid}.json`);
  fs.writeFileSync(failedReviewFile, `${JSON.stringify({
    schema_version: "1.0.0",
    task_id: "advisory-fail",
    head: reviewedHead,
    status: "BLOCKED",
    checks: [
      { name: "source suite", scope: "source", status: "PASS", artifact_sha256: reviewedSourceDigest },
      { name: "separate package review", scope: "package", status: "FAIL", artifact_sha256: null },
      { name: "remote checks", scope: "ci", status: "NOT RUN", artifact_sha256: null },
    ],
    independent_verdict: "FAIL",
    residual_risks: ["Package review needs follow-up."],
  }, null, 2)}\n`);

  const productionBlocked = await invoke([
    "task", "close", "--root", reviewedRoot, "--id", "advisory-fail", "--status", "PROVED",
    "--verification", failedReviewFile, "--source-evidence", reviewedSourceFile, "--production-delivery",
  ], reviewedRoot);
  assert.equal(productionBlocked.code, 1);
  assert.match(productionBlocked.err, /did not return PASS and PROVED/i);

  const closed = await invoke([
    "task", "close", "--root", reviewedRoot, "--id", "advisory-fail", "--status", "PROVED",
    "--verification", failedReviewFile, "--source-evidence", reviewedSourceFile,
  ], reviewedRoot);
  assert.equal(closed.code, 0, closed.err);
  assert.equal(closed.json.task.status, "PROVED");
  assert.equal(closed.json.independent_review.enforcement, "ADVISORY");
  assert.equal(closed.json.independent_review.review_status, "BLOCKED");
  assert.equal(closed.json.independent_review.independent_verdict, "FAIL");
  assert.match(closed.json.independent_review.residual_risks.join("\n"), /separate package review.*FAIL/i);
  assert.match(closed.json.independent_review.residual_risks.join("\n"), /does not prove production delivery/i);
  assert.equal(closed.json.evidence_binding.source.artifact_sha256, reviewedSourceDigest);
  assert.equal("ci" in closed.json.evidence_binding, false);
  const durableReviewed = JSON.parse(fs.readFileSync(path.join(reviewedRoot, ".engineering/super-outer/tasks/advisory-fail.json"), "utf8"));
  assert.deepEqual(durableReviewed.independent_review, closed.json.independent_review);
  assert.equal(validateTaskRecord(durableReviewed).valid, true);

  const missingRoot = repository();
  assert.equal((await invoke(["task", "create", "--root", missingRoot, "--id", "advisory-missing", "--mode", "FULL"], missingRoot)).code, 0);
  git(missingRoot, "add", ".engineering");
  git(missingRoot, "commit", "-m", "record missing review task");
  const missingHead = git(missingRoot, "rev-parse", "HEAD");
  const missingSourceFile = path.join(os.tmpdir(), `super-outer-missing-source-${process.pid}.json`);
  fs.writeFileSync(missingSourceFile, `${JSON.stringify({ head: missingHead, status: "PASS", check: "npm test" })}\n`);
  const missing = await invoke([
    "task", "close", "--root", missingRoot, "--id", "advisory-missing", "--status", "PROVED",
    "--source-evidence", missingSourceFile,
  ], missingRoot);
  assert.equal(missing.code, 0, missing.err);
  assert.equal(missing.json.task.status, "PROVED");
  assert.equal(missing.json.independent_review.provided, false);
  assert.equal(missing.json.independent_review.review_status, "NOT RUN");
  assert.equal(missing.json.independent_review.independent_verdict, "NOT RUN");
  assert.match(missing.json.independent_review.residual_risks.join("\n"), /not run or supplied/i);
  assert.equal("verification_record_sha256" in missing.json.evidence_binding.source, false);
  assert.equal(validateTaskRecord(missing.json.task).valid, true);
});

test("failed exact-head source evidence cannot be closed as PROVED and CRITICAL review remains strict", async () => {
  const contradictoryRoot = repository();
  assert.equal((await invoke(["task", "create", "--root", contradictoryRoot, "--id", "contradictory-source", "--mode", "FULL"], contradictoryRoot)).code, 0);
  git(contradictoryRoot, "add", ".engineering");
  git(contradictoryRoot, "commit", "-m", "record contradictory source task");
  const contradictoryHead = git(contradictoryRoot, "rev-parse", "HEAD");
  const contradictoryFile = path.join(os.tmpdir(), `super-outer-contradictory-source-${process.pid}.json`);
  fs.writeFileSync(contradictoryFile, `${JSON.stringify({
    head: contradictoryHead,
    status: "PASS",
    check: "npm test",
    exit_code: 1,
    failures: ["tests failed"],
  })}\n`);
  const contradictory = await invoke([
    "task", "close", "--root", contradictoryRoot, "--id", "contradictory-source", "--status", "PROVED",
    "--source-evidence", contradictoryFile,
  ], contradictoryRoot);
  assert.equal(contradictory.code, 1);
  assert.match(contradictory.err, /contradicts its PASS claim/i);

  for (const mode of ["FULL", "CRITICAL"]) {
    const root = repository();
    const taskId = `failed-source-${mode.toLowerCase()}`;
    assert.equal((await invoke(["task", "create", "--root", root, "--id", taskId, "--mode", mode], root)).code, 0);
    git(root, "add", ".engineering");
    git(root, "commit", "-m", `record ${mode.toLowerCase()} task`);
    const head = git(root, "rev-parse", "HEAD");
    const sourceFile = path.join(os.tmpdir(), `super-outer-failed-source-${mode.toLowerCase()}-${process.pid}.json`);
    fs.writeFileSync(sourceFile, `${JSON.stringify({ head, status: "PASS", check: "focused source suite" })}\n`);
    const sourceDigest = crypto.createHash("sha256").update(fs.readFileSync(sourceFile)).digest("hex");
    const reviewFile = path.join(os.tmpdir(), `super-outer-failed-source-review-${mode.toLowerCase()}-${process.pid}.json`);
    fs.writeFileSync(reviewFile, `${JSON.stringify({
      schema_version: "1.0.0",
      task_id: taskId,
      head,
      status: "BLOCKED",
      checks: [{ name: "focused source suite", scope: "source", status: "FAIL", artifact_sha256: sourceDigest }],
      independent_verdict: "FAIL",
      residual_risks: ["The source suite failed."],
    })}\n`);
    const result = await invoke([
      "task", "close", "--root", root, "--id", taskId, "--status", "PROVED",
      "--verification", reviewFile, "--source-evidence", sourceFile,
    ], root);
    assert.equal(result.code, 1);
    assert.match(result.err, mode === "FULL" ? /failed or unrun exact-head source check/i : /did not return PASS and PROVED/i);
  }
});

test("task attempt requires a changed strategy and stops at attempt or elapsed-time budget", async () => {
  const root = repository();
  assert.equal((await invoke(["task", "create", "--root", root, "--id", "budget-task", "--attempt-limit", "4", "--minute-budget", "60"], root)).code, 0);
  const first = await invoke(["task", "attempt", "--root", root, "--id", "budget-task", "--strategy", "inspect logs", "--change", "captured request IDs", "--evidence", "log-a", "--result", "FAIL", "--elapsed-minutes", "10"], root);
  assert.equal(first.code, 0, first.err);
  assert.equal(first.json.attempt.attempt_number, 1);
  const repeated = await invoke(["task", "attempt", "--root", root, "--id", "budget-task", "--strategy", "inspect logs", "--change", "repeat", "--evidence", "log-b", "--result", "FAIL", "--elapsed-minutes", "12"], root);
  assert.equal(repeated.code, 1);
  assert.match(repeated.err, /must change strategy/);
  for (const [strategy, elapsed] of [["reproduce locally", 20], ["isolate dependency", 30], ["test fallback", 40]]) {
    const attempt = await invoke(["task", "attempt", "--root", root, "--id", "budget-task", "--strategy", strategy, "--change", `changed to ${strategy}`, "--evidence", `evidence-${elapsed}`, "--result", "FAIL", "--elapsed-minutes", String(elapsed)], root);
    assert.equal(attempt.code, 0, attempt.err);
  }
  const finalRecord = JSON.parse(fs.readFileSync(path.join(root, ".engineering/super-outer/tasks/budget-task.json"), "utf8"));
  assert.equal(finalRecord.status, "BUDGET_EXCEEDED");
  assert.equal(finalRecord.attempts.length, 4);

  assert.equal((await invoke(["task", "create", "--root", root, "--id", "time-task", "--attempt-limit", "10", "--minute-budget", "5"], root)).code, 0);
  const timed = await invoke(["task", "attempt", "--root", root, "--id", "time-task", "--strategy", "one bounded check", "--change", "captured evidence", "--evidence", "timer", "--result", "CONTINUE", "--elapsed-minutes", "5"], root);
  assert.equal(timed.code, 0, timed.err);
  assert.equal(timed.json.task.status, "BUDGET_EXCEEDED");
});

test("profile commands delegate to the profile core and reject unsafe task ids", async () => {
  const root = repository();
  const created = await invoke(["profile", "create", "--root", root], root);
  assert.equal(created.code, 0, created.err);
  const validated = await invoke(["profile", "validate", "--root", root], root);
  assert.equal(validated.code, 0, validated.err);
  assert.equal(validated.json.valid, true);
  const unsafe = await invoke(["task", "validate", "--root", root, "--id", "../escape"], root);
  assert.equal(unsafe.code, 1);
  assert.match(unsafe.err, /safe filename token/);
});

test("profile create keeps --file inside the repository and rejects linked escapes", async () => {
  const root = repository();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-profile-outside-"));
  const outsideFile = path.join(outside, "profile.json");
  const absoluteEscape = await invoke(["profile", "create", "--root", root, "--file", outsideFile], root);
  assert.equal(absoluteEscape.code, 1);
  assert.match(absoluteEscape.err, /profile file.*inside the repository/i);
  assert.equal(fs.existsSync(outsideFile), false);

  fs.symlinkSync(outside, path.join(root, "linked-outside"), "dir");
  const linkedEscape = await invoke([
    "profile", "create", "--root", root, "--file", "linked-outside/profile.json",
  ], root);
  assert.equal(linkedEscape.code, 1);
  assert.match(linkedEscape.err, /profile file.*inside the repository/i);
  assert.equal(fs.existsSync(outsideFile), false);
});

test("route accepts file or explicit stdin input and emits the versioned decision without task text in argv", async () => {
  const root = repository();
  const input = { title: "Add an authenticated high-volume API", description: "Backend endpoint with authorization and strict throughput", material: true };
  const filename = path.join(root, "route-input.json");
  fs.writeFileSync(filename, `${JSON.stringify(input)}\n`);
  const fromFile = await invoke(["route", "--input", filename], root);
  assert.equal(fromFile.code, 0, fromFile.err);
  assert.equal(fromFile.json.schema_version, "1.0.0");
  assert.equal(fromFile.json.mode, "CRITICAL");
  assert.ok(fromFile.json.selected_modules.includes("backend-api"));

  let out = ""; let err = "";
  const code = await runCli(["route", "--stdin"], {
    cwd: root,
    stdin: (async function* () { yield JSON.stringify({ title: "Fix a typo", changedFiles: ["README.md"] }); })(),
    stdout: { write: (value) => { out += value; } },
    stderr: { write: (value) => { err += value; } }
  });
  assert.equal(code, 0, err);
  assert.equal(JSON.parse(out).mode, "SMALL_SAFE");
  const unsafeArgv = await invoke(["route", JSON.stringify(input)], root);
  assert.equal(unsafeArgv.code, 1);
  assert.match(unsafeArgv.err, /requires --input/);
});

test("profile create consumes source-linked input and refresh stays stale until explicit reread", async () => {
  const root = repository();
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs/ui.md"), "first design contract\n");
  const specFile = path.join(root, "profile-spec.json");
  fs.writeFileSync(specFile, `${JSON.stringify({
    repository: "fixture/repo",
    sections: { ui: { status: "EXPLICIT", authority: "repository-contract", summary: "First", sources: ["docs/ui.md"] } }
  })}\n`);
  const created = await invoke(["profile", "create", "--root", root, "--input", specFile], root);
  assert.equal(created.code, 0, created.err);
  assert.equal(created.json.profile.sections.ui.status, "EXPLICIT");
  const profileFile = path.join(root, ".engineering/super-outer/repository-profile.json");
  const originalHash = JSON.parse(fs.readFileSync(profileFile, "utf8")).sections.ui.sources[0].sha256;
  fs.writeFileSync(path.join(root, "docs/ui.md"), "changed design contract\n");
  const pending = await invoke(["profile", "refresh", "--root", root], root);
  assert.equal(pending.code, 1);
  assert.equal(pending.json.refreshed, false);
  assert.deepEqual(pending.json.pendingRereadSections, ["ui"]);
  assert.equal(JSON.parse(fs.readFileSync(profileFile, "utf8")).sections.ui.sources[0].sha256, originalHash);
  const rereadFile = path.join(root, "reread.json");
  fs.writeFileSync(rereadFile, `${JSON.stringify({ ui: { accepted: true, status: "EXPLICIT", authority: "repository-contract", summary: "Changed and reread" } })}\n`);
  const refreshed = await invoke(["profile", "refresh", "--root", root, "--reread", rereadFile], root);
  assert.equal(refreshed.code, 0, refreshed.err);
  assert.equal(refreshed.json.refreshed, true);
  assert.notEqual(JSON.parse(fs.readFileSync(profileFile, "utf8")).sections.ui.sources[0].sha256, originalHash);
});

test("package and isolated install commands expose staged proof without claiming host discovery", async () => {
  const root = repository();
  for (const relative of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), `${JSON.stringify({ name: "super-outer", version: "6.6.0" })}\n`);
  }
  fs.mkdirSync(path.join(root, "hooks")); fs.writeFileSync(path.join(root, "hooks/hooks.json"), "{}\n");
  fs.mkdirSync(path.join(root, "skills/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills/super-outer/SKILL.md"), "---\nname: super-outer\ndescription: Fixture skill.\n---\n");
  fs.mkdirSync(path.join(root, "commands"), { recursive: true });
  fs.writeFileSync(path.join(root, "commands/outer.md"), "Use Super-outer.\n");
  fs.mkdirSync(path.join(root, ".codex/agents"), { recursive: true });
  for (const role of ["benchmark-researcher", "design-prototyper", "experience-reviewer", "failure-scout", "independent-verifier"]) {
    fs.writeFileSync(path.join(root, `.codex/agents/${role}.toml`), `name = "${role.replaceAll("-", "_")}"\ndescription = "Fixture reviewer."\ndeveloper_instructions = "Review read-only evidence."\n`);
  }
  git(root, "add", ".");
  git(root, "commit", "-m", "plugin fixture");
  const archive = path.join(os.tmpdir(), `super-outer-cli-${process.pid}.zip`);
  const built = await invoke(["package", "build", "--root", root, "--output", archive], root);
  assert.equal(built.code, 0, built.err);
  const checked = await invoke(["package", "verify", "--package", archive, "--checksum", `${archive}.sha256`], root);
  assert.equal(checked.code, 0, checked.err);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cli-home-"));
  const installed = await invoke(["install", "--home", home, "--source", root], root);
  assert.equal(installed.code, 0, installed.err);
  assert.equal(installed.json.source_staged, true);
  assert.equal(installed.json.installed, false);
  assert.equal(installed.json.host_discovery, false);
});

test("promotion accepts explicit host executables without changing the default commands", async () => {
  const source = fs.readFileSync(new URL("../src/cli.mjs", import.meta.url), "utf8");
  assert.match(source, /parsed\.get\("claude-executable", "claude"\)/);
  assert.match(source, /parsed\.get\("codex-executable", "codex"\)/);
});

// 5.8.0: Jev's status and the domain counts are read from the person's own
// settings and record. The key is never printed.
const withJevEnvironment = async (values, run) => {
  const names = ["SUPER_OUTER_OPENROUTER_KEY", "OPENROUTER_API_KEY", "SUPER_OUTER_JEV", "SUPER_OUTER_JEV_RECORD", "SUPER_OUTER_CONFIG_DIR", "SUPER_OUTER_DATA_DIR"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try { return await run(); } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
};

test("jev status reports what is switched on without printing the key", async () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), "so-cli-jev-config-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "so-cli-jev-data-"));
  const key = ["cli", "test", "key", "0123456789"].join("-");
  fs.writeFileSync(path.join(config, "jev.env"), `SUPER_OUTER_OPENROUTER_KEY=${key}\nSUPER_OUTER_JEV_RECORD=on\n`, { mode: 0o600 });
  const result = await withJevEnvironment({ SUPER_OUTER_CONFIG_DIR: config, SUPER_OUTER_DATA_DIR: data }, () => invoke(["jev", "status"], config));
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.jev, "on");
  assert.equal(result.json.key_source, "file");
  assert.equal(result.json.record, true);
  assert.equal(result.json.record_rows, 0);
  assert.equal(result.out.includes(key), false);

  const off = await withJevEnvironment({ SUPER_OUTER_CONFIG_DIR: config, SUPER_OUTER_DATA_DIR: data, SUPER_OUTER_JEV: "off" }, () => invoke(["jev", "status"], config));
  assert.equal(off.json.jev, "off");
  const general = await withJevEnvironment({ SUPER_OUTER_CONFIG_DIR: data, SUPER_OUTER_DATA_DIR: data, OPENROUTER_API_KEY: key }, () => invoke(["jev", "status"], config));
  assert.equal(general.json.jev, "no_key");
});

test("jev domains counts the candidate domains in the private record", async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "so-cli-jev-data-"));
  fs.mkdirSync(path.join(data, "jev-record"), { recursive: true, mode: 0o700 });
  const day = new Date().toISOString().slice(0, 10);
  const row = (domains) => JSON.stringify({ ts: new Date().toISOString(), status: "used", jev: { domains } });
  fs.writeFileSync(path.join(data, "jev-record", `${day}.jsonl`), [
    row({ "mcp-ai-connectors": 0.9, "ai-coding-plugins": 0.1, "scheduled-jobs": 0.2, "habit-loops": 0.6 }),
    row({ "mcp-ai-connectors": 0.7, "ai-coding-plugins": 0.05, "scheduled-jobs": 0.4, "habit-loops": 0.1 }),
  ].join("\n") + "\n", { mode: 0o600 });
  const result = await withJevEnvironment({ SUPER_OUTER_DATA_DIR: data, SUPER_OUTER_CONFIG_DIR: data }, () => invoke(["jev", "domains"], data));
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.record_rows, 2);
  assert.equal(result.json.domains["mcp-ai-connectors"], 2);
  assert.equal(result.json.domains["habit-loops"], 1);
  assert.equal(result.json.domains["ai-coding-plugins"] ?? 0, 0);
});

test("inventory lists what a repository can check and says whether it is runnable", async () => {
  const root = repository();
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "fixture", scripts: { test: "node --test" } })}\n`);
  const result = await invoke(["inventory", "."], root);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.runnable, true);
  assert.match(result.json.summary, /npm run test/);
  assert.match(result.json.summary, /runnable: true$/);
});
