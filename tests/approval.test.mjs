import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  APPROVAL_TTL_MS, approvalAllows, confirmApproval, consumeApproval,
  approvalStatePath, inspectApproval, issueApproval, recordUserTurn
} from "../src/approval.mjs";

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-approval-"));
  const repository = path.join(root, "repo");
  const stateDir = path.join(root, "state");
  fs.mkdirSync(path.join(repository, "src"), { recursive: true });
  const scope = {
    client: "codex", user: "100:test", session: "session-1", repository,
    branch: "codex/example", task: "task-1", actions: ["edit-files", "run-tests"],
    paths: ["src/**", "tests/example.test.mjs"], destinations: ["none", "github.com/org/repo"],
    environment: "local", repositoryState: "head-1:clean"
  };
  return { root, repository, stateDir, scope };
};

const approvalModule = pathToFileURL(path.resolve("src/approval.mjs")).href;

const concurrentConsumer = ({ scope, stateDir, participants }) => new Promise((resolve, reject) => {
  const script = `
    import fs from "node:fs";
    import path from "node:path";
    import { consumeApproval } from ${JSON.stringify(approvalModule)};
    const originalRename = fs.renameSync;
    let waiting = true;
    fs.renameSync = (source, destination) => {
      if (waiting && destination.endsWith(".json")) {
        waiting = false;
        fs.writeFileSync(path.join(process.env.RACE_STATE_DIR, \`ready-\${process.pid}\`), "ready");
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline && fs.readdirSync(process.env.RACE_STATE_DIR).filter((name) => name.startsWith("ready-")).length < Number(process.env.RACE_PARTICIPANTS)) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
      }
      return originalRename(source, destination);
    };
    try {
      consumeApproval({ scope: JSON.parse(process.env.RACE_SCOPE), stateDir: process.env.RACE_STATE_DIR });
      process.stdout.write("USED");
    } catch (error) {
      process.stdout.write(\`BLOCKED:\${error.message}\`);
    }
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
    env: {
      ...process.env,
      RACE_SCOPE: JSON.stringify(scope),
      RACE_STATE_DIR: stateDir,
      RACE_PARTICIPANTS: String(participants)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `consumer exited ${code}`)));
});

test("approval envelope is schema-shaped, hash-only, restrictive, one-use, and expires in 15 minutes", () => {
  const { stateDir, scope } = fixture();
  const now = Date.parse("2026-08-03T00:00:00Z");
  const issued = issueApproval({ scope, stateDir, token: "ABC12345", now, turnIndex: 7 });
  assert.equal(issued.phrase, "APPROVE SUPER-OUTER ABC12345");
  assert.equal(issued.expiresAt - now, APPROVAL_TTL_MS);
  assert.deepEqual(Object.keys(issued.envelope).sort(), [
    "actions_hash", "branch_hash", "client_hash", "created_at", "destinations_hash", "environment_hash",
    "expires_at", "paths_hash", "repository_hash", "schema_version", "scope_digest", "session_hash",
    "task_hash", "token_digest", "turn_index", "used", "user_hash"
  ].sort());
  const stored = fs.readFileSync(issued.file, "utf8");
  assert.doesNotMatch(stored, /ABC12345|session-1|codex\/example|github\.com|\/repo/);
  assert.equal(fs.statSync(stateDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(issued.file).mode & 0o777, 0o600);
  confirmApproval({ phrase: issued.phrase, scope, stateDir, now: now + 1, turnIndex: 8 });
  assert.equal(consumeApproval({ scope, stateDir, now: now + 2 }).status, "USED");
  assert.throws(() => consumeApproval({ scope, stateDir, now: now + 3 }), /already been used/);
});

test("replaying the same approval event cannot revive a used phrase", () => {
  const { stateDir, scope } = fixture();
  const first = issueApproval({ scope, stateDir, token: "REPLAY12", turnIndex: 1 });
  const pendingReplay = issueApproval({ scope, stateDir, token: "REPLAY12", turnIndex: 1 });
  assert.equal(pendingReplay.replayed, true);
  assert.equal(pendingReplay.envelope.created_at, first.envelope.created_at);
  confirmApproval({ phrase: first.phrase, scope, stateDir, turnIndex: 2 });
  consumeApproval({ scope, stateDir });
  assert.throws(
    () => issueApproval({ scope, stateDir, token: "REPLAY12", turnIndex: 1 }),
    /already been issued.*cannot be replayed/i,
  );
  assert.throws(() => consumeApproval({ scope, stateDir }), /already been used/);
});

test("a used approval phrase cannot be replayed after branch drift", () => {
  const { stateDir, scope } = fixture();
  const issued = issueApproval({ scope, stateDir, token: "DRIFTUSE", turnIndex: 1 });
  confirmApproval({ phrase: issued.phrase, scope, stateDir, turnIndex: 2 });
  consumeApproval({ scope, stateDir });
  assert.throws(
    () => issueApproval({ scope: { ...scope, branch: "codex/drifted-branch" }, stateDir, token: "DRIFTUSE", turnIndex: 3 }),
    /already been issued.*cannot be replayed.*context changed/i,
  );
});

test("typo and any intervening user turn invalidate a pending envelope", () => {
  const first = fixture();
  issueApproval({ scope: first.scope, stateDir: first.stateDir, token: "TYPO1234", turnIndex: 1 });
  assert.throws(() => confirmApproval({ phrase: "APPROVE SUPER-OUTER TYPO123X", scope: first.scope, stateDir: first.stateDir, turnIndex: 2 }), /did not match/);
  assert.equal(inspectApproval({ scope: first.scope, stateDir: first.stateDir }).status, "INVALIDATED");

  const second = fixture();
  const issued = issueApproval({ scope: second.scope, stateDir: second.stateDir, token: "TURN1234", turnIndex: 1 });
  recordUserTurn({ message: "Could you also change the destination?", scope: second.scope, stateDir: second.stateDir, turnIndex: 2 });
  assert.throws(() => confirmApproval({ phrase: issued.phrase, scope: second.scope, stateDir: second.stateDir, turnIndex: 3 }), /invalidated/);
});

test("the next host turn can confirm without a numeric turn index and branch drift cannot preserve approval", () => {
  const first = fixture();
  const issued = issueApproval({ scope: first.scope, stateDir: first.stateDir, token: "HOST1234" });
  assert.equal(recordUserTurn({ message: issued.phrase, scope: first.scope, stateDir: first.stateDir }).status, "CONFIRMED");

  const second = fixture();
  const pending = issueApproval({ scope: second.scope, stateDir: second.stateDir, token: "BRANCH12" });
  const driftedScope = { ...second.scope, branch: "codex/other-branch" };
  assert.equal(recordUserTurn({ message: "Please also update another file", scope: driftedScope, stateDir: second.stateDir }).status, "INVALIDATED");
  assert.equal(inspectApproval({ scope: second.scope, stateDir: second.stateDir }).status, "INVALIDATED");
  assert.throws(() => confirmApproval({ phrase: pending.phrase, scope: second.scope, stateDir: second.stateDir }), /invalidated/);

  const third = fixture();
  const branchBound = issueApproval({ scope: third.scope, stateDir: third.stateDir, token: "BRANCH34" });
  assert.throws(() => recordUserTurn({ message: branchBound.phrase, scope: { ...third.scope, branch: "codex/drift" }, stateDir: third.stateDir }), /scope changed/);
  assert.equal(inspectApproval({ scope: third.scope, stateDir: third.stateDir }).status, "INVALIDATED");

  const fourth = fixture();
  issueApproval({ scope: fourth.scope, stateDir: fourth.stateDir, token: "REPO1234" });
  const otherRepository = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-other-repo-"));
  const movedScope = { ...fourth.scope, repository: otherRepository, task: "another-task" };
  assert.equal(recordUserTurn({ message: "Continue somewhere else", scope: movedScope, stateDir: fourth.stateDir }).status, "INVALIDATED");
  assert.equal(inspectApproval({ scope: fourth.scope, stateDir: fourth.stateDir }).status, "INVALIDATED");
});

test("stale, session, repository-state, destination, and path drift fail closed", () => {
  const { scope, stateDir } = fixture();
  const issued = issueApproval({ scope, stateDir, token: "DRIFT123", now: 1_000, turnIndex: 1 });
  assert.throws(() => confirmApproval({ phrase: issued.phrase, scope, stateDir, now: 1_000 + APPROVAL_TTL_MS + 1, turnIndex: 2 }), /expired/);

  const changedState = { ...scope, repositoryState: "head-2:dirty" };
  assert.equal(inspectApproval({ scope: changedState, stateDir }).status, "MISSING_OR_INVALID");
  const changedSession = { ...scope, session: "session-2" };
  assert.equal(inspectApproval({ scope: changedSession, stateDir }).status, "MISSING_OR_INVALID");
  assert.throws(() => issueApproval({ scope: { ...scope, paths: ["../escape"] }, stateDir, token: "PATH1234", turnIndex: 1 }), /escapes repository/);

  assert.deepEqual(approvalAllows({ scope, action: "edit-files", paths: ["src/ok.mjs"], destinations: ["none"], environment: "local" }), { allowed: true, failures: [] });
  assert.equal(approvalAllows({ scope, action: "edit-files", paths: ["tests/other.test.mjs"] }).allowed, false);
  assert.equal(approvalAllows({ scope, action: "edit-files", paths: ["src/ok.mjs"], destinations: ["elsewhere"] }).allowed, false);
  assert.equal(approvalAllows({ scope, action: "deploy", paths: ["src/ok.mjs"] }).allowed, false);
  assert.equal(approvalAllows({ scope, action: "edit-files", paths: [], destinations: ["none"], environment: "local" }).allowed, false);
  assert.equal(approvalAllows({ scope, action: "edit-files", paths: ["src/ok.mjs"], destinations: [], environment: "local" }).allowed, false);
  assert.equal(approvalAllows({ scope, action: "edit-files", paths: ["src/ok.mjs"], destinations: ["none"], environment: "" }).allowed, false);
});

test("an allowed repository root covers descendants but never paths outside the repository", () => {
  const { scope, repository } = fixture();
  const rootScope = { ...scope, paths: ["."] };
  const localRequest = { action: "edit-files", destinations: ["none"], environment: "local" };
  assert.equal(approvalAllows({ scope: rootScope, ...localRequest, paths: ["src/nested/ok.mjs"] }).allowed, true);
  assert.equal(approvalAllows({ scope: rootScope, ...localRequest, paths: [repository] }).allowed, true);
  assert.equal(approvalAllows({ scope: rootScope, ...localRequest, paths: [path.join(repository, "..", "outside.mjs")] }).allowed, false);
});

test("approval consumption is atomic across concurrent processes", async () => {
  const { scope, stateDir } = fixture();
  const issued = issueApproval({ scope, stateDir, token: "ATOMIC12" });
  confirmApproval({ phrase: issued.phrase, scope, stateDir });
  const participants = 6;
  const outcomes = await Promise.all(Array.from({ length: participants }, () => concurrentConsumer({ scope, stateDir, participants })));
  assert.equal(outcomes.filter((outcome) => outcome === "USED").length, 1, outcomes.join("\n"));
  assert.equal(outcomes.filter((outcome) => outcome.startsWith("BLOCKED:")).length, participants - 1, outcomes.join("\n"));
});

test("an orphaned owner lock is recovered but a live owner's lock is never reclaimed", () => {
  const orphan = fixture();
  const orphanIssued = issueApproval({ scope: orphan.scope, stateDir: orphan.stateDir, token: "ORPHAN12" });
  confirmApproval({ phrase: orphanIssued.phrase, scope: orphan.scope, stateDir: orphan.stateDir });
  const orphanLock = `${approvalStatePath({ scope: orphan.scope, stateDir: orphan.stateDir }).file}.lock`;
  fs.writeFileSync(orphanLock, `${JSON.stringify({ owner_id: "dead-owner", pid: 2_147_483_647, created_at: "2020-01-01T00:00:00.000Z" })}\n`, { mode: 0o600 });
  assert.equal(consumeApproval({ scope: orphan.scope, stateDir: orphan.stateDir }).status, "USED");
  assert.equal(fs.existsSync(orphanLock), false);

  const live = fixture();
  const liveIssued = issueApproval({ scope: live.scope, stateDir: live.stateDir, token: "LIVE1234" });
  confirmApproval({ phrase: liveIssued.phrase, scope: live.scope, stateDir: live.stateDir });
  const liveLock = `${approvalStatePath({ scope: live.scope, stateDir: live.stateDir }).file}.lock`;
  fs.writeFileSync(liveLock, `${JSON.stringify({ owner_id: "live-owner", pid: process.pid, created_at: "2020-01-01T00:00:00.000Z" })}\n`, { mode: 0o600 });
  assert.throws(() => consumeApproval({ scope: live.scope, stateDir: live.stateDir }), /already being consumed/);
  fs.unlinkSync(liveLock);
  assert.equal(consumeApproval({ scope: live.scope, stateDir: live.stateDir }).status, "USED");
});

test("a second user message after confirmation invalidates the unused approval", () => {
  const { scope, stateDir } = fixture();
  const issued = issueApproval({ scope, stateDir, token: "SECOND12" });
  assert.equal(recordUserTurn({ message: issued.phrase, scope, stateDir }).status, "CONFIRMED");
  assert.throws(() => recordUserTurn({ message: issued.phrase, scope, stateDir }), /not pending/);
  assert.equal(inspectApproval({ scope, stateDir }).status, "INVALIDATED");
  assert.throws(() => consumeApproval({ scope, stateDir }), /invalidated/);
});
