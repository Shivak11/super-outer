import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.mjs";
import { completionContractDigest } from "../src/completion.mjs";
import { taskCompletionReport } from "../src/completion-report.mjs";
import { attestProofRun } from "../src/proof.mjs";
import { markObligationProved, readObligations, recordObligation } from "../src/sequencing.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, file, value) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
  return target;
};
const invoke = async (root, args) => {
  let out = "", err = "";
  const code = await runCli(args, { cwd: root, stdout: { write: (s) => out += s }, stderr: { write: (s) => err += s } });
  return { code, err, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
};
const fixture = async (withContract = true) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "so-completion-integration-"));
  git(root, "init", "-b", "main"); git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.com");
  put(root, ".gitignore", "/.engineering/\n/evidence/\n");
  put(root, "README.md", "fixture\n"); git(root, "add", "."); git(root, "commit", "-m", "base");
  const contract = { schema_version: "1.0.0", claims: [{
    id: "owner-readback", level: "journey", actor_ref: "configured-owner", client: "hosted-assistant", environment: "production",
    action: "List tools and read account", expected_result: "Correct tools and owner returned", context_file: "evidence/context.json",
  }] };
  put(root, "evidence/contract.json", contract);
  put(root, "evidence/context.json", {
    route: "direct", revision: "revision-one", actor_ref: "configured-owner", permissions: "manage",
    client: "hosted-assistant", environment: "production", artifact_ref: "tools-schema-one",
  });
  put(root, "evidence/readback.json", { tools: ["status"], owner_ref: "configured-owner" });
  put(root, "evidence/source.json", { status: "PASS", head: git(root, "rev-parse", "HEAD"), exit_code: 0 });
  const result = await invoke(root, ["task", "create", "--id", "outcome", ...(withContract ? ["--completion-contract", "evidence/contract.json"] : [])]);
  assert.equal(result.code, 0, result.err);
  return { root, contract };
};
const receipt = ({ root, contract }, changes = {}) => {
  const record = {
    id: "owner-readback", level: "journey", contract_sha256: completionContractDigest(contract),
    context_sha256: hash(fs.readFileSync(path.join(root, "evidence/context.json"))), status: "PASS",
    observed_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(),
    evidence_file: "evidence/readback.json", evidence_sha256: hash(fs.readFileSync(path.join(root, "evidence/readback.json"))),
    method: "direct-observation", ...changes,
  };
  put(root, "evidence/receipts.json", { schema_version: "1.0.0", claims: [record] });
};
const close = (root, extra = []) => invoke(root, ["task", "close", "--id", "outcome", "--status", "PROVED", "--source-evidence", "evidence/source.json", ...extra]);
const hook = (root, event, extra = {}) => {
  const env = isolatedEnv({ NO_COLOR: "1", SUPER_OUTER_STATE_DIR: path.join(root, ".engineering/hook-state") });
  delete env.SUPER_OUTER_ENFORCEMENT;
  const result = spawnSync(process.execPath, [path.resolve("hooks/super-outer-hook.mjs"), event], {
    cwd: root, env, encoding: "utf8", input: JSON.stringify({ cwd: root, session_id: "completion-session", client: "coding-host", ...extra }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
};

test("legacy source closure stays readable and does not claim user-outcome proof", async () => {
  const { root } = await fixture(false);
  const result = await close(root);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.task.status, "PROVED");
  assert.equal(result.json.task.completion_state, "NOT_RECORDED");
  assert.equal(result.json.completion.pass, false);
  assert.match(result.json.completion.warnings.join(" "), /No user-outcome contract/);
});

test("a passing source check cannot close an unobserved hosted-client outcome", async () => {
  const fx = await fixture();
  const missing = await close(fx.root);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /Cannot mark.*PROVED/);
  const progress = await invoke(fx.root, ["task", "attempt", "--id", "outcome", "--strategy", "inspect-client", "--change", "inspect current tools", "--evidence", "evidence/source.json", "--result", "CONTINUE"]);
  assert.equal(progress.code, 0, progress.err);
  receipt(fx);
  const observed = await close(fx.root, ["--completion-evidence", "evidence/receipts.json"]);
  assert.equal(observed.code, 0, observed.err);
  assert.equal(observed.json.completion.state, "PROVED");
  assert.equal(observed.json.task.completion_evidence, "evidence/receipts.json");
});

test("the same receipt cannot establish a different evidence level", async () => {
  const fx = await fixture(); receipt(fx, { level: "source", method: "local-check" });
  const result = await close(fx.root, ["--completion-evidence", "evidence/receipts.json"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /level|journey|method/i);
});

test("changing target context after closure is detected by the command and Stop hook", async () => {
  const fx = await fixture(); receipt(fx);
  assert.equal((await close(fx.root, ["--completion-evidence", "evidence/receipts.json"])).code, 0);
  const context = JSON.parse(fs.readFileSync(path.join(fx.root, "evidence/context.json"), "utf8"));
  put(fx.root, "evidence/context.json", { ...context, revision: "revision-two" });
  const reread = await invoke(fx.root, ["task", "completion", "--id", "outcome"]);
  assert.equal(reread.json.completion.state, "STALE");
  const result = hook(fx.root, "Stop", { last_assistant_message: "Source work is complete; the client still needs verification." });
  assert.equal(result.decision, undefined);
  assert.match(result.systemMessage, /stale/i);
});

test("ordinary tools continue while a production completion claim is stopped", async () => {
  const { root } = await fixture();
  const edit = hook(root, "PreToolUse", { tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch\n*** Add File: src/example.mjs\n+export const value = 1;\n*** End Patch" } });
  assert.notEqual(edit.hookSpecificOutput?.permissionDecision, "deny");
  const report = hook(root, "Stop", { last_assistant_message: "Client verification is still pending." });
  assert.equal(report.decision, undefined);
  assert.match(report.systemMessage, /requested outcome.*unproven/i);
  const production = hook(root, "Stop", { production_delivery_claim: true, last_assistant_message: "The production work is complete." });
  assert.equal(production.decision, "block");
  assert.match(production.reason, /Production delivery is unproved/);
});

test("recorded proof obligations are checked by closure, not just exported helpers", async () => {
  const { root } = await fixture(false);
  recordObligation(root, { id: "durability", decision: "Preserve saved work", answer: "required", provenBy: "evidence/check.mjs" });
  assert.equal((await close(root)).code, 1);
  put(root, "evidence/check.mjs", "export const checked = true;\n");
  attestProofRun(root, { id: "durability", testFile: "evidence/check.mjs", command: "node evidence/check.mjs", exitCode: 0 });
  assert.equal((await close(root)).code, 0);
  markObligationProved(root, "durability", "another named result");
  assert.equal(readObligations(root).obligations[0].attested, false);
  assert.equal((await close(root)).code, 1);
});

test("recording a changed decision under an existing ID invalidates its old attestation", async () => {
  const { root } = await fixture(false);
  recordObligation(root, { id: "same", decision: "Old target", answer: "old", provenBy: "evidence/check.mjs" });
  put(root, "evidence/check.mjs", "export const checked = true;\n");
  attestProofRun(root, { id: "same", testFile: "evidence/check.mjs", command: "node evidence/check.mjs", exitCode: 0 });
  recordObligation(root, { id: "same", decision: "New target", answer: "new", provenBy: "evidence/check.mjs" });
  const entry = readObligations(root).obligations[0];
  assert.equal(entry.status, "UNPROVEN");
  assert.equal(entry.attested, false);
  assert.equal(entry.evidence_sha256, undefined);
});

test("an attested flag without a recorded successful run cannot clear the obligation gate", async () => {
  const { root } = await fixture(false);
  put(root, ".engineering/super-outer/proof-obligations.json", {
    schema_version: "1.0.0", obligations: [{ id: "missing-run", status: "PROVED", attested: true }],
  });
  const report = await invoke(root, ["task", "completion", "--id", "outcome"]);
  assert.equal(report.json.completion.obligations_pass, false);
  assert.equal((await close(root)).code, 1);
});

test("repository commit checks remain available with incomplete journey proof", async () => {
  const { root } = await fixture();
  put(root, ".engineering/super-outer/repository-enforcement.json", { enabled: true, base_ref: "main" });
  const commit = await invoke(root, ["repo", "verify", "--commit-gate"]);
  assert.equal(commit.code, 0, commit.err);
  const report = await invoke(root, ["repo", "verify"]);
  assert.equal(report.code, 0, report.err);
  assert.equal(report.json.completion.state, "UNPROVEN");
  assert.match(report.json.advisories.join(" "), /requested outcome/);
});

test("completion input rejects malformed contracts without replacing the current task", async () => {
  const fx = await fixture();
  const before = fs.readFileSync(path.join(fx.root, ".engineering/super-outer/current-task.json"), "utf8");
  put(fx.root, "evidence/bad.json", { schema_version: "1.0.0", claims: [fx.contract.claims[0], fx.contract.claims[0]] });
  const result = await invoke(fx.root, ["task", "completion", "--id", "outcome", "--completion-contract", "evidence/bad.json"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /Invalid completion contract/);
  assert.equal(fs.readFileSync(path.join(fx.root, ".engineering/super-outer/current-task.json"), "utf8"), before);
});

test("recording evidence or reordering the same contract preserves unchanged approval", async () => {
  const fx = await fixture();
  const file = path.join(fx.root, ".engineering/super-outer/tasks/outcome.json");
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  record.approval_digest = "a".repeat(64);
  record.approved_at = new Date().toISOString();
  put(fx.root, ".engineering/super-outer/tasks/outcome.json", record);
  receipt(fx);
  put(fx.root, "evidence/reordered.json", { claims: fx.contract.claims, schema_version: "1.0.0" });
  const same = await invoke(fx.root, ["task", "completion", "--id", "outcome", "--completion-contract", "evidence/reordered.json", "--completion-evidence", "evidence/receipts.json"]);
  assert.equal(same.code, 0, same.err);
  assert.equal(same.json.task.approval_digest, record.approval_digest);
  const changed = structuredClone(fx.contract); changed.claims[0].client = "different-client";
  put(fx.root, "evidence/changed.json", changed);
  const next = await invoke(fx.root, ["task", "completion", "--id", "outcome", "--completion-contract", "evidence/changed.json"]);
  assert.equal(next.code, 0, next.err);
  assert.equal(next.json.task.approval_digest, undefined);
});

test("invalid contract file errors do not expose its contents", async () => {
  const { root } = await fixture();
  put(root, "evidence/private.json", "private-fixture-value-that-must-not-appear");
  const result = await invoke(root, ["task", "completion", "--id", "outcome", "--completion-contract", "evidence/private.json"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /valid JSON.*repository-contained/);
  assert.doesNotMatch(result.err, /private-fixture-value/);
});

test("a malformed completion record does not disable ordinary tools", async () => {
  const { root } = await fixture();
  const current = ".engineering/super-outer/current-task.json";
  const record = JSON.parse(fs.readFileSync(path.join(root, current), "utf8"));
  record.completion_contract = { claims: "invalid" };
  put(root, current, record);
  const edit = hook(root, "PreToolUse", { tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch\n*** Add File: example.mjs\n+export const value = 1;\n*** End Patch" } });
  assert.notEqual(edit.hookSpecificOutput?.permissionDecision, "deny");
  const stop = hook(root, "Stop", { last_assistant_message: "Verification is incomplete." });
  assert.notEqual(stop.decision, "block");
  assert.match(stop.systemMessage, /failed/i);
});

test("reporting stale obligations never rewrites the ledger", async () => {
  const { root } = await fixture(false);
  const relative = ".engineering/super-outer/proof-obligations.json";
  recordObligation(root, { id: "readonly", decision: "Check the result", answer: "required", provenBy: "evidence/check.mjs" });
  put(root, "evidence/check.mjs", "export const original = true;\n");
  attestProofRun(root, { id: "readonly", testFile: "evidence/check.mjs", command: "node evidence/check.mjs", exitCode: 0 });
  const before = fs.readFileSync(path.join(root, relative));
  put(root, "evidence/check.mjs", "export const changed = true;\n");
  const report = taskCompletionReport(root);
  assert.equal(report.obligations_pass, false);
  assert.match(report.warnings.join(" "), /stale/);
  assert.deepEqual(fs.readFileSync(path.join(root, relative)), before);
});

test("an external ledger symlink is rejected without changing its target", async (t) => {
  const { root } = await fixture(false);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "so-external-ledger-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  recordObligation(root, { id: "external", decision: "Check the result", answer: "required", provenBy: "evidence/check.mjs" });
  put(root, "evidence/check.mjs", "export const original = true;\n");
  attestProofRun(root, { id: "external", testFile: "evidence/check.mjs", command: "node evidence/check.mjs", exitCode: 0 });
  const local = path.join(root, ".engineering/super-outer/proof-obligations.json");
  const target = path.join(external, "ledger.json");
  const before = fs.readFileSync(local);
  fs.copyFileSync(local, target); fs.unlinkSync(local); fs.symlinkSync(target, local);
  put(root, "evidence/check.mjs", "export const changed = true;\n");
  const report = taskCompletionReport(root);
  assert.equal(report.obligations_pass, false);
  assert.deepEqual(fs.readFileSync(target), before);
  assert.match(report.warnings.join(" "), /could not be checked/);
});

test("an obligation cannot rely on an external evidence symlink", async (t) => {
  const { root } = await fixture(false);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "so-external-proof-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  recordObligation(root, { id: "external-proof", decision: "Check the result", answer: "required", provenBy: "evidence/check.mjs" });
  put(root, "evidence/check.mjs", "export const original = true;\n");
  attestProofRun(root, { id: "external-proof", testFile: "evidence/check.mjs", command: "node evidence/check.mjs", exitCode: 0 });
  const local = path.join(root, "evidence/check.mjs");
  const target = path.join(external, "check.mjs");
  fs.copyFileSync(local, target); fs.unlinkSync(local); fs.symlinkSync(target, local);
  const report = taskCompletionReport(root);
  assert.equal(report.obligations_pass, false);
  assert.match(report.warnings.join(" "), /stale/);
});
