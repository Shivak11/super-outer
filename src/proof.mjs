import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { readContained } from "./completion.mjs";

import {
  readObligations,
  writeObligations,
  openObligations,
} from "./sequencing.mjs";

/**
 * Proof candidates and run-attested promotion.
 *
 * The author of a test is not its witness; the witness is the recorded run.
 * v4.2 applied that to drafted questions, v5.2 to implementation claims. This
 * applies it to the proof itself: the agent that writes the test must not be
 * the thing that marks it proved.
 *
 * The tool checks mechanically what it can — the test file exists, the command
 * names it, the run exited zero, the file has not changed since — and records
 * as a limitation what it cannot: a hash binds the artifact, it does not
 * authenticate its producer. That sentence already governs source evidence in
 * this repository; proof evidence inherits it rather than pretending harder.
 */

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const recordedPassingRun = (entry) => {
  const run = Array.isArray(entry.attempts) ? entry.attempts.at(-1) : null;
  if (entry.attested !== true || !/^[a-f0-9]{64}$/.test(entry.evidence_sha256 ?? "")
    || !run || run.exitCode !== 0 || run.test_file_sha256 !== entry.evidence_sha256
    || typeof run.testFile !== "string" || !run.testFile
    || typeof run.command !== "string" || !run.command.includes(run.testFile)) return null;
  return run;
};

const containedPath = (root, candidate) => {
  const relative = String(candidate ?? "").trim();
  if (!relative || isAbsolute(relative)) return null;
  const normalised = normalize(relative);
  if (normalised.startsWith("..")) return null;
  return join(root, normalised);
};

/**
 * Fix 1 — candidates. A candidate is a spec for the coding agent, not evidence
 * and not generated runnable test code: Super-outer cannot know an arbitrary
 * repository's stack well enough to generate a test it would then trust, and a
 * wrong generated test that passes is an overstated proof with extra steps.
 *
 * Drafting never touches obligation status.
 */
export function draftProofCandidates(root) {
  const open = openObligations(root).filter((entry) => entry.status === "UNPROVEN");
  return open.map((entry) => ({
    id: entry.id,
    decision: entry.decision,
    answer: entry.answer,
    scenario: entry.provenBy,
    suggestedTestPath: suggestTestPath(entry.id),
    status: "CANDIDATE",
    note: "A candidate guides the test; only a recorded run of the written test promotes the obligation.",
  }));
}

function suggestTestPath(id) {
  const slug = String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `tests/proof/${slug}.test.ts`;
}

/**
 * Fix 2 — attestation. Promotion requires, all mechanically checked:
 * the named test file exists inside the repository, the command names that
 * file, and the exit code is zero. A failing run is recorded as an attempt —
 * honest history, never proof.
 */
export function attestProofRun(root, { id, testFile, command, exitCode, now = null }) {
  if (!Number.isInteger(exitCode) || exitCode < 0) throw new Error("A proof run requires an explicit integer exit code");
  const store = readObligations(root);
  const entry = store.obligations.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown proof obligation: ${id}`);

  const absolute = containedPath(root, testFile);
  if (!absolute) {
    throw new Error("Attestation needs a repository-relative test file path");
  }
  if (!existsSync(absolute)) {
    throw new Error(`The named test file does not exist: ${testFile}`);
  }
  if (!String(command ?? "").includes(testFile)) {
    throw new Error("The run command must name the test file it claims to have run");
  }

  const contentHash = sha256(readFileSync(absolute));
  const run = {
    level: "source",
    testFile,
    command: String(command),
    exitCode: Number(exitCode),
    test_file_sha256: contentHash,
    attested_at: now,
    // The honest limitation, recorded rather than papered over.
    limitation: "A hash binds the artifact; it does not authenticate its producer.",
  };

  entry.attempts = [...(entry.attempts ?? []), run];
  if (Number(exitCode) === 0) {
    entry.status = "PROVED";
    entry.attested = true;
    entry.level = "source";
    entry.evidence = `${testFile} (run: ${run.command}, exit 0)`;
    entry.evidence_sha256 = contentHash;
    delete entry.stale_reason;
  } else {
    entry.status = "UNPROVEN";
    entry.attested = false;
    entry.evidence = null;
    delete entry.evidence_sha256;
    delete entry.stale_reason;
  }
  writeObligations(root, store);
  return { promoted: Number(exitCode) === 0, entry };
}

/**
 * Fix 3 — proof rot. Proof is a state, not an event. A PROVED obligation whose
 * test file has changed since attestation — or disappeared — demotes to STALE
 * and reads in the delivery gate exactly as UNPROVEN does. This is what "stays
 * correct while you keep changing it" means mechanically.
 */
function inspectProofFreshness(root, suppliedStore) {
  const store = structuredClone(suppliedStore);
  const demoted = [];
  for (const entry of store.obligations) {
    if (entry.status !== "PROVED") continue;
    const run = recordedPassingRun(entry);
    if (!run) continue;
    const artifact = readContained(root, run.testFile, { label: "Proof test", limit: 8 * 1024 * 1024 });
    const current = artifact.bytes ? sha256(artifact.bytes) : null;
    if (current !== entry.evidence_sha256) {
      entry.status = "STALE";
      entry.stale_reason = current === null
        ? "the test that proved this has disappeared"
        : "the test that proved this has changed since it proved it";
      demoted.push({ id: entry.id, reason: entry.stale_reason });
    }
  }
  return { store, demoted };
}

/** The explicit update operation preserves its existing persistence behaviour. */
export function verifyProofFreshness(root) {
  const { store, demoted } = inspectProofFreshness(root, readObligations(root));
  if (demoted.length > 0) writeObligations(root, store);
  return demoted;
}

/** Completion reports inspect a validated snapshot without writing any ledger. */
export function inspectProofState(root, suppliedStore) {
  const { store } = inspectProofFreshness(root, suppliedStore);
  return describeProofState(root, store);
}

/**
 * Fix 4 — the delivery gate distinguishes run-attested proof from say-so.
 * Extends the v5.2 gate: UNPROVEN and STALE both surface, and evidence that was
 * merely named (never attested by a run) is called what it is.
 */
export function describeProofState(root, store = readObligations(root)) {
  const unproven = store.obligations.filter((entry) => entry.status === "UNPROVEN");
  const stale = store.obligations.filter((entry) => entry.status === "STALE");
  const saySo = store.obligations.filter(
    (entry) => entry.status === "PROVED" && !recordedPassingRun(entry),
  );

  const parts = [];
  if (unproven.length > 0) {
    parts.push(
      `${unproven.length === 1 ? "one decision is" : `${unproven.length} decisions are`} not yet proved`,
    );
  }
  if (stale.length > 0) {
    parts.push(
      `${stale.length === 1 ? "one proof has" : `${stale.length} proofs have`} gone stale — the test changed or disappeared since it proved the decision`,
    );
  }
  if (saySo.length > 0) {
    parts.push(
      `${saySo.length === 1 ? "one proof rests" : `${saySo.length} proofs rest`} on named evidence that no recorded run has confirmed`,
    );
  }
  if (parts.length === 0) return null;
  return `Proof state: ${parts.join("; ")}. A delivery claim must say so.`;
}
