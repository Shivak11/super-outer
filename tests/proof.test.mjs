import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  draftProofCandidates,
  attestProofRun,
  verifyProofFreshness,
  describeProofState,
} from "../src/proof.mjs";
import { recordObligation, readObligations, markObligationProved } from "../src/sequencing.mjs";

const repoWith = (obligations = 1) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-proof-"));
  for (let index = 0; index < obligations; index += 1) {
    recordObligation(root, {
      id: `capture:durability-${index}`,
      decision: "Must a finished recording survive until the server confirms it?",
      answer: "Keep it until confirmed",
      provenBy: "a test that kills the app after recording and asserts the recording is still uploaded on next launch",
    });
  }
  return root;
};

const writeTest = (root, relative = "tests/proof/durability.test.ts") => {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, "test('recording survives app kill', () => {})\n");
  return relative;
};

// Fix 1 — a candidate guides; it never promotes.
test("drafting candidates never changes obligation status", () => {
  const root = repoWith();
  const candidates = draftProofCandidates(root);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, "CANDIDATE");
  assert.match(candidates[0].scenario, /kills the app/);
  assert.match(candidates[0].suggestedTestPath, /^tests\/proof\//);
  assert.equal(readObligations(root).obligations[0].status, "UNPROVEN");
});

// Fix 2 — attestation has teeth.
test("attestation refuses a missing test file", () => {
  const root = repoWith();
  assert.throws(
    () =>
      attestProofRun(root, {
        id: "capture:durability-0",
        testFile: "tests/proof/ghost.test.ts",
        command: "npm test tests/proof/ghost.test.ts",
        exitCode: 0,
      }),
    /does not exist/,
  );
});

test("attestation refuses a command that does not name the test file", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  assert.throws(
    () =>
      attestProofRun(root, {
        id: "capture:durability-0",
        testFile,
        command: "npm test",
        exitCode: 0,
      }),
    /must name the test file/,
  );
});

test("attestation refuses escaping the repository", () => {
  const root = repoWith();
  assert.throws(
    () =>
      attestProofRun(root, {
        id: "capture:durability-0",
        testFile: "../outside.test.ts",
        command: "npm test ../outside.test.ts",
        exitCode: 0,
      }),
    /repository-relative/,
  );
});

test("a failing run is recorded as an attempt, never as proof", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  const { promoted } = attestProofRun(root, {
    id: "capture:durability-0",
    testFile,
    command: `npm test ${testFile}`,
    exitCode: 1,
  });
  assert.equal(promoted, false);
  const [entry] = readObligations(root).obligations;
  assert.equal(entry.status, "UNPROVEN");
  assert.equal(entry.attempts.length, 1);
  assert.equal(entry.attempts[0].exitCode, 1);
});

test("a passing run promotes, recording the file hash and the honest limitation", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  const { promoted, entry } = attestProofRun(root, {
    id: "capture:durability-0",
    testFile,
    command: `npm test ${testFile}`,
    exitCode: 0,
    now: "2026-08-08T12:00:00Z",
  });
  assert.equal(promoted, true);
  assert.equal(entry.status, "PROVED");
  assert.equal(entry.attested, true);
  assert.match(entry.evidence_sha256, /^[0-9a-f]{64}$/);
  assert.match(entry.attempts[0].limitation, /does not authenticate its producer/);
});

test("a later failed run withdraws earlier passing proof", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  const run = { id: "capture:durability-0", testFile, command: `node ${testFile}` };
  attestProofRun(root, { ...run, exitCode: 0 });
  const { entry } = attestProofRun(root, { ...run, exitCode: 1 });
  assert.equal(entry.status, "UNPROVEN");
  assert.equal(entry.attested, false);
  assert.equal(entry.evidence_sha256, undefined);
  assert.equal(entry.attempts.length, 2);
  assert.match(describeProofState(root), /not yet proved/);
});

test("a missing or coerced exit code cannot attest a successful run", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  for (const exitCode of [null, undefined, "0", false, -1, 0.5]) {
    assert.throws(() => attestProofRun(root, {
      id: "capture:durability-0", testFile, command: `node ${testFile}`, exitCode,
    }), /explicit integer exit code/);
  }
  assert.equal(readObligations(root).obligations[0].status, "UNPROVEN");
});

// Fix 3 — proof rot.
test("editing the proved test demotes it to STALE", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  attestProofRun(root, { id: "capture:durability-0", testFile, command: `x ${testFile}`, exitCode: 0 });
  assert.deepEqual(verifyProofFreshness(root), []);

  fs.appendFileSync(path.join(root, testFile), "// edited after proving\n");
  const demoted = verifyProofFreshness(root);
  assert.equal(demoted.length, 1);
  assert.match(demoted[0].reason, /changed since it proved it/);
  assert.equal(readObligations(root).obligations[0].status, "STALE");
});

test("deleting the proved test demotes it to STALE", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  attestProofRun(root, { id: "capture:durability-0", testFile, command: `x ${testFile}`, exitCode: 0 });
  fs.rmSync(path.join(root, testFile));
  const demoted = verifyProofFreshness(root);
  assert.match(demoted[0].reason, /disappeared/);
});

// Fix 4 — the gate names every weak state.
test("the delivery gate distinguishes unproven, stale, and say-so proof", () => {
  const root = repoWith(3);
  // 0: stays UNPROVEN. 1: proved by run, then rots. 2: proved by say-so.
  const testFile = writeTest(root);
  attestProofRun(root, { id: "capture:durability-1", testFile, command: `x ${testFile}`, exitCode: 0 });
  fs.appendFileSync(path.join(root, testFile), "// rot\n");
  verifyProofFreshness(root);
  markObligationProved(root, "capture:durability-2", "somebody said the staging run looked fine");

  const gate = describeProofState(root);
  assert.match(gate, /not yet proved/);
  assert.match(gate, /gone stale/);
  assert.match(gate, /no recorded run has confirmed/);
  assert.match(gate, /must say so/);
});

test("a clean proof state reports nothing", () => {
  const root = repoWith();
  const testFile = writeTest(root);
  attestProofRun(root, { id: "capture:durability-0", testFile, command: `x ${testFile}`, exitCode: 0 });
  assert.equal(describeProofState(root), null);
});
