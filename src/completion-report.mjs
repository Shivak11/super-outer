import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateCompletion, readContained } from "./completion.mjs";
import { inspectProofState } from "./proof.mjs";
import { OBLIGATIONS_PATH } from "./sequencing.mjs";

const DESIGN_LEVELS = Object.freeze(["intent-conformance", "owner-acceptance"]);
const DESIGN_REVIEW_MISSING = "This task needs a design review before it can be called done. The rendered review against the product intent and the owner's acceptance are not both recorded.";
const DESIGN_PACKAGE_CHANGED = "The design package changed after this task recorded it, so builders and reviewers may be working from different versions.";
const DESIGN_PACKAGE_UNPINNED = "The design package version is not recorded, so the review and acceptance cannot be tied to what was built. Record it with super-outer task design.";
const DESIGN_REVIEW_OTHER_VERSION = "The design review or the owner's acceptance was recorded against a different design package version.";
const PRODUCT_INTENT_CHANGED = "The product intent changed after this task recorded it, so the review may have checked an earlier intent.";

/**
 * A task that records a required design package is done only when a rendered
 * review against the product intent and the owner's acceptance both pass.
 * Both are ordinary completion claims, so the evaluator has already judged
 * them. This checks that each of the two levels has at least one claim and that
 * every claim at that level is PROVED.
 *
 * When the task also records the hash of the package's manifest, the manifest
 * is read and hashed again. A changed or missing manifest means builders and
 * reviewers may be citing different versions of the package.
 */
const designGaps = (root, task, completion) => {
  const designPackage = task.design_package;
  const gaps = [];
  const pinned = typeof designPackage?.path === "string" && typeof designPackage?.sha256 === "string";
  if (designPackage?.required === true) {
    const reviewed = DESIGN_LEVELS.every((level) => {
      const claims = completion.claims.filter((claim) => claim.level === level);
      return claims.length > 0 && claims.every((claim) => claim.state === "PROVED");
    });
    if (!reviewed) gaps.push(DESIGN_REVIEW_MISSING);
    if (!pinned) gaps.push(DESIGN_PACKAGE_UNPINNED);
    else if (reviewed) {
      // A review and an acceptance count only for the package version they saw.
      // Each design-level claim's context names the pinned manifest hash in
      // artifact_ref, so receipts made for an earlier version cannot close a
      // task that has since been pinned to a newer one.
      const bound = (task.completion_contract?.claims ?? [])
        .filter((claim) => DESIGN_LEVELS.includes(claim.level))
        .every((claim) => {
          const context = readContained(root, claim.context_file, { label: "Design review context" });
          if (!context.bytes) return false;
          try { return String(JSON.parse(context.bytes.toString("utf8")).artifact_ref ?? "").includes(designPackage.sha256); }
          catch { return false; }
        });
      if (!bound) gaps.push(DESIGN_REVIEW_OTHER_VERSION);
    }
  }
  if (pinned) {
    const manifest = readContained(root, `${designPackage.path.replace(/\/+$/, "")}/manifest.json`, { label: "Design package manifest" });
    const current = manifest.bytes ? createHash("sha256").update(manifest.bytes).digest("hex") : null;
    if (current !== designPackage.sha256) gaps.push(DESIGN_PACKAGE_CHANGED);
  }
  const intent = task.product_intent;
  if (typeof intent?.path === "string" && typeof intent?.sha256 === "string") {
    const record = readContained(root, intent.path, { label: "Product intent record" });
    const current = record.bytes ? createHash("sha256").update(record.bytes).digest("hex") : null;
    if (current !== intent.sha256) gaps.push(PRODUCT_INTENT_CHANGED);
  }
  return gaps;
};

// Shared by the command and host hook. The coding host's identity is never
// substituted for the user and client recorded in the completion contract.
export function taskCompletionReport(root, task = {}, { evidencePath, now, closingAsProved = false } = {}) {
  const completion = evaluateCompletion(root, {
    contract: task.completion_contract,
    evidencePath: evidencePath ?? task.completion_evidence,
    now,
  });
  const warnings = [];
  const obligationFile = path.join(root, OBLIGATIONS_PATH);
  try {
    let present = false;
    try { fs.lstatSync(obligationFile); present = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (present) {
      const snapshot = readContained(root, OBLIGATIONS_PATH, { label: "Proof-obligation record" });
      if (!snapshot.bytes) throw new Error("unreadable obligation ledger");
      const ledger = JSON.parse(snapshot.bytes.toString("utf8"));
      if (!Array.isArray(ledger.obligations) || ledger.obligations.some((item) =>
        !item || !["UNPROVEN", "PROVED", "STALE"].includes(item.status))) {
        throw new Error("invalid obligation ledger");
      }
      const gap = inspectProofState(root, ledger);
      if (gap) warnings.push(gap);
    }
  } catch {
    warnings.push("The proof-obligation record could not be checked. Its decisions remain unproved.");
  }
  const obligationsPass = warnings.length === 0;
  if (!completion.pass) {
    warnings.push(completion.state === "NOT_RECORDED"
      ? "No user-outcome contract is recorded. Source checks do not establish that the intended client works."
      : `The requested outcome is ${completion.state.toLowerCase()}. ${completion.reason || ""} ${completion.claims.filter((claim) => claim.state !== "PROVED").map((claim) => `${claim.id}: ${claim.reason}`).join(" ")}`.trim());
  }
  const designWarnings = designGaps(root, task, completion);
  // The design requirement is judged at closure. Its warnings join the others
  // only when the task has a completion contract, is already PROVED, or is
  // being closed as PROVED. A turn end during ordinary work therefore never
  // shows them, including when an unproved obligation makes the host show the
  // other warnings.
  if (task.completion_contract || task.status === "PROVED" || closingAsProved) warnings.push(...designWarnings);
  return {
    ...completion,
    obligations_pass: obligationsPass,
    design_pass: designWarnings.length === 0,
    design_warnings: designWarnings,
    warnings,
  };
}
