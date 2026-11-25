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
import { routeTask } from "../src/router.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";
import { recordObligation } from "../src/sequencing.mjs";

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const SKILL_REFS = path.resolve("skills/super-outer/references");
const ROUTE_LINE = `This may be a user-facing new feature or redesign. For those, Super-outer records the product intent, asks only the design questions that change the outcome, and renders the main working screen for the owner before any screen is built: ${path.join(SKILL_REFS, "product-intent.md")} and ${path.join(SKILL_REFS, "design-package.md")}. A small visual correction needs only a before and after render.`;
const REVIEW_MISSING = "This task needs a design review before it can be called done. The rendered review against the product intent and the owner's acceptance are not both recorded.";
const PACKAGE_CHANGED = "The design package changed after this task recorded it, so builders and reviewers may be working from different versions.";
const PACKAGE_FOLDER = ".engineering/super-outer/design/editor/v1";
const MANIFEST = `${PACKAGE_FOLDER}/manifest.json`;

// Each hook test runs once in each enforcement mode. The test sets the mode
// itself instead of inheriting it from the shell, for the reason given in
// tests/hooks.test.mjs: a test that reads the shell only tests one machine.
const ENFORCEMENT_MODES = [undefined, "advisory"];
const modeName = (mode) => mode ?? "default";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = (root, file, value) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
};
const temporary = (t, prefix) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const callHook = (t, root, event, input, mode) => {
  const env = isolatedEnv({ NO_COLOR: "1", SUPER_OUTER_STATE_DIR: temporary(t, "so-design-hook-state-") });
  delete env.SUPER_OUTER_ENFORCEMENT;
  if (mode) env.SUPER_OUTER_ENFORCEMENT = mode;
  const result = spawnSync(process.execPath, [HOOK, event], {
    cwd: root,
    env,
    encoding: "utf8",
    input: JSON.stringify({ cwd: root, session_id: "design-session", client: "coding-host", ...input }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
};
const routeContext = (t, root, prompt, mode) =>
  callHook(t, root, "UserPromptSubmit", { prompt }, mode).hookSpecificOutput?.additionalContext ?? "";

const WITH_DESIGN_PATH = [
  "Build a new writing editor where selecting a passage shows sources beside it",
  "Redesign the folder screen and rename the tabs",
  "Add a coaching dashboard in the mobile app backed by a new API endpoint",
];
const WITHOUT_DESIGN_PATH = [
  "Fix the timeout on the research endpoint",
  "fix the typo in the header",
  "Make the header buttons less prominent",
  "build the app and run the tests",
  "Add a new API endpoint that stores records in the database",
];

for (const mode of ENFORCEMENT_MODES) {
  test(`a user-facing new feature or redesign is handed the design path (${modeName(mode)} enforcement)`, (t) => {
    const root = temporary(t, "so-design-route-");
    for (const prompt of WITH_DESIGN_PATH) {
      const context = routeContext(t, root, prompt, mode);
      assert.ok(context.endsWith(` ${ROUTE_LINE}`), `${prompt}\n${context}`);
      assert.match(context, /Specialists: [^.]*product-ui-ux-motion/, prompt);
    }
  });

  test(`other work is not handed the design path (${modeName(mode)} enforcement)`, (t) => {
    const root = temporary(t, "so-design-route-");
    for (const prompt of WITHOUT_DESIGN_PATH) {
      assert.doesNotMatch(routeContext(t, root, prompt, mode), /product intent|design-package\.md/, prompt);
    }
  });

  test(`a small visual correction worded as a feature gets only the conditional line (${modeName(mode)} enforcement)`, (t) => {
    const root = temporary(t, "so-design-route-");
    const context = routeContext(t, root, "Add padding to the settings screen", mode);
    assert.ok(context.endsWith(` ${ROUTE_LINE}`), context);
    assert.match(context, /This may be a user-facing new feature or redesign\. For those, Super-outer records the product intent/);
    assert.match(context, /A small visual correction needs only a before and after render\.$/);
    // The hook only names the possibility. It records no design requirement.
    assert.equal(fs.existsSync(path.join(root, ".engineering")), false);
  });
}

test("a visible surface brings in the product UI specialist unless the request rules UI work out", () => {
  const editor = routeTask({ description: "Build a new writing editor where selecting a passage shows sources beside it" });
  assert.equal(editor.change_shape.shape, "new_feature");
  assert.deepEqual(editor.selected_modules, ["product-ui-ux-motion"]);
  assert.ok(editor.scores["product-ui-ux-motion"].reasons.includes("trigger:inferred:visible_surface"));
  assert.ok(editor.signals.includes("surface:visibleProduct"));

  const excluded = routeTask({ description: "Build a new admin dashboard without any UI changes" });
  assert.ok(excluded.change_shape.reasons.includes("visible_surface"));
  assert.ok(!excluded.selected_modules.includes("product-ui-ux-motion"));

  // A full-stack feature with a visible surface keeps the specialist, and a
  // service and storage change with no visible surface does not gain it.
  const fullStack = routeTask({ description: "Add a coaching dashboard in the mobile app backed by a new API endpoint" });
  assert.equal(fullStack.change_shape.shape, "coordinated_cross_system_change");
  assert.ok(fullStack.selected_modules.includes("product-ui-ux-motion"));
  const service = routeTask({ description: "Add a new API endpoint that stores records in the database" });
  assert.equal(service.change_shape.shape, "coordinated_cross_system_change");
  assert.ok(!service.selected_modules.includes("product-ui-ux-motion"));
});

// The 5.7.0 failure scout wrote these. Each keeps the screens as they are.
test("a request that keeps the screens as they are never gets the product UI specialist", () => {
  for (const description of [
    "Build a new admin dashboard with no UI changes",
    "Build a new admin dashboard, but don't change the UI",
    "Build a new reports page, backend only",
    "Build the new reports page API only, no frontend work",
    "Redesign the dashboard without changing the UI",
    "Redesign the dashboard data layer without touching the UI",
    "Rebuild the dashboard backend; the screen stays the same",
    "Create a new editor service with no UI",
    "Build a new inbox API, no visual changes",
    "Replace the editor's storage layer; no UI work",
    "Overhaul the onboarding flow logic but leave the screens unchanged",
    "Build a headless dashboard API",
    "add an admin endpoint to reset a user's quota, no ui needed",
    "Build a new reports API, no UI",
    "Build a new reports API with zero UI changes",
    "Build a new export service and leave the UI alone",
    "Add a new endpoint for the mobile app; the UI is unchanged",
    "Keep the UI exactly as it is and overhaul the sync logic",
    "Build the export API; UI changes are out of scope",
    "Build a new dashboard, but not the UI yet, just the data layer",
  ]) {
    assert.ok(!routeTask({ description }).selected_modules.includes("product-ui-ux-motion"), description);
  }
});

/**
 * A writing app. Its journey can pass while the combined screen breaks the
 * intent, for example when the header shows five equally prominent buttons
 * and the passage being written is no longer the main object on the screen.
 */
const CLAIMS = {
  journey: {
    action: "Open the editor, write a passage and select it",
    expected_result: "The sources for the selected passage appear beside it",
    evidence: "The passage was saved and its sources appeared beside it.\n",
  },
  "intent-conformance": {
    action: "Render the main writing screen and compare it with the recorded product intent",
    expected_result: "The passage stays the main object on the screen and nothing in the header competes with it",
    evidence: "The rendered main writing screen keeps the passage as the main object.\n",
  },
  "owner-acceptance": {
    action: "Show the owner the rendered main writing screen",
    expected_result: "The owner accepts the main writing screen as built",
    evidence: "The owner accepted the main writing screen.\n",
  },
};
const ALL_LEVELS = Object.keys(CLAIMS);
const REQUIRED = { required: true, reason: "A new writing editor is a user-facing new feature." };
const FIVE_BUTTONS = "The header shows five equally prominent buttons, so the passage is no longer the main object on the screen.\n";

const invoke = async (root, args) => {
  let out = "";
  let err = "";
  const code = await runCli(args, { cwd: root, stdout: { write: (text) => { out += text; } }, stderr: { write: (text) => { err += text; } } });
  return { code, err, json: out.trim().startsWith("{") ? JSON.parse(out) : null };
};
const TASK_FILES = [".engineering/super-outer/tasks/design.json", ".engineering/super-outer/current-task.json"];
const readTask = (root) => JSON.parse(fs.readFileSync(path.join(root, TASK_FILES[0]), "utf8"));
// Most tests write the design record directly; the task design command has its own tests below.
const updateTask = (root, update) => {
  for (const file of TASK_FILES) put(root, file, { ...JSON.parse(fs.readFileSync(path.join(root, file), "utf8")), ...update });
};
const writeManifest = (root, frames = ["main-writing-screen.png"]) => {
  put(root, MANIFEST, { version: "1", intent_version: "1", surface: "editor", frames });
  return hash(fs.readFileSync(path.join(root, MANIFEST)));
};

const DESIGN_LEVELS = ["intent-conformance", "owner-acceptance"];
// A required package is pinned by default, and the review and acceptance
// contexts name the pinned manifest hash, as the closure check requires.
const designFixture = async (t, { levels = ["journey"], withContract = true, designPackage = REQUIRED, manifest = false, pin = true } = {}) => {
  const root = temporary(t, "so-design-closure-");
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  put(root, ".gitignore", "/.engineering/\n/evidence/\n");
  put(root, "README.md", "fixture\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  const contract = {
    schema_version: "1.0.0",
    claims: levels.map((level) => ({
      id: level, level, actor_ref: "product-owner", client: "browser", environment: "local-preview",
      action: CLAIMS[level].action, expected_result: CLAIMS[level].expected_result, context_file: `evidence/${level}-context.json`,
    })),
  };
  const pinned = Boolean(designPackage) && pin && (manifest || designPackage.required === true);
  const manifestHash = pinned ? writeManifest(root) : null;
  for (const claim of contract.claims) {
    put(root, claim.context_file, {
      actor_ref: claim.actor_ref, client: claim.client, environment: claim.environment,
      route: "/editor", revision: "build-1", permissions: "owner",
      artifact_ref: DESIGN_LEVELS.includes(claim.level) && manifestHash ? `design-package-v1 ${manifestHash}` : "design-package-v1",
    });
    put(root, `evidence/${claim.id}.txt`, CLAIMS[claim.id].evidence);
  }
  put(root, "evidence/contract.json", contract);
  put(root, "evidence/source.json", { status: "PASS", head: git(root, "rev-parse", "HEAD"), exit_code: 0 });
  const created = await invoke(root, ["task", "create", "--id", "design", ...(withContract ? ["--completion-contract", "evidence/contract.json"] : [])]);
  assert.equal(created.code, 0, created.err);
  if (designPackage) {
    const recorded = pinned ? { ...designPackage, path: PACKAGE_FOLDER, version: "1", sha256: manifestHash } : designPackage;
    updateTask(root, { design_package: recorded });
  }
  return { root, contract };
};

const recordReceipts = ({ root, contract }, { only = contract.claims.map(({ id }) => id), failed = [] } = {}) => {
  put(root, "evidence/receipts.json", {
    schema_version: "1.0.0",
    claims: contract.claims.filter(({ id }) => only.includes(id)).map((claim) => ({
      id: claim.id,
      level: claim.level,
      contract_sha256: completionContractDigest(contract),
      context_sha256: hash(fs.readFileSync(path.join(root, claim.context_file))),
      status: failed.includes(claim.id) ? "FAIL" : "PASS",
      observed_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      evidence_file: `evidence/${claim.id}.txt`,
      evidence_sha256: hash(fs.readFileSync(path.join(root, `evidence/${claim.id}.txt`))),
      method: "direct-observation",
    })),
  });
};
const RECEIPTS = ["--completion-evidence", "evidence/receipts.json"];
const close = (root, extra = []) => invoke(root, ["task", "close", "--id", "design", "--status", "PROVED", "--source-evidence", "evidence/source.json", ...extra]);
const report = (root, options = {}) => taskCompletionReport(root, readTask(root), { evidencePath: "evidence/receipts.json", ...options });

test("closing as PROVED is refused while the design review and acceptance are missing, even though the journey passes", async (t) => {
  const fx = await designFixture(t);
  recordReceipts(fx);
  const before = report(fx.root);
  assert.equal(before.pass, true, "the build itself works");
  assert.equal(before.design_pass, false);
  assert.ok(before.warnings.includes(REVIEW_MISSING));

  const result = await close(fx.root, RECEIPTS);
  assert.equal(result.code, 1);
  assert.ok(result.err.startsWith("Cannot mark the requested work PROVED. "), result.err);
  assert.ok(result.err.includes(REVIEW_MISSING), result.err);
  assert.match(result.err, /Ordinary work may continue\.\n$/);
  assert.equal(readTask(fx.root).status, "UNASSESSED");
});

test("closing as PROVED is refused without a completion contract when a design package is required", async (t) => {
  const fx = await designFixture(t, { withContract: false });
  const result = await close(fx.root);
  assert.equal(result.code, 1);
  assert.ok(result.err.includes(REVIEW_MISSING), result.err);
  assert.match(result.err, /No user-outcome contract is recorded/);
});

test("a failed review against the intent blocks closure while the journey passes", async (t) => {
  const fx = await designFixture(t, { levels: ALL_LEVELS });
  put(fx.root, "evidence/intent-conformance.txt", FIVE_BUTTONS);
  recordReceipts(fx, { only: ["journey", "intent-conformance"], failed: ["intent-conformance"] });
  const before = report(fx.root);
  assert.deepEqual(before.claims.map(({ id, state }) => [id, state]), [
    ["journey", "PROVED"],
    ["intent-conformance", "FAILED"],
    ["owner-acceptance", "UNPROVEN"],
  ]);
  assert.equal(before.design_pass, false);

  const result = await close(fx.root, RECEIPTS);
  assert.equal(result.code, 1);
  assert.ok(result.err.includes(REVIEW_MISSING), result.err);
  assert.match(result.err, /intent-conformance: The recorded observation failed/);
});

test("closing as PROVED succeeds once the journey, the intent review and the owner's acceptance all pass", async (t) => {
  const fx = await designFixture(t, { levels: ALL_LEVELS, manifest: true });
  recordReceipts(fx);
  const result = await close(fx.root, RECEIPTS);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.json.task.status, "PROVED");
  assert.equal(result.json.task.completion_state, "PROVED");
  assert.equal(result.json.task.design_package.required, true);
  assert.equal(result.json.completion.design_pass, true);
  assert.deepEqual(result.json.completion.design_warnings, []);
  assert.deepEqual(result.json.completion.warnings, []);
  const validation = await invoke(fx.root, ["task", "validate", "--id", "design"]);
  assert.equal(validation.code, 0, JSON.stringify(validation.json));
  assert.equal(validation.json.valid, true);
});

test("a design package that changed after the task recorded it blocks closure", async (t) => {
  const fx = await designFixture(t, { levels: ALL_LEVELS, manifest: true });
  recordReceipts(fx);
  writeManifest(fx.root, ["a-different-main-writing-screen.png"]);
  const changed = await close(fx.root, RECEIPTS);
  assert.equal(changed.code, 1);
  assert.ok(changed.err.includes(PACKAGE_CHANGED), changed.err);
  assert.ok(!changed.err.includes(REVIEW_MISSING), changed.err);

  fs.rmSync(path.join(fx.root, MANIFEST));
  const missing = report(fx.root);
  assert.equal(missing.pass, true);
  assert.equal(missing.design_pass, false);
  assert.deepEqual(missing.design_warnings, [PACKAGE_CHANGED]);
  assert.ok(missing.warnings.includes(PACKAGE_CHANGED));
  assert.equal(readTask(fx.root).status, "UNASSESSED");
});

test("tasks without a required design package close exactly as before", async (t) => {
  const legacy = await designFixture(t, { withContract: false, designPackage: null });
  const plain = await close(legacy.root);
  assert.equal(plain.code, 0, plain.err);
  assert.equal(plain.json.task.completion_state, "NOT_RECORDED");
  assert.equal(plain.json.completion.design_pass, true);
  assert.doesNotMatch(plain.json.completion.warnings.join(" "), /design/i);

  const journey = await designFixture(t, { designPackage: null });
  recordReceipts(journey);
  const closed = await close(journey.root, RECEIPTS);
  assert.equal(closed.code, 0, closed.err);
  assert.equal(closed.json.completion.design_pass, true);
  assert.deepEqual(closed.json.completion.warnings, []);
  assert.equal(closed.json.task.design_package, undefined);

  // A package recorded as not required asks for neither receipt.
  const optional = await designFixture(t, { designPackage: { required: false, reason: "A small visual correction needs only a before and after render." } });
  recordReceipts(optional);
  const optionalClose = await close(optional.root, RECEIPTS);
  assert.equal(optionalClose.code, 0, optionalClose.err);
  assert.equal(optionalClose.json.completion.design_pass, true);
});

test("the design warning joins the other warnings only with a contract, a PROVED status or a PROVED closure", (t) => {
  const root = temporary(t, "so-design-report-");
  const task = { task_id: "design", status: "ACTIVE", design_package: REQUIRED };
  const during = taskCompletionReport(root, task);
  assert.equal(during.design_pass, false);
  // An unpinned required package also reports that the version is missing.
  assert.deepEqual(during.design_warnings, [REVIEW_MISSING, "The design package version is not recorded, so the review and acceptance cannot be tied to what was built. Record it with super-outer task design."]);
  assert.ok(!during.warnings.includes(REVIEW_MISSING));
  assert.ok(taskCompletionReport(root, task, { closingAsProved: true }).warnings.includes(REVIEW_MISSING));
  assert.ok(taskCompletionReport(root, { ...task, status: "PROVED" }).warnings.includes(REVIEW_MISSING));
  const contract = {
    schema_version: "1.0.0",
    claims: [{ id: "journey", level: "journey", actor_ref: "product-owner", client: "browser", environment: "local-preview", action: "Open the editor", expected_result: "The editor opens", context_file: "evidence/journey-context.json" }],
  };
  assert.ok(taskCompletionReport(root, { ...task, completion_contract: contract }).warnings.includes(REVIEW_MISSING));

  for (const other of [{ task_id: "plain", status: "ACTIVE" }, { ...task, design_package: { required: false, reason: "Small visual correction." } }]) {
    const unaffected = taskCompletionReport(root, other, { closingAsProved: true });
    assert.equal(unaffected.design_pass, true);
    assert.deepEqual(unaffected.design_warnings, []);
  }
});

for (const mode of ENFORCEMENT_MODES) {
  test(`a turn end during ordinary work never shows the design warning (${modeName(mode)} enforcement)`, async (t) => {
    const fx = await designFixture(t, { withContract: false });
    const message = { last_assistant_message: "The editor screen is half built." };
    const quiet = callHook(t, fx.root, "Stop", message, mode);
    assert.notEqual(quiet.decision, "block");
    assert.doesNotMatch(quiet.systemMessage ?? "", /design review/);

    // An unproved obligation makes the hook show the other completion warnings.
    // The design warning still stays out of them.
    recordObligation(fx.root, { id: "saved-passages", decision: "A saved passage survives a reload", answer: "required", provenBy: "evidence/check.mjs" });
    const withObligation = callHook(t, fx.root, "Stop", message, mode);
    assert.match(withObligation.systemMessage ?? "", /not yet proved/);
    assert.doesNotMatch(withObligation.systemMessage, /design review/);
  });

  test(`a turn end shows the design warning once a contract exists or the task is PROVED (${modeName(mode)} enforcement)`, async (t) => {
    const fx = await designFixture(t);
    const withContract = callHook(t, fx.root, "Stop", { last_assistant_message: "The editor works." }, mode);
    assert.notEqual(withContract.decision, "block");
    assert.ok((withContract.systemMessage ?? "").includes(REVIEW_MISSING), withContract.systemMessage);

    const legacy = await designFixture(t, { withContract: false });
    updateTask(legacy.root, { status: "PROVED" });
    const proved = callHook(t, legacy.root, "Stop", { last_assistant_message: "The editor works." }, mode);
    assert.notEqual(proved.decision, "block");
    assert.ok((proved.systemMessage ?? "").includes(REVIEW_MISSING), proved.systemMessage);
  });

  test(`the design path line arrives the same way where a task record exists (${modeName(mode)} enforcement)`, async (t) => {
    const fx = await designFixture(t);
    const context = routeContext(t, fx.root, WITH_DESIGN_PATH[0], mode);
    assert.ok(context.endsWith(` ${ROUTE_LINE}`), context);
  });
}

const INTENT_FILE = ".engineering/super-outer/intent/editor.md";
const DESIGN_REASON = "A new writing editor is a user-facing new feature.";

test("task design records the requirement, pins the package and intent, and a later manifest change reads as stale", async (t) => {
  const fx = await designFixture(t, { designPackage: null });
  const manifestHash = writeManifest(fx.root);
  put(fx.root, INTENT_FILE, "# Editor intent\n\nVersion: 1\n");
  const recorded = await invoke(fx.root, [
    "task", "design", "--id", "design", "--required", "yes", "--reason", DESIGN_REASON,
    "--package", PACKAGE_FOLDER, "--package-version", "1", "--intent", INTENT_FILE, "--intent-version", "1",
  ]);
  assert.equal(recorded.code, 0, recorded.err);
  const task = readTask(fx.root);
  assert.deepEqual(task.design_package, { required: true, reason: DESIGN_REASON, path: PACKAGE_FOLDER, version: "1", sha256: manifestHash });
  assert.deepEqual(task.product_intent, { path: INTENT_FILE, version: "1", sha256: hash(fs.readFileSync(path.join(fx.root, INTENT_FILE))) });

  writeManifest(fx.root, ["main-writing-screen.png", "passage-selected.png"]);
  recordReceipts(fx);
  assert.ok(report(fx.root).warnings.includes(PACKAGE_CHANGED));
});

test("task design refuses a missing reason, a package without a version and a manifest outside the repository", async (t) => {
  const fx = await designFixture(t, { designPackage: null });
  writeManifest(fx.root);
  const base = ["task", "design", "--id", "design", "--required", "yes"];
  assert.equal((await invoke(fx.root, base)).code, 1);
  assert.equal((await invoke(fx.root, [...base, "--reason", DESIGN_REASON, "--package", PACKAGE_FOLDER])).code, 1);
  assert.equal((await invoke(fx.root, [...base, "--reason", DESIGN_REASON, "--package", "../elsewhere", "--package-version", "1"])).code, 1);
  assert.equal(readTask(fx.root).design_package, undefined);
});

test("a review and acceptance recorded for package v1 do not close a task re-pinned to v2", async (t) => {
  const fx = await designFixture(t, { levels: ["journey", ...DESIGN_LEVELS] });
  recordReceipts(fx);
  assert.equal(report(fx.root, { closingAsProved: true }).design_pass, true);
  // The design is revised into v2 and re-pinned, as the reference instructs.
  const v2 = ".engineering/super-outer/design/editor/v2";
  put(fx.root, `${v2}/manifest.json`, { version: "2", intent_version: "1", surface: "editor", frames: ["main-writing-screen-v2.png"] });
  const repinned = await invoke(fx.root, ["task", "design", "--id", "design", "--required", "yes", "--reason", REQUIRED.reason, "--package", v2, "--package-version", "2"]);
  assert.equal(repinned.code, 0, repinned.err);
  const after = report(fx.root, { closingAsProved: true });
  assert.equal(after.design_pass, false);
  assert.ok(after.design_warnings.some((warning) => warning.includes("different design package version")), after.design_warnings.join(" "));
  const result = await close(fx.root, RECEIPTS);
  assert.equal(result.code, 1);
});

test("a required package that was never pinned cannot close", async (t) => {
  const fx = await designFixture(t, { levels: ["journey", ...DESIGN_LEVELS], pin: false });
  recordReceipts(fx);
  const result = report(fx.root, { closingAsProved: true });
  assert.equal(result.design_pass, false);
  assert.ok(result.design_warnings.some((warning) => warning.includes("version is not recorded")), result.design_warnings.join(" "));
});

test("a changed product intent is reported after it was pinned", async (t) => {
  const fx = await designFixture(t, { levels: ["journey", ...DESIGN_LEVELS] });
  put(fx.root, INTENT_FILE, "# Editor intent\n\nVersion: 1\n");
  const pinned = await invoke(fx.root, ["task", "design", "--id", "design", "--required", "yes", "--reason", REQUIRED.reason, "--intent", INTENT_FILE, "--intent-version", "1"]);
  assert.equal(pinned.code, 0, pinned.err);
  recordReceipts(fx);
  assert.equal(report(fx.root, { closingAsProved: true }).design_pass, true);
  put(fx.root, INTENT_FILE, "# Editor intent\n\nVersion: 1\n\nA quality was changed after review.\n");
  const after = report(fx.root, { closingAsProved: true });
  assert.ok(after.design_warnings.some((warning) => warning.includes("product intent changed")), after.design_warnings.join(" "));
});

test("re-running task design without a package keeps the pinned package", async (t) => {
  const fx = await designFixture(t, { levels: ["journey", ...DESIGN_LEVELS] });
  const before = readTask(fx.root).design_package;
  const rerun = await invoke(fx.root, ["task", "design", "--id", "design", "--required", "yes", "--reason", "The reason was reworded."]);
  assert.equal(rerun.code, 0, rerun.err);
  const after = readTask(fx.root).design_package;
  assert.deepEqual({ path: after.path, version: after.version, sha256: after.sha256 }, { path: before.path, version: before.version, sha256: before.sha256 });
  assert.equal(after.reason, "The reason was reworded.");
});

test("re-running task design with only a new reason keeps the recorded verification", async (t) => {
  const fx = await designFixture(t, { levels: ["journey", ...DESIGN_LEVELS] });
  updateTask(fx.root, { completion_state: "PROVED" });
  const reworded = await invoke(fx.root, ["task", "design", "--id", "design", "--required", "yes", "--reason", "The reason was reworded."]);
  assert.equal(reworded.code, 0, reworded.err);
  assert.equal(readTask(fx.root).completion_state, "PROVED");
  // A changed requirement makes the recorded verification stale.
  const notRequired = await invoke(fx.root, ["task", "design", "--id", "design", "--required", "no", "--reason", "The screens did not change."]);
  assert.equal(notRequired.code, 0, notRequired.err);
  assert.equal(readTask(fx.root).completion_state, undefined);
});
