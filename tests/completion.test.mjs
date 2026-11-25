import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { completionContractDigest, evaluateCompletion, validateCompletionContract } from "../src/completion.mjs";

const NOW = "2026-09-12T10:00:00.000Z";
const LEVELS = ["source", "ci", "package", "installation", "host-discovery", "runtime", "journey", "intent-conformance", "owner-acceptance", "scheduled", "published", "publication-verified"];
const DIRECT = new Set(["ci", "host-discovery", "runtime", "journey", "intent-conformance", "owner-acceptance", "scheduled", "published", "publication-verified"]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (root, filename, contents) => {
  fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
  fs.writeFileSync(path.join(root, filename), contents);
};
const json = (root, filename, value) => write(root, filename, `${JSON.stringify(value)}\n`);
const hashFile = (root, filename) => digest(fs.readFileSync(path.join(root, filename)));

const fixture = (t, levels = ["journey"]) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-completion-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contract = {
    schema_version: "1.0.0",
    claims: levels.map((level, index) => ({
      id: `claim-${index + 1}`, level, actor_ref: "test-actor", client: "intended-client",
      environment: "test-environment", action: "Read the saved record", expected_result: "The saved record contains the expected value",
      context_file: `proof/context-${index + 1}.json`,
    })),
  };
  for (const [index, claim] of contract.claims.entries()) {
    json(root, claim.context_file, {
      actor_ref: claim.actor_ref, client: claim.client, environment: claim.environment,
      route: "service-route", revision: "build-1", permissions: "read-record", artifact_ref: `record-${index + 1}`,
    });
    write(root, `proof/evidence-${index + 1}.txt`, "The intended client returned the expected saved value.\n");
  }
  const receipt = {
    schema_version: "1.0.0",
    claims: contract.claims.map((claim, index) => ({
      id: claim.id, level: claim.level, contract_sha256: completionContractDigest(contract),
      context_sha256: hashFile(root, claim.context_file), status: "PASS",
      observed_at: "2026-09-12T09:00:00.000Z", expires_at: "2026-09-12T11:00:00.000Z",
      evidence_file: `proof/evidence-${index + 1}.txt`, evidence_sha256: hashFile(root, `proof/evidence-${index + 1}.txt`),
      method: DIRECT.has(claim.level) ? "direct-observation" : "local-check",
    })),
  };
  const evidencePath = "proof/completion-receipt.json";
  const save = () => json(root, evidencePath, receipt);
  save();
  return { root, contract, receipt, evidencePath, save, evaluate: (options = {}) => evaluateCompletion(root, { contract, evidencePath, now: NOW, ...options }) };
};

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ciFixture = (t) => {
  const fx = fixture(t, ["ci"]);
  git(fx.root, "init", "-b", "main");
  git(fx.root, "config", "user.name", "Test");
  git(fx.root, "config", "user.email", "test@example.invalid");
  write(fx.root, "README.md", "CI fixture\n");
  git(fx.root, "add", "README.md");
  git(fx.root, "commit", "-m", "fixture source");
  const head = git(fx.root, "rev-parse", "HEAD");
  const context = JSON.parse(fs.readFileSync(path.join(fx.root, fx.contract.claims[0].context_file), "utf8"));
  context.revision = head;
  json(fx.root, fx.contract.claims[0].context_file, context);
  fx.receipt.claims[0].context_sha256 = hashFile(fx.root, fx.contract.claims[0].context_file);
  const ciClaim = { provider: "github-actions", repository: "example/fixture", workflow: "Source checks", run_id: "12345", status: "completed", conclusion: "success", head_sha: head };
  const saveClaim = () => {
    json(fx.root, fx.receipt.claims[0].evidence_file, ciClaim);
    fx.receipt.claims[0].evidence_sha256 = hashFile(fx.root, fx.receipt.claims[0].evidence_file);
    fx.save();
  };
  saveClaim();
  return { ...fx, head, context, ciClaim, saveClaim, live: { ...ciClaim, verified_by: "github-api-live", valid: true } };
};

test("valid source and direct observations prove only their current required levels", (t) => {
  const levels = LEVELS.filter((level) => level !== "ci");
  const fx = fixture(t, levels);
  const before = fs.readFileSync(path.join(fx.root, fx.evidencePath));
  const result = fx.evaluate();
  assert.equal(result.state, "PROVED");
  assert.equal(result.pass, true);
  assert.deepEqual(result.claims.map(({ level }) => level), levels);
  assert.ok(result.claims.every(({ state }) => state === "PROVED"));
  assert.match(result.limitation, /cannot authenticate the observer or detect unobserved external changes/);
  assert.match(result.limitation, /Runtime context must be refreshed from the actual target/);
  assert.deepEqual(fs.readFileSync(path.join(fx.root, fx.evidencePath)), before);
});

test("CI proof resolves the named live run and binds it to the current repository head", (t) => {
  const fx = ciFixture(t);
  let calls = 0;
  const result = fx.evaluate({ ciEvidenceResolver: ({ cwd, claim }) => {
    calls += 1;
    assert.equal(cwd, fx.root);
    assert.deepEqual(claim, fx.ciClaim);
    return fx.live;
  } });
  assert.equal(calls, 1);
  assert.equal(result.state, "PROVED");
  assert.equal(result.pass, true);
});

test("caller-authored CI PASS metadata is insufficient without live verification", (t) => {
  const fx = ciFixture(t);
  Object.assign(fx.ciClaim, { verified_by: "github-api-live", valid: true });
  fx.saveClaim();
  // The real verifier refuses this fixture before any network call because it has no origin.
  const result = fx.evaluate();
  assert.equal(result.state, "UNPROVEN");
  assert.match(result.claims[0].reason, /could not be verified live/);
  for (const live of [null, {}, { ...fx.live, valid: false }, { ...fx.live, valid: "true" }, { ...fx.live, verified_by: "local-record" }]) {
    assert.equal(fx.evaluate({ ciEvidenceResolver: () => live }).state, "UNPROVEN");
  }
});

test("CI resolver failure stays unproven and never exposes its private error text", (t) => {
  const fx = ciFixture(t);
  const result = fx.evaluate({ ciEvidenceResolver: () => { throw new Error("private-token and private-repository-path"); } });
  assert.equal(result.state, "UNPROVEN");
  assert.doesNotMatch(JSON.stringify(result), /private-token|private-repository-path/);
  assert.equal(fx.evaluate({ ciEvidenceResolver: null }).state, "UNPROVEN");
});

test("live CI must match the exact provider, repository, workflow and run", (t) => {
  const fx = ciFixture(t);
  for (const [key, value] of [["provider", "other-provider"], ["repository", "example/other"], ["workflow", "Other checks"], ["run_id", "54321"]]) {
    const result = fx.evaluate({ ciEvidenceResolver: () => ({ ...fx.live, [key]: value }) });
    assert.equal(result.state, "FAILED", key);
    assert.match(result.claims[0].reason, /does not match/);
  }
  assert.equal(fx.evaluate({ ciEvidenceResolver: () => ({ ...fx.live, repository: "EXAMPLE/FIXTURE" }) }).state, "PROVED");
});

test("pending, failed and stale live CI results never prove completion", (t) => {
  const fx = ciFixture(t);
  assert.equal(fx.evaluate({ ciEvidenceResolver: () => ({ ...fx.live, status: "in_progress" }) }).state, "UNPROVEN");
  assert.equal(fx.evaluate({ ciEvidenceResolver: () => ({ ...fx.live, conclusion: "failure" }) }).state, "FAILED");
  assert.equal(fx.evaluate({ ciEvidenceResolver: () => ({ ...fx.live, head_sha: "f".repeat(40) }) }).state, "STALE");
});

test("CI context must identify the current Git revision before a live lookup", (t) => {
  const fx = ciFixture(t);
  fx.context.revision = "not-applicable";
  json(fx.root, fx.contract.claims[0].context_file, fx.context);
  fx.receipt.claims[0].context_sha256 = hashFile(fx.root, fx.contract.claims[0].context_file);
  fx.save();
  let calls = 0;
  assert.equal(fx.evaluate({ ciEvidenceResolver: () => { calls += 1; return fx.live; } }).state, "STALE");
  assert.equal(calls, 0);

  fx.context.revision = fx.head;
  json(fx.root, fx.contract.claims[0].context_file, fx.context);
  fx.receipt.claims[0].context_sha256 = hashFile(fx.root, fx.contract.claims[0].context_file);
  fx.save();
  git(fx.root, "commit", "--allow-empty", "-m", "new source revision");
  assert.equal(fx.evaluate({ ciEvidenceResolver: () => fx.live }).state, "STALE");
});

test("CI artifacts must name a GitHub Actions run and local checks cannot substitute", (t) => {
  const fx = ciFixture(t);
  let calls = 0;
  const resolver = () => { calls += 1; return fx.live; };
  for (const bytes of ["not JSON", "null", "[]", '{"status":"PASS"}', JSON.stringify({ ...fx.ciClaim, workflow: "" }), JSON.stringify({ ...fx.ciClaim, run_id: "../../other" })]) {
    write(fx.root, fx.receipt.claims[0].evidence_file, bytes);
    fx.receipt.claims[0].evidence_sha256 = hashFile(fx.root, fx.receipt.claims[0].evidence_file);
    fx.save();
    assert.equal(fx.evaluate({ ciEvidenceResolver: resolver }).state, "FAILED");
  }
  assert.equal(calls, 0);
  fx.saveClaim();
  fx.receipt.claims[0].method = "local-check";
  fx.save();
  assert.equal(fx.evaluate({ ciEvidenceResolver: resolver }).state, "UNPROVEN");
  assert.equal(calls, 0);
});

test("a repository change during live CI verification invalidates the result", (t) => {
  const fx = ciFixture(t);
  const result = fx.evaluate({ ciEvidenceResolver: () => {
    git(fx.root, "commit", "--allow-empty", "-m", "revision changed during lookup");
    return fx.live;
  } });
  assert.equal(result.state, "STALE");
  assert.equal(result.pass, false);
  assert.match(result.claims[0].reason, /current repository head/);
});

test("contract digest is deterministic across key and claim order without mutating inputs", (t) => {
  const fx = fixture(t, ["source", "journey"]);
  const before = JSON.stringify(fx.contract);
  const reordered = {
    claims: [...fx.contract.claims].reverse().map((claim) => Object.fromEntries(Object.entries(claim).reverse())),
    schema_version: "1.0.0",
  };
  assert.match(completionContractDigest(fx.contract), /^[a-f0-9]{64}$/);
  assert.equal(completionContractDigest(fx.contract), completionContractDigest(reordered));
  assert.equal(JSON.stringify(fx.contract), before);
});

test("contract validation rejects malformed, blank, duplicate and oversized values", (t) => {
  const fx = fixture(t);
  for (const value of [undefined, null, "", [], 1, {}, { schema_version: "1.0.0", claims: [] }]) {
    assert.equal(validateCompletionContract(value).valid, false);
  }
  for (const field of ["id", "actor_ref", "client", "environment", "action", "expected_result", "context_file", "level"]) {
    for (const value of [undefined, null, "", " ", 0]) {
      const contract = structuredClone(fx.contract);
      contract.claims[0][field] = value;
      assert.equal(validateCompletionContract(contract).valid, false, `${field}: ${String(value)}`);
    }
  }
  for (const change of [
    (contract) => contract.claims.push({ ...contract.claims[0] }),
    (contract) => { contract.claims = Array.from({ length: 33 }, (_, i) => ({ ...contract.claims[0], id: `id-${i}` })); },
    (contract) => { contract.claims[0].actor_ref = "account@example.invalid"; },
    (contract) => { contract.claims[0].action = "x".repeat(2049); },
    (contract) => { contract.claims[0].action = "read\nrecord"; },
    (contract) => { contract.claims[0].token = "not-allowed"; },
    (contract) => { contract.extra = true; },
    (contract) => { contract.schema_version = "legacy"; },
  ]) {
    const contract = structuredClone(fx.contract);
    change(contract);
    assert.equal(validateCompletionContract(contract).valid, false);
    assert.throws(() => completionContractDigest(contract));
    const result = fx.evaluate({ contract });
    assert.equal(result.state, "FAILED");
    assert.equal(result.pass, false);
    assert.ok(result.reason.length > 0);
  }
});

test("legacy records without a completion contract never acquire user-outcome proof", (t) => {
  const fx = fixture(t);
  for (const contract of [undefined, null]) {
    const result = fx.evaluate({ contract });
    assert.equal(result.state, "NOT_RECORDED");
    assert.equal(result.pass, false);
    assert.deepEqual(result.claims, []);
    assert.match(result.reason, /does not establish a user outcome/);
  }
  assert.equal(fx.evaluate({ contract: "" }).state, "FAILED");
});

test("missing receipt and missing individual observations remain unproven", (t) => {
  const fx = fixture(t, ["source", "journey"]);
  for (const evidencePath of [undefined, null, "", "proof/missing.json"]) {
    const result = fx.evaluate({ evidencePath });
    assert.equal(result.state, "UNPROVEN");
    assert.equal(result.pass, false);
  }
  fx.receipt.claims.pop();
  fx.save();
  const result = fx.evaluate();
  assert.equal(result.state, "UNPROVEN");
  assert.deepEqual(result.claims.map(({ state }) => state), ["PROVED", "UNPROVEN"]);
  fx.receipt.claims = [];
  fx.save();
  assert.ok(fx.evaluate().claims.every(({ state }) => state === "UNPROVEN"));
});

test("a local check cannot prove runtime, journey, scheduling or publication outcomes", (t) => {
  const fx = fixture(t, [...DIRECT]);
  for (const claim of fx.receipt.claims) claim.method = "local-check";
  fx.save();
  const result = fx.evaluate();
  assert.equal(result.state, "UNPROVEN");
  assert.ok(result.claims.every(({ reason }) => /requires a direct observation/.test(reason)));
});

test("cross-level evidence cannot substitute source, schedule or publication proof", (t) => {
  for (const [required, supplied] of [["journey", "source"], ["published", "scheduled"], ["publication-verified", "published"], ["installation", "package"]]) {
    const fx = fixture(t, [required]);
    fx.receipt.claims[0].level = supplied;
    fx.save();
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED");
    assert.match(result.claims[0].reason, /different proof level/);
  }
});

test("host discovery requires direct observation in the named client", (t) => {
  const fx = fixture(t, ["host-discovery"]);
  fx.receipt.claims[0].method = "local-check";
  fx.save();
  const local = fx.evaluate();
  assert.equal(local.state, "UNPROVEN");
  assert.equal(local.pass, false);
  assert.match(local.claims[0].reason, /requires a direct observation in the intended client/);

  fx.receipt.claims[0].method = "direct-observation";
  fx.save();
  const observed = fx.evaluate();
  assert.equal(observed.state, "PROVED");
  assert.equal(observed.pass, true);
  assert.equal(observed.claims[0].level, "host-discovery");
});

test("an intent review and the owner's acceptance each need their own direct observation", (t) => {
  // A passing journey cannot stand in for the rendered review against the
  // product intent, and that review cannot stand in for the owner's acceptance.
  for (const [required, supplied] of [["intent-conformance", "journey"], ["owner-acceptance", "intent-conformance"], ["intent-conformance", "owner-acceptance"]]) {
    const fx = fixture(t, [required]);
    fx.receipt.claims[0].level = supplied;
    fx.save();
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED", `${supplied} for ${required}`);
    assert.match(result.claims[0].reason, /different proof level/);
  }
  for (const level of ["intent-conformance", "owner-acceptance"]) {
    const fx = fixture(t, [level]);
    assert.equal(validateCompletionContract(fx.contract).valid, true, level);
    assert.equal(fx.evaluate().state, "PROVED", level);
    fx.receipt.claims[0].method = "local-check";
    fx.save();
    const local = fx.evaluate();
    assert.equal(local.state, "UNPROVEN", level);
    assert.match(local.claims[0].reason, /requires a direct observation in the intended client/);
  }
});

test("changed actor, client, environment, action or expected result invalidates prior evidence", (t) => {
  for (const field of ["actor_ref", "client", "environment", "action", "expected_result"]) {
    const fx = fixture(t);
    fx.contract.claims[0][field] = "different-value";
    const result = fx.evaluate();
    assert.equal(result.state, "STALE", field);
    assert.match(result.claims[0].reason, /contract changed/);
  }
});

test("route, revision, permissions and artifact identity changes stale only the affected context", (t) => {
  for (const field of ["route", "revision", "permissions", "artifact_ref"]) {
    const fx = fixture(t, ["source", "journey"]);
    const filename = fx.contract.claims[1].context_file;
    const context = JSON.parse(fs.readFileSync(path.join(fx.root, filename), "utf8"));
    context[field] = "changed";
    json(fx.root, filename, context);
    const result = fx.evaluate();
    assert.equal(result.state, "STALE", field);
    assert.deepEqual(result.claims.map(({ state }) => state), ["PROVED", "STALE"]);
    assert.match(result.claims[1].reason, /context changed/);
  }
});

test("direct observations require explicit target identity and relevant context fields", (t) => {
  const fx = fixture(t, [...DIRECT]);
  for (const claim of fx.contract.claims) {
    json(fx.root, claim.context_file, { note: "no target identity" });
    fx.receipt.claims.find(({ id }) => id === claim.id).context_sha256 = hashFile(fx.root, claim.context_file);
  }
  fx.save();
  const result = fx.evaluate();
  assert.equal(result.state, "FAILED");
  assert.ok(result.claims.every(({ state }) => state === "FAILED"));
  assert.ok(result.claims.every(({ reason }) => /actor_ref|client|environment|route/.test(reason)));
});

test("direct context identities must match the intended actor, client and environment", (t) => {
  for (const field of ["actor_ref", "client", "environment"]) {
    const fx = fixture(t);
    const filename = fx.contract.claims[0].context_file;
    const context = JSON.parse(fs.readFileSync(path.join(fx.root, filename), "utf8"));
    context[field] = "different-target";
    json(fx.root, filename, context);
    fx.receipt.claims[0].context_sha256 = hashFile(fx.root, filename);
    fx.save();
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED", field);
    assert.match(result.claims[0].reason, /does not match the intended/);
  }
});

test("direct context fields reject missing, blank, structured and oversized values", (t) => {
  const fx = fixture(t);
  const filename = fx.contract.claims[0].context_file;
  const original = JSON.parse(fs.readFileSync(path.join(fx.root, filename), "utf8"));
  for (const field of ["actor_ref", "client", "environment", "route", "revision", "permissions", "artifact_ref"]) {
    for (const value of [undefined, null, "", " ", [], {}, "x".repeat((field === "route" ? 1024 : 256) + 1)]) {
      json(fx.root, filename, { ...original, [field]: value });
      fx.receipt.claims[0].context_sha256 = hashFile(fx.root, filename);
      fx.save();
      assert.equal(fx.evaluate().state, "FAILED", `${field}: ${typeof value}`);
    }
  }
});

test("direct context supports logical routes and explicit not-applicable fields", (t) => {
  const fx = fixture(t);
  const filename = fx.contract.claims[0].context_file;
  for (const route of ["local-command", "/local/path", "custom:logical-route", "https://service.example.invalid/mcp", "not-applicable"]) {
    json(fx.root, filename, {
      actor_ref: fx.contract.claims[0].actor_ref, client: fx.contract.claims[0].client, environment: fx.contract.claims[0].environment,
      route, revision: "not-applicable", permissions: "not-applicable", artifact_ref: "not-applicable",
    });
    fx.receipt.claims[0].context_sha256 = hashFile(fx.root, filename);
    fx.save();
    assert.equal(fx.evaluate().state, "PROVED", route);
  }
});

test("URL routes cannot contain credentials, queries or fragments", (t) => {
  const fx = fixture(t);
  const filename = fx.contract.claims[0].context_file;
  const context = JSON.parse(fs.readFileSync(path.join(fx.root, filename), "utf8"));
  for (const route of [
    "https://user:password@service.example.invalid/mcp", "https://user@service.example.invalid/mcp",
    "https://service.example.invalid/mcp?token=private", "https://service.example.invalid/mcp#private",
    "https://service.example.invalid/mcp?", "//service.example.invalid/mcp?token=private", "https://",
  ]) {
    json(fx.root, filename, { ...context, route });
    fx.receipt.claims[0].context_sha256 = hashFile(fx.root, filename);
    fx.save();
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED");
    assert.match(result.claims[0].reason, /route/);
    assert.doesNotMatch(result.claims[0].reason, /password|token=private|example\.invalid/);
  }
});

test("source context remains usable without downstream client identity fields", (t) => {
  const fx = fixture(t, ["source"]);
  const filename = fx.contract.claims[0].context_file;
  json(fx.root, filename, { revision: "source-revision" });
  fx.receipt.claims[0].context_sha256 = hashFile(fx.root, filename);
  fx.save();
  assert.equal(fx.evaluate().state, "PROVED");
});

test("context and observation evidence use byte hashes", (t) => {
  const fx = fixture(t);
  fs.appendFileSync(path.join(fx.root, fx.contract.claims[0].context_file), "\n");
  assert.equal(fx.evaluate().state, "STALE");
  fx.receipt.claims[0].context_sha256 = hashFile(fx.root, fx.contract.claims[0].context_file);
  fx.save();
  assert.equal(fx.evaluate().state, "PROVED");
  fs.appendFileSync(path.join(fx.root, fx.receipt.claims[0].evidence_file), "changed\n");
  assert.equal(fx.evaluate().state, "STALE");
  assert.match(fx.evaluate().claims[0].reason, /evidence changed/);
});

test("missing context or observation evidence is stale and an empty artifact fails", (t) => {
  for (const which of ["context", "evidence"]) {
    const fx = fixture(t);
    const filename = which === "context" ? fx.contract.claims[0].context_file : fx.receipt.claims[0].evidence_file;
    fs.unlinkSync(path.join(fx.root, filename));
    assert.equal(fx.evaluate().state, "STALE");
    assert.match(fx.evaluate().claims[0].reason, /missing/);
  }
  const fx = fixture(t);
  write(fx.root, fx.receipt.claims[0].evidence_file, "");
  assert.equal(fx.evaluate().state, "FAILED");
  assert.match(fx.evaluate().claims[0].reason, /empty/);
});

test("a current recorded failure cannot produce a passing completion", (t) => {
  const fx = fixture(t, ["source", "journey"]);
  fx.receipt.claims[1].status = "FAIL";
  fx.save();
  const result = fx.evaluate();
  assert.equal(result.state, "FAILED");
  assert.equal(result.pass, false);
  assert.deepEqual(result.claims.map(({ state }) => state), ["PROVED", "FAILED"]);
  assert.match(result.claims[1].reason, /observation failed/);
});

test("expired observations are stale including exactly at their expiry time", (t) => {
  const fx = fixture(t);
  for (const expires_at of ["2026-09-12T09:30:00.000Z", NOW]) {
    fx.receipt.claims[0].expires_at = expires_at;
    fx.save();
    assert.equal(fx.evaluate().state, "STALE");
    assert.match(fx.evaluate().claims[0].reason, /expired/);
  }
});

test("future, impossible and non-finite observation timestamps are rejected", (t) => {
  const fx = fixture(t);
  const original = fx.receipt.claims[0].observed_at;
  for (const observed_at of ["2026-09-12T10:01:00.000Z", "2026-02-30T09:00:00Z", "2026-09-12", "2026-09-12T24:00:00Z", "2026-09-12T09:00:00+24:00", "2026-09-12T09:00:00Z\n", "", null, 0, "Infinity", "NaN"]) {
    fx.receipt.claims[0].observed_at = observed_at;
    fx.save();
    assert.equal(fx.evaluate().state, "FAILED", String(observed_at));
  }
  fx.receipt.claims[0].observed_at = original;
  fx.receipt.claims[0].expires_at = original;
  fx.save();
  assert.equal(fx.evaluate().state, "FAILED");
});

test("equivalent timezone offsets and finite evaluation clocks are supported", (t) => {
  const fx = fixture(t);
  fx.receipt.claims[0].observed_at = "2026-09-12T14:30:00+05:30";
  fx.receipt.claims[0].expires_at = "2026-09-12T16:30:00+05:30";
  fx.save();
  for (const now of [NOW, Date.parse(NOW), new Date(NOW)]) assert.equal(fx.evaluate({ now }).state, "PROVED");
  for (const now of [null, "", Infinity, NaN, new Date(NaN)]) assert.equal(fx.evaluate({ now }).state, "FAILED");
});

test("malformed receipts fail clearly without throwing or accepting a bare PASS", (t) => {
  const fx = fixture(t);
  for (const value of [null, "", [], {}, { status: "PASS" }, { schema_version: "1.0.0", claims: [null] }]) {
    json(fx.root, fx.evidencePath, value);
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED");
    assert.ok(result.reason.length > 0);
  }
  for (const bytes of ["", " ", "{bad json}"]) {
    write(fx.root, fx.evidencePath, bytes);
    assert.equal(fx.evaluate().state, "FAILED");
  }
  fx.save();
  fx.receipt.claims.push({ ...fx.receipt.claims[0] });
  fx.save();
  assert.match(fx.evaluate().reason, /repeats a claim id/);
  fx.receipt.claims[1].id = "unrelated-claim";
  fx.save();
  assert.match(fx.evaluate().reason, /outside this contract/);
});

test("receipt required fields reject blank, null and unsupported metadata", (t) => {
  const fx = fixture(t);
  for (const field of ["id", "level", "contract_sha256", "context_sha256", "status", "observed_at", "expires_at", "evidence_file", "evidence_sha256", "method"]) {
    const original = fx.receipt.claims[0][field];
    for (const value of [undefined, null, "", " "]) {
      fx.receipt.claims[0][field] = value;
      fx.save();
      assert.equal(fx.evaluate().state, "FAILED", `${field}: ${String(value)}`);
    }
    fx.receipt.claims[0][field] = original;
  }
  fx.receipt.claims[0].credential = "unsupported";
  fx.save();
  assert.match(fx.evaluate().reason, /unsupported fields/);
  assert.doesNotMatch(fx.evaluate().reason, /credential|unsupported"/);
});

test("contexts must be non-empty JSON objects", (t) => {
  const fx = fixture(t);
  for (const value of [null, [], {}, "", 0]) {
    json(fx.root, fx.contract.claims[0].context_file, value);
    fx.receipt.claims[0].context_sha256 = hashFile(fx.root, fx.contract.claims[0].context_file);
    fx.save();
    assert.equal(fx.evaluate().state, "FAILED");
    assert.match(fx.evaluate().claims[0].reason, /non-empty JSON object/);
  }
  write(fx.root, fx.contract.claims[0].context_file, "not JSON");
  assert.equal(fx.evaluate().state, "FAILED");
});

test("absolute paths, traversal and platform-specific path escapes are rejected", (t) => {
  const fx = fixture(t);
  for (const filename of ["../outside.json", "proof/../../outside.json", "/tmp/outside.json", "C:\\outside.json", "..\\outside.json", "file:///tmp/outside.json", ".", "proof/../context.json"]) {
    assert.equal(fx.evaluate({ evidencePath: filename }).state, "FAILED", filename);
    const contract = structuredClone(fx.contract);
    contract.claims[0].context_file = filename;
    assert.equal(validateCompletionContract(contract).valid, false, filename);
    fx.receipt.claims[0].evidence_file = filename;
    fx.save();
    assert.equal(fx.evaluate().state, "FAILED", filename);
  }
});

test("receipt, context and artifact symlinks cannot escape the repository", (t) => {
  for (const kind of ["receipt", "context", "evidence"]) {
    const fx = fixture(t);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-completion-outside-"));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    const filename = kind === "receipt" ? fx.evidencePath : kind === "context" ? fx.contract.claims[0].context_file : fx.receipt.claims[0].evidence_file;
    const bytes = fs.readFileSync(path.join(fx.root, filename));
    write(outside, "target", bytes);
    fs.unlinkSync(path.join(fx.root, filename));
    fs.symlinkSync(path.join(outside, "target"), path.join(fx.root, filename));
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED", kind);
    assert.match(result.claims[0].reason, /outside the repository/, kind);
  }
});

test("symlinked parent directories cannot escape and contained symlinks remain valid", (t) => {
  const fx = fixture(t);
  fs.symlinkSync(path.join(fx.root, "proof"), path.join(fx.root, "contained"));
  assert.equal(fx.evaluate({ evidencePath: "contained/completion-receipt.json" }).state, "PROVED");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-completion-directory-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  write(outside, "receipt.json", fs.readFileSync(path.join(fx.root, fx.evidencePath)));
  fs.symlinkSync(outside, path.join(fx.root, "outside"));
  assert.equal(fx.evaluate({ evidencePath: "outside/receipt.json" }).state, "FAILED");
});

test("oversized receipts, contexts and evidence are rejected before unbounded reads", (t) => {
  for (const kind of ["receipt", "context", "evidence"]) {
    const fx = fixture(t);
    const filename = kind === "receipt" ? fx.evidencePath : kind === "context" ? fx.contract.claims[0].context_file : fx.receipt.claims[0].evidence_file;
    write(fx.root, filename, Buffer.alloc((kind === "evidence" ? 8 : 1) * 1024 * 1024 + 1, 32));
    const result = fx.evaluate();
    assert.equal(result.state, "FAILED", kind);
    assert.match(result.claims[0].reason, /file size/, kind);
  }
});

test("directories and unreadable roots cannot be treated as evidence files", (t) => {
  const fx = fixture(t);
  assert.equal(fx.evaluate({ evidencePath: "proof" }).state, "FAILED");
  const result = evaluateCompletion(null, { contract: fx.contract, evidencePath: fx.evidencePath, now: NOW });
  assert.equal(result.state, "FAILED");
  assert.equal(result.pass, false);
});
