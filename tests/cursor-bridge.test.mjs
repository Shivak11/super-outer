import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { installCursorHooks, mergeHooksConfig } from "../scripts/install-cursor.mjs";
import { SUPER_OUTER_VERSION } from "../src/constants.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";

const ROOT = path.resolve(".");
const BRIDGE = path.resolve("adapters/cursor/bridge.mjs");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-repo-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  const head = git(root, "rev-parse", "HEAD");
  fs.mkdirSync(path.join(root, ".engineering/super-outer"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, ".engineering/super-outer/current-task.json"), `${JSON.stringify({
    schema_version: "1.0.0",
    task_id: "cursor-hook-task",
    status: "CONFIRMED",
    repository: root,
    branch: "main",
    base: `main@${head}`,
    mode: "FOCUSED",
    selected_modules: ["delivery-release"],
    allowed_actions: ["edit-files", "run-tests"],
    allowed_paths: ["src/**"],
    allowed_destinations: ["none"],
    plan: "none",
    environment: "local"
  }, null, 2)}\n`);
  return {
    root,
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-state-"))
  };
};

const callBridge = ({ root, stateDir }, event, input = {}, extraEnv = {}) => {
  const result = spawnSync(process.execPath, [BRIDGE, event], {
    cwd: root,
    input: JSON.stringify({
      cwd: root,
      workspace_roots: [root],
      conversation_id: "cursor-session",
      hook_event_name: event,
      ...input
    }),
    encoding: "utf8",
    env: isolatedEnv({
      SUPER_OUTER_ROOT: ROOT,
      SUPER_OUTER_STATE_DIR: stateDir,
      SUPER_OUTER_CLIENT: "cursor",
      SUPER_OUTER_SESSION_ID: "cursor-session",
      ...extraEnv
    })
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
};

test("cursor hooks.json maps the four Cursor events through the bridge", () => {
  const manifest = JSON.parse(fs.readFileSync("adapters/cursor/hooks.json", "utf8"));
  assert.equal(manifest.version, 1);
  assert.deepEqual(
    Object.keys(manifest.hooks).sort(),
    ["afterAgentResponse", "beforeSubmitPrompt", "preToolUse", "stop"]
  );
  for (const entries of Object.values(manifest.hooks)) {
    assert.ok(entries.every((entry) => String(entry.command).includes("super-outer-bridge.mjs")));
  }
});

test("ordinary Cursor Write continues without approval", () => {
  const fx = fixture();
  const allowed = callBridge(fx, "preToolUse", {
    tool_name: "Write",
    tool_input: { file_path: path.join(fx.root, "src", "ok.mjs"), contents: "export {}\n" }
  });
  assert.equal(allowed.permission, "allow", JSON.stringify(allowed));
});

test("Cursor StrReplace is treated as a local file edit", () => {
  const fx = fixture();
  const allowed = callBridge(fx, "preToolUse", {
    tool_name: "StrReplace",
    tool_input: { path: path.join(fx.root, "src", "ok.mjs"), old_string: "a", new_string: "b" }
  });
  assert.equal(allowed.permission, "allow", JSON.stringify(allowed));
});

test("beforeSubmitPrompt stays open for ordinary turns", () => {
  const fx = fixture();
  const result = callBridge(fx, "beforeSubmitPrompt", { prompt: "continue the refactor" });
  assert.equal(result.continue, true, JSON.stringify(result));
});

test("afterAgentResponse caches text for Stop approval binding", () => {
  const fx = fixture();
  const cached = callBridge(fx, "afterAgentResponse", {
    text: "Reply exactly:\nAPPROVE SUPER-OUTER CURSOR1"
  });
  assert.deepEqual(cached, {});

  // Without an extremely critical task, Stop should not invent a block.
  const stop = callBridge(fx, "stop", { status: "completed", loop_count: 0 });
  assert.equal(stop.followup_message, undefined, JSON.stringify(stop));
});

test("install-cursor merges without dropping unrelated hooks", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cursor", "hooks.json"), `${JSON.stringify({
    version: 1,
    hooks: {
      afterFileEdit: [{ command: "./hooks/format.sh" }]
    }
  }, null, 2)}\n`);

  const receipt = installCursorHooks({ home });
  assert.equal(receipt.status, "INSTALLED");
  assert.ok(fs.existsSync(receipt.bridge));
  assert.ok(fs.existsSync(path.join(receipt.runtime, "hooks", "super-outer-hook.mjs")));

  const merged = JSON.parse(fs.readFileSync(receipt.hooks_json, "utf8"));
  assert.equal(merged.hooks.afterFileEdit[0].command, "./hooks/format.sh");
  assert.ok(merged.hooks.preToolUse.some((entry) => entry.command.includes("super-outer-bridge.mjs")));
});

test("mergeHooksConfig replaces prior Super-outer entries only", () => {
  const merged = mergeHooksConfig(
    {
      version: 1,
      hooks: {
        preToolUse: [
          { command: "node ./hooks/super-outer-bridge.mjs preToolUse" },
          { command: "./hooks/other.sh" }
        ]
      }
    },
    {
      hooks: {
        preToolUse: [{ command: "node ./hooks/super-outer-bridge.mjs preToolUse" }]
      }
    }
  );
  assert.deepEqual(
    merged.hooks.preToolUse.map((entry) => entry.command),
    ["./hooks/other.sh", "node ./hooks/super-outer-bridge.mjs preToolUse"]
  );
});

test("Cursor receives the computed allowance without blocking the prompt", () => {
  const fx = fixture();
  const out = callBridge(fx, "beforeSubmitPrompt", {
    prompt: "Migrate the recordings table to add an owner column and backfill it",
  });
  assert.equal(out.continue, true, "the prompt is never blocked by routing");
  assert.match(out.additional_context ?? "", /Question allowance: up to 12\b/);
  assert.match(out.additional_context ?? "", /data-migration/);
  // Cursor reads agent_message only when a tool call is denied. Until 5.10.1
  // the route travelled there and never reached the agent.
  assert.equal(out.agent_message, undefined);
});

/**
 * Cursor also imports the Claude Code plugin, so with Super-outer installed in
 * both hosts the shared hook runs twice for one prompt. Cursor joins the two
 * contexts, which on 3 September 2026 would have put two routes, possibly from
 * two versions, in front of the agent.
 */
const MIGRATION = "Migrate the recordings table to add an owner column and backfill it";
const cursorTurn = (root, generationId, extra = {}) => ({
  conversation_id: "cursor-session",
  session_id: "cursor-session",
  generation_id: generationId,
  cursor_version: "3.23.12",
  hook_event_name: "beforeSubmitPrompt",
  prompt: MIGRATION,
  workspace_roots: [root],
  ...extra
});

// The imported Claude Code plugin receives Cursor's input unchanged and has no
// SUPER_OUTER_CLIENT, as in the Cursor hook log of 3 September 2026. That log
// also shows Cursor starting the plugin's hook in the plugin's own folder, and
// Cursor sends no cwd with a prompt or a stop. A tool call carries cwd.
const runPluginCopy = ({ stateDir }, event, input, extraEnv = {}) => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "hooks/super-outer-hook.mjs"), event], {
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-claude-plugin-")),
    input: JSON.stringify(input),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_STATE_DIR: stateDir, ...extraEnv })
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || "{}");
};
const callPluginCopy = (fx, input, extraEnv) =>
  runPluginCopy(fx, "UserPromptSubmit", input, extraEnv).hookSpecificOutput?.additionalContext ?? "";

// From 5.10.2 the Claude Code copy steps aside when it finds the Cursor bridge,
// so both copies route a turn only when it cannot see the bridge, or when the
// Claude Code copy is older than 5.10.2.
test("when both copies route one Cursor turn, the route arrives once", () => {
  const fx = fixture();
  const bridgeFirst = callBridge(fx, "beforeSubmitPrompt", cursorTurn(fx.root, "turn-one"));
  const pluginSecond = callPluginCopy(fx, cursorTurn(fx.root, "turn-one"));
  assert.match(bridgeFirst.additional_context ?? "", /Question allowance/);
  assert.equal(pluginSecond, "");

  const pluginFirst = callPluginCopy(fx, cursorTurn(fx.root, "turn-two"));
  const bridgeSecond = callBridge(fx, "beforeSubmitPrompt", cursorTurn(fx.root, "turn-two"));
  assert.match(pluginFirst, /Question allowance/);
  assert.deepEqual(bridgeSecond, { continue: true });
});

test("hosts other than Cursor keep the route on every call", () => {
  const fx = fixture();
  const { cursor_version: _unused, ...claudeShaped } = cursorTurn(fx.root, "same-turn");
  assert.match(callPluginCopy(fx, claudeShaped), /Question allowance/);
  assert.match(callPluginCopy(fx, claudeShaped), /Question allowance/);
});

test("a Cursor turn without an identifier keeps its route", () => {
  const fx = fixture();
  const unnamed = cursorTurn(fx.root, "");
  assert.match(callPluginCopy(fx, unnamed), /Question allowance/);
  assert.match(callPluginCopy(fx, unnamed), /Question allowance/);
});

/**
 * One owner per Cursor event. With Super-outer in both hosts, Cursor ran the
 * shared hook twice for every prompt, tool call and stop, and it lets a refusal
 * from either copy win. The Claude Code copy keeps its own approval record,
 * under a different client name, and on a prompt or a stop it looked in its
 * own plugin folder instead of the project. So it never saw an approval and
 * refused every extremely critical action the person had approved through the
 * bridge.
 */
const cursorHomeWithBridge = (bridgeSource = fs.readFileSync(BRIDGE, "utf8")) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  fs.mkdirSync(path.join(home, ".cursor", "hooks"), { recursive: true });
  fs.writeFileSync(path.join(home, ".cursor", "hooks", "super-outer-bridge.mjs"), bridgeSource);
  const template = JSON.parse(fs.readFileSync("adapters/cursor/hooks.json", "utf8"));
  fs.writeFileSync(path.join(home, ".cursor", "hooks.json"), JSON.stringify(mergeHooksConfig(null, template)));
  return home;
};

// A bridge from before 5.10.1 sent the route as agent_message, which Cursor
// ignores on a prompt.
const bridgeBefore5101 = () => {
  const current = fs.readFileSync(BRIDGE, "utf8");
  const older = current.replaceAll("additional_context", "agent_message");
  assert.notEqual(older, current);
  return older;
};

const criticalTask = (fx) => {
  const filename = path.join(fx.root, ".engineering/super-outer/current-task.json");
  const task = JSON.parse(fs.readFileSync(filename, "utf8"));
  fs.writeFileSync(filename, `${JSON.stringify({
    ...task,
    mode: "CRITICAL",
    allowed_actions: ["delete-production-data"],
    allowed_paths: ["."],
    allowed_destinations: ["production"],
    environment: "production"
  }, null, 2)}\n`);
};

const PHRASE = "APPROVE SUPER-OUTER CURSOR42";
const criticalCall = (root, generationId) => ({
  ...cursorTurn(root, generationId),
  hook_event_name: "preToolUse",
  cwd: root,
  tool_name: "Custom",
  tool_input: {
    super_outer_scope: { action: "delete-production-data", paths: ["."], destinations: ["production"], environment: "production" }
  }
});

const approveThroughBridge = (fx, pluginEnv) => {
  callBridge(fx, "afterAgentResponse", { ...cursorTurn(fx.root, "turn-one"), text: `Reply exactly:\n${PHRASE}` });
  callBridge(fx, "stop", { ...cursorTurn(fx.root, "turn-one"), status: "completed", loop_count: 0 });
  // Both copies receive the typed phrase, in the order Cursor happens to start them.
  runPluginCopy(fx, "UserPromptSubmit", cursorTurn(fx.root, "turn-two", { prompt: PHRASE }), pluginEnv);
  assert.equal(callBridge(fx, "beforeSubmitPrompt", cursorTurn(fx.root, "turn-two", { prompt: PHRASE })).continue, true);
};

test("an action approved through the Cursor bridge is not refused by the Claude Code copy", () => {
  const fx = fixture();
  criticalTask(fx);
  const env = { SUPER_OUTER_INSTALL_HOME: cursorHomeWithBridge() };
  approveThroughBridge(fx, env);

  const pluginCopy = runPluginCopy(fx, "PreToolUse", criticalCall(fx.root, "turn-three"), env);
  assert.deepEqual(pluginCopy, {}, "the Claude Code copy refused an approved action");
  assert.equal(callBridge(fx, "preToolUse", criticalCall(fx.root, "turn-three")).permission, "allow");
});

test("with the Cursor bridge installed, the Claude Code copy leaves every Cursor event to it", () => {
  const fx = fixture();
  const probeFile = path.join(fx.stateDir, "probe.jsonl");
  const env = { SUPER_OUTER_INSTALL_HOME: cursorHomeWithBridge(), SUPER_OUTER_HOOK_PROBE_FILE: probeFile };

  // The Claude Code copy usually starts first. The bridge still gives the route.
  assert.deepEqual(runPluginCopy(fx, "UserPromptSubmit", cursorTurn(fx.root, "turn-one"), env), {});
  assert.match(callBridge(fx, "beforeSubmitPrompt", cursorTurn(fx.root, "turn-one")).additional_context ?? "", /Question allowance/);

  // A write outside the recorded paths would earn a scope notice.
  const write = {
    ...cursorTurn(fx.root, "turn-one"),
    hook_event_name: "preToolUse",
    cwd: fx.root,
    tool_name: "Write",
    tool_input: { file_path: path.join(fx.root, "README.md"), contents: "changed\n" }
  };
  assert.deepEqual(runPluginCopy(fx, "PreToolUse", write, env), {});
  assert.deepEqual(runPluginCopy(fx, "Stop", { ...cursorTurn(fx.root, "turn-one"), hook_event_name: "stop", status: "completed", loop_count: 0 }, env), {});

  // No route was worked out, so no request went to Jev either.
  const phases = fs.readFileSync(probeFile, "utf8").trim().split("\n").map((line) => JSON.parse(line).phase);
  assert.equal(phases.includes("routed"), false, phases.join(","));
});

test("a bridge from before 5.10.1 still leaves the route to the Claude Code copy, but not tool calls", () => {
  const fx = fixture();
  criticalTask(fx);
  const env = { SUPER_OUTER_INSTALL_HOME: cursorHomeWithBridge(bridgeBefore5101()) };
  assert.match(callPluginCopy(fx, cursorTurn(fx.root, "turn-one"), env), /Question allowance/);
  assert.deepEqual(runPluginCopy(fx, "PreToolUse", criticalCall(fx.root, "turn-two"), env), {});
});

// With the bridge from before 5.10.1, both copies record the typed phrase. They
// keep separate approval records, so the second recording neither cancels the
// approval nor blocks the prompt.
test("both copies recording one Cursor turn leave the bridge's approval usable", () => {
  const fx = fixture();
  criticalTask(fx);
  approveThroughBridge(fx, { SUPER_OUTER_INSTALL_HOME: cursorHomeWithBridge(bridgeBefore5101()) });
  assert.equal(callBridge(fx, "preToolUse", criticalCall(fx.root, "turn-three")).permission, "allow");
});

test("the Cursor installer puts in a bridge that the Claude Code copy defers to", () => {
  const fx = fixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  installCursorHooks({ home });
  assert.deepEqual(runPluginCopy(fx, "UserPromptSubmit", cursorTurn(fx.root, "turn-one"), { SUPER_OUTER_INSTALL_HOME: home }), {});
});

// Without the bridge, the Claude Code copy is the only one in Cursor. It now
// reads the project from workspace_roots, so the route reflects the project's
// own ledger instead of the plugin's folder.
test("without the bridge, the Claude Code copy routes a Cursor prompt from the project", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-ledger-"));
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const publicEndpoint = true;\n");
  fs.mkdirSync(path.join(repo, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".engineering/super-outer/ledger.json"), JSON.stringify({
    schema_version: "1.0.0",
    entries: [{ id: "rate-limits", prompt: "Add rate limits to the public API", status: "DEFERRED", revisitWhen: ["publicEndpoint"] }],
  }));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  const route = callPluginCopy(
    { stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-state-")) },
    cursorTurn(repo, "turn-one", { prompt: "Add a background queue that retries failed webhooks" })
  );
  assert.match(route, /A part the owner deferred is now due: "Add rate limits to the public API"/);
});

// Only the prompt reads workspace_roots. On a stop, a block would become a
// Cursor follow-up message with no limit on repeats, so the Claude Code copy
// stays as quiet as it was before 5.10.2.
test("without the bridge, the Claude Code copy's Cursor stop stays quiet", () => {
  const fx = fixture();
  const filename = path.join(fx.root, ".engineering/super-outer/current-task.json");
  const task = JSON.parse(fs.readFileSync(filename, "utf8"));
  fs.writeFileSync(filename, `${JSON.stringify({ ...task, mode: "FULL", status: "PROVED" }, null, 2)}\n`);
  const stop = { ...cursorTurn(fx.root, "turn-one"), hook_event_name: "stop", status: "completed", loop_count: 0 };
  assert.deepEqual(runPluginCopy(fx, "Stop", stop), {});
});

// A stand-in for the shared hook, so the bridge's own translation is tested
// with outputs the real hook rarely produces.
const stubRuntime = (sharedOutput) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-stub-"));
  fs.mkdirSync(path.join(root, "hooks"));
  fs.writeFileSync(
    path.join(root, "hooks", "super-outer-hook.mjs"),
    `process.stdout.write(${JSON.stringify(JSON.stringify(sharedOutput))});\n`
  );
  return root;
};

test("Cursor receives at most 10,000 characters of route", () => {
  const fx = fixture();
  const long = `Super-outer routed this request as FULL. ${"x".repeat(12_000)}`;
  const out = callBridge(fx, "beforeSubmitPrompt", { prompt: MIGRATION }, {
    SUPER_OUTER_ROOT: stubRuntime({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: long } })
  });
  assert.equal(out.continue, true);
  assert.equal(out.additional_context.length, 10_000);
  assert.ok(out.additional_context.startsWith("Super-outer routed this request as FULL."));
});

test("a blocked Cursor prompt still stops with a message for the person", () => {
  const fx = fixture();
  const out = callBridge(fx, "beforeSubmitPrompt", { prompt: MIGRATION }, {
    SUPER_OUTER_ROOT: stubRuntime({ decision: "block", reason: "Blocked for the test." })
  });
  assert.deepEqual(out, { continue: false, user_message: "Blocked for the test." });
});

/**
 * The Cursor installer reported INSTALLED for weeks while staging a runtime
 * that could not be imported and never installing the skill at all. A receipt
 * is not proof that anything runs.
 */
test("the Cursor install stages everything its hook imports, and the skill", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  // 6.0.0 installed a separate code-flow skill that 6.0 folds into draw-system-diagram.
  const retired = path.join(home, ".cursor/skills/team-technical-diagram");
  fs.mkdirSync(retired, { recursive: true });
  fs.writeFileSync(path.join(retired, "SKILL.md"), "---\nname: team-technical-diagram\n---\n");
  const result = installCursorHooks({ home });
  assert.ok(!fs.existsSync(retired), "the retired skill folder is removed on upgrade");

  // Every module the hook imports, discovered by walking its imports.
  for (const relative of ["src/router.mjs", "src/archetypes.mjs", "src/constants.mjs", "src/change-shape.mjs", "src/approval.mjs", "src/git-evidence.mjs"]) {
    assert.ok(fs.existsSync(path.join(result.runtime, relative)), `${relative} was not staged`);
  }
  // Anticipation libraries are data the router reads, not imports.
  const libraries = fs.readdirSync(path.join(result.runtime, "skills/super-outer/references/archetypes"));
  assert.ok(libraries.length >= 8, `only ${libraries.length} anticipation libraries staged`);
  // The route names reference files beside the hook, so the whole skill is staged.
  for (const relative of ["SKILL.md", "references/journey-map.md", "references/story-walk.md", "references/product-brief.md", "references/requirement-changes.md"]) {
    assert.ok(fs.existsSync(path.join(result.runtime, "skills/super-outer", relative)), `staged runtime lacks ${relative}`);
  }

  // The skill lands where the documentation always said it did.
  const skill = fs.readFileSync(path.join(home, ".cursor/skills/super-outer/SKILL.md"), "utf8");
  assert.match(skill, new RegExp(`Version: \`${SUPER_OUTER_VERSION.replace(/\./g, "\\.")}\``));
  // Every skill the plugin ships reaches Cursor, not only the router. Until
  // 5.23.0 the installer copied skills/super-outer alone.
  const shipped = fs.readdirSync(path.join(ROOT, "skills")).sort();
  assert.ok(shipped.includes("draw-system-diagram"));
  assert.ok(!shipped.includes("team-technical-diagram"));
  assert.ok(fs.existsSync(path.join(home, ".cursor/skills/draw-system-diagram/scripts/diagram_kit.py")));
  for (const name of shipped) {
    assert.ok(fs.existsSync(path.join(home, ".cursor/skills", name, "SKILL.md")), `Cursor did not receive the ${name} skill`);
  }
  assert.ok(fs.existsSync(path.join(home, ".cursor/skills/draw-system-diagram/scripts/check-diagram.mjs")));
  assert.deepEqual(result.skills, shipped.map((name) => path.join(home, ".cursor/skills", name)));

  // And the staged hook actually runs, with Jev off and no key.
  const probe = spawnSync(process.execPath, [path.join(result.runtime, "hooks/super-outer-hook.mjs"), "UserPromptSubmit"], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: home, prompt: "Send a weekly reminder email" }),
    encoding: "utf8",
    env: isolatedEnv(),
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.doesNotMatch(probe.stderr || "", /Cannot find module/);
  assert.match(JSON.parse(probe.stdout).hookSpecificOutput.additionalContext, /notifications-messaging/);

  // A new agent product in Cursor: every file the route names exists, and the
  // skill is named as Cursor lists it.
  const agentProbe = spawnSync(process.execPath, [path.join(result.runtime, "hooks/super-outer-hook.mjs"), "UserPromptSubmit"], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: home, prompt: "Build an AI agent that edits the activity for faculty. Go ahead and plan the build." }),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_CLIENT: "cursor" }),
  });
  const agentContext = JSON.parse(agentProbe.stdout).hookSpecificOutput.additionalContext;
  const named = agentContext.match(/\/[^\s,()]+\.(?:md|json)/g) || [];
  assert.ok(named.some((file) => file.endsWith("story-walk.md")), agentContext);
  for (const file of named) assert.ok(fs.existsSync(file), `the route names a missing file: ${file}`);
  assert.match(agentContext, /Its skill is super-outer\./);

  // The modules the hook loads while it runs reach the staged runtime too, so
  // Jev can run in Cursor. With a key and the test guard, the staged hook's
  // probe line shows that its Jev modules loaded and refused the real address.
  for (const file of ["judge.mjs", "settings.mjs", "client.mjs", "combine.mjs", "prompt-filter.mjs"]) {
    assert.ok(fs.existsSync(path.join(result.runtime, "src/jev", file)), `staged runtime lacks src/jev/${file}`);
  }
  const probeFile = path.join(home, "staged-probe.jsonl");
  const jevProbe = spawnSync(process.execPath, [path.join(result.runtime, "hooks/super-outer-hook.mjs"), "UserPromptSubmit"], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: home, prompt: "design the empty state screen for first-time users" }),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_OPENROUTER_KEY: "staged-test-key-0123456789", SUPER_OUTER_HOOK_PROBE_FILE: probeFile }, { jev: "on" }),
  });
  assert.equal(jevProbe.status, 0, jevProbe.stderr);
  const routed = fs.readFileSync(probeFile, "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.phase === "routed");
  assert.equal(routed.jev_reason, "test_network_refused");
});

// Routing checks the deferral ledger. The staged copy must carry the
// ledger code, and the hook's quiet fallback would hide its absence, so the
// staged hook has to say a due part itself.
test("the staged Cursor hook says a deferred part that has come due", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  const result = installCursorHooks({ home });
  assert.ok(fs.existsSync(path.join(result.runtime, "src/sequencing.mjs")), "src/sequencing.mjs was not staged");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-ledger-"));
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const publicEndpoint = true;\n");
  fs.mkdirSync(path.join(repo, ".engineering/super-outer"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".engineering/super-outer/ledger.json"), JSON.stringify({
    schema_version: "1.0.0",
    entries: [{ id: "rate-limits", prompt: "Add rate limits to the public API", status: "DEFERRED", revisitWhen: ["publicEndpoint"] }],
  }));
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  const probe = spawnSync(process.execPath, [path.join(result.runtime, "hooks/super-outer-hook.mjs"), "UserPromptSubmit"], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: repo, session_id: "cursor-ledger", prompt: "Add a background queue that retries failed webhooks" }),
    encoding: "utf8",
    env: isolatedEnv({ SUPER_OUTER_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-state-")) }),
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(JSON.parse(probe.stdout).hookSpecificOutput.additionalContext, /A part the owner deferred is now due: "Add rate limits to the public API"/);
});

// From the 5.8.0 review: the installer's own check of the staged hook ran with
// the environment it was given, so with a key present it could send its test
// prompt to Jev. The check now switches Jev off, which its probe line shows.
test("the Cursor installer's check of the staged hook switches Jev off, even with a key in the environment", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const probeFile = path.join(home, "installer-probe.jsonl");
  const saved = { ...process.env };
  t.after(() => {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  });
  Object.assign(process.env, isolatedEnv({
    SUPER_OUTER_OPENROUTER_KEY: "installer-test-key-0123456789",
    SUPER_OUTER_HOOK_PROBE_FILE: probeFile,
  }, { jev: "on" }));
  installCursorHooks({ home });
  const routed = fs.readFileSync(probeFile, "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.phase === "routed");
  assert.deepEqual([routed.jev_status, routed.jev_reason], ["skipped", "off"]);
});

/**
 * 5.17.2. Until then the bridge answered every allowed tool call with a bare
 * allow, so no Super-outer tool warning reached Cursor, including the 5.17.0
 * plan notice. Cursor's documentation gives user_message and agent_message
 * only for a denied call. The installed Cursor agent (2026.09.10 to
 * 2026.10.01) and the desktop app 3.24.18 read additional_context on an
 * allowed preToolUse and give it to the agent; they show the person nothing.
 */
const courseAppRepo = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-plan-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({
    name: "course-app", dependencies: { next: "16.0.0", ai: "7.0.0", workflow: "4.0.0" },
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src/server.ts"), "export const save = () => db.from('activities').update({});\n");
  fs.mkdirSync(path.join(root, ".engineering/super-outer/intent"), { recursive: true });
  fs.writeFileSync(path.join(root, ".engineering/super-outer/intent/judgement-activity.md"),
    "# Product intent: judgement-activity\nVersion: 7 (14 October 2026)\n\nStudents work through a case step by step.\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  return root;
};

// The bridge as Cursor runs it: installed under a home, finding its runtime
// there, with nothing pointing it at this repository.
const stagedCursor = (bridgeSource) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-home-"));
  const receipt = installCursorHooks({ home });
  if (bridgeSource) fs.writeFileSync(receipt.bridge, bridgeSource);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-cursor-state-"));
  let generation = 0;
  return (root, event, input = {}) => {
    const env = isolatedEnv({ HOME: home, SUPER_OUTER_STATE_DIR: stateDir });
    for (const name of ["SUPER_OUTER_ROOT", "SUPER_OUTER_CURSOR_RUNTIME", "SUPER_OUTER_CLIENT", "SUPER_OUTER_SESSION_ID"]) delete env[name];
    const result = spawnSync(process.execPath, [receipt.bridge, event], {
      cwd: root,
      input: JSON.stringify({
        conversation_id: "cursor-plan-session",
        generation_id: `turn-${(generation += 1)}`,
        cursor_version: "3.24.18",
        hook_event_name: event,
        workspace_roots: [root],
        ...input
      }),
      encoding: "utf8",
      env
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout || "{}");
  };
};

const PLAN_NOTICE = /This build plan is being saved before anyone walked a customer's story through the design/g;
const planSession = (cursor, root) => {
  cursor(root, "beforeSubmitPrompt", { prompt: "Build a conversational builder for the course app where teachers talk to an AI agent that edits their activity" });
  cursor(root, "beforeSubmitPrompt", { prompt: "yes same database, go ahead plan the build" });
  return cursor(root, "preToolUse", {
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: path.join(root, "docs/plans/x.md"), contents: "# Build plan\n" }
  });
};

test("the installed Cursor bridge passes the plan notice to Cursor's agent and still allows the save", () => {
  const root = courseAppRepo();
  const out = planSession(stagedCursor(), root);
  assert.equal(out.permission, "allow", JSON.stringify(out));
  const context = out.additional_context ?? "";
  // Once, although the shared hook gives it both as a warning and as context.
  assert.equal(context.match(PLAN_NOTICE)?.length, 1, context);
  assert.match(context, /a run that takes minutes while the person closes the tab/);
  // Cursor shows the person nothing on an allowed call, so the agent is asked to say it.
  assert.match(context, /^Cursor does not show the person Super-outer's warnings\. Tell them this one in a line of your own:/);
  assert.doesNotMatch(context, /\u001b\[/);
  assert.equal(out.user_message, undefined);
  assert.equal(out.agent_message, undefined);
});

// The 5.17.0 bridge answered every allowed call the way it still answers a shell check.
const bridgeBefore5171 = () => {
  const current = fs.readFileSync(BRIDGE, "utf8");
  const older = current.replace('if (cursorEvent !== "preToolUse") return { permission: "allow" };', 'return { permission: "allow" };');
  assert.notEqual(older, current);
  return older;
};

test("the 5.17.0 Cursor bridge dropped the plan notice", () => {
  assert.deepEqual(planSession(stagedCursor(bridgeBefore5171()), courseAppRepo()), { permission: "allow" });
});

test("the installed Cursor bridge returns a plain allow when there is nothing to say", () => {
  const root = courseAppRepo();
  const cursor = stagedCursor();
  const out = cursor(root, "preToolUse", {
    cwd: root,
    tool_name: "Write",
    tool_input: { file_path: path.join(root, "src", "ok.ts"), contents: "export {}\n" }
  });
  assert.deepEqual(out, { permission: "allow" });
});

test("on an allowed call the bridge strips colour, drops repeated context, and keeps Cursor's 10,000-character limit", () => {
  const fx = fixture();
  const notice = "This build plan is being saved before anyone walked a customer's story through the design.";
  const both = callBridge(fx, "preToolUse", { tool_name: "Write", tool_input: {} }, {
    SUPER_OUTER_ROOT: stubRuntime({
      systemMessage: `\u001b[33m⚠️  BEWARE\u001b[0m — ${notice}`,
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: `Super-outer: ${notice}` }
    })
  });
  assert.deepEqual(both, {
    permission: "allow",
    additional_context: `Cursor does not show the person Super-outer's warnings. Tell them this one in a line of your own: ⚠️  BEWARE — ${notice}`
  });

  const contextOnly = callBridge(fx, "preToolUse", { tool_name: "Write", tool_input: {} }, {
    SUPER_OUTER_ROOT: stubRuntime({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "Super-outer: for the session only." } })
  });
  assert.deepEqual(contextOnly, { permission: "allow", additional_context: "Super-outer: for the session only." });

  const long = callBridge(fx, "preToolUse", { tool_name: "Write", tool_input: {} }, {
    SUPER_OUTER_ROOT: stubRuntime({ systemMessage: "x".repeat(12_000) })
  });
  assert.equal(long.additional_context.length, 10_000);
});

// Cursor reads additional_context on preToolUse only. On beforeShellExecution
// a field outside its schema blocks the command.
test("a shell check stays a plain allow even when the shared hook has a warning", () => {
  const fx = fixture();
  const out = callBridge(fx, "beforeShellExecution", { command: "ls" }, {
    SUPER_OUTER_ROOT: stubRuntime({ systemMessage: "A warning." })
  });
  assert.deepEqual(out, { permission: "allow" });
});

// Each tool warning is said once a session, so Cursor's agent is asked to
// relay it once and the person is not interrupted on every call.
test("a write outside the recorded paths is relayed to Cursor's agent once a session", () => {
  const fx = fixture();
  const write = { tool_name: "Write", tool_input: { file_path: path.join(fx.root, "README.md"), contents: "changed\n" } };
  const first = callBridge(fx, "preToolUse", write);
  assert.equal(first.permission, "allow");
  assert.match(first.additional_context ?? "", /^Cursor does not show the person Super-outer's warnings\..*differs from the recorded task scope/s);
  assert.deepEqual(callBridge(fx, "preToolUse", write), { permission: "allow" });
});
