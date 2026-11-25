// The prompt hook's deadline, from 5.20.1. On 15 October 2026 eight sessions
// started at once on a busy computer, and in four of them the host stopped
// the prompt hook at its five-second limit and discarded the route. Jev's own
// 2.5 seconds, the searches after it and a late start under load added up
// past the limit. These tests start the hook late on purpose and give it a
// stand-in for Jev that never answers.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AFTER_JEV_RESERVE_MS, AFTER_SEARCH_RESERVE_MS, JEV_FLOOR_MS, PROMPT_DEADLINE_MS, SEARCH_FLOOR_MS, stepBudget,
} from "../src/hook-deadline.mjs";
import { TIMEOUT_MS as JEV_LIMIT_MS } from "../src/jev/client.mjs";
import { isolatedEnv } from "./helpers/isolated-env.mjs";
import { startServer } from "./helpers/jev-server.mjs";

const HOOK = path.resolve("hooks/super-outer-hook.mjs");
const FAKE_KEY = ["test", "only", "key", "0123456789"].join("-");
const LATE_START_MS = 2000;
// A preload that holds the process before the hook's first line runs, as a
// busy computer does. performance.now() in the hook counts this time.
// NODE_OPTIONS splits at spaces, so the code is percent-encoded.
const lateStart = (ms) => `--import=data:text/javascript,${encodeURIComponent(`const until = Date.now() + ${ms}; while (Date.now() < until) {}`)}`;

const temporary = (t, prefix) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const probeLines = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

const runHook = (event, input, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, event], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(stdout || "{}")) : reject(new Error(stderr || `hook exited ${code}`))));
    child.stdin.end(JSON.stringify(input));
  });

// The repository of the 15 October runs: an intent record and an AI library,
// so a request to plan an agent product takes the hook's longest path.
const agentRepository = (t) => {
  const root = temporary(t, "so-deadline-repo-");
  fs.mkdirSync(path.join(root, ".git"));
  fs.mkdirSync(path.join(root, ".engineering", "super-outer", "intent"), { recursive: true });
  fs.writeFileSync(path.join(root, ".engineering", "super-outer", "intent", "activity.md"), "# Activity\nFaculty build a case activity that students work through.\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "course-app", dependencies: { ai: "7.0.0" } }));
  return root;
};

test("each step gets what is left before the deadline, up to its own limit", () => {
  const jev = (elapsedMs) => stepBudget({ elapsedMs, limitMs: JEV_LIMIT_MS, reserveMs: AFTER_JEV_RESERVE_MS, floorMs: JEV_FLOOR_MS });
  assert.equal(jev(30), JEV_LIMIT_MS, "a prompt at rest keeps Jev's full 2.5 seconds");
  assert.equal(jev(2000), PROMPT_DEADLINE_MS - 2000 - AFTER_JEV_RESERVE_MS, "a late start shortens the call");
  assert.equal(jev(PROMPT_DEADLINE_MS - AFTER_JEV_RESERVE_MS - JEV_FLOOR_MS + 1), 0, "below the floor Jev is skipped");
  assert.equal(jev(PROMPT_DEADLINE_MS + 500), 0, "past the deadline nothing is granted");

  const search = (elapsedMs) => stepBudget({ elapsedMs, limitMs: 800, reserveMs: AFTER_SEARCH_RESERVE_MS, floorMs: SEARCH_FLOOR_MS });
  assert.equal(search(100), 800);
  assert.equal(search(PROMPT_DEADLINE_MS - 300), 300 - AFTER_SEARCH_RESERVE_MS);
  assert.equal(search(PROMPT_DEADLINE_MS - AFTER_SEARCH_RESERVE_MS - SEARCH_FLOOR_MS + 1), 0);
});

test("the hosts allow the prompt hook more time than its own deadline, and the Cursor bridge answers a prompt inside Cursor's limit", () => {
  const shared = readJson("hooks/hooks.json").hooks.UserPromptSubmit[0].hooks[0];
  assert.ok(shared.timeout * 1000 >= PROMPT_DEADLINE_MS + 5000, `the host limit of ${shared.timeout} s leaves room for a late start`);

  const cursor = readJson("adapters/cursor/hooks.json").hooks;
  assert.equal(cursor.beforeSubmitPrompt[0].timeout, shared.timeout, "Cursor waits as long as Claude Code and Codex");

  const bridge = fs.readFileSync("adapters/cursor/bridge.mjs", "utf8");
  const waits = Object.fromEntries([...bridge.matchAll(/^\s+(\w+): ([\d_]+),?$/gm)].map(([, event, ms]) => [event, Number(ms.replace(/_/g, ""))]));
  const promptLimitMs = cursor.beforeSubmitPrompt[0].timeout * 1000;
  assert.ok(waits.beforeSubmitPrompt > 0 && waits.beforeSubmitPrompt < promptLimitMs, `the bridge waits ${waits.beforeSubmitPrompt} ms for a prompt, inside Cursor's ${promptLimitMs} ms`);
  // A refusal that arrives late must still reach Cursor, so the bridge never
  // gives up on a tool call or a stop before Cursor does.
  for (const event of ["preToolUse", "stop"]) {
    const limitMs = cursor[event][0].timeout * 1000;
    assert.ok(waits[event] >= limitMs, `the bridge waits ${waits[event]} ms for ${event}, no less than Cursor's ${limitMs} ms`);
  }
});

test("a late start shortens Jev's call, and the route still arrives before the deadline", async (t) => {
  // Accepts the request and never answers, like a slow network on a busy day.
  const server = await startServer(() => {});
  t.after(() => server.close());
  const root = agentRepository(t);
  const probe = path.join(temporary(t, "so-deadline-probe-"), "probe.jsonl");
  const env = isolatedEnv({
    SUPER_OUTER_STATE_DIR: temporary(t, "so-deadline-state-"),
    SUPER_OUTER_OPENROUTER_KEY: FAKE_KEY,
    SUPER_OUTER_JEV_ENDPOINT: server.url,
    SUPER_OUTER_CONFIG_DIR: temporary(t, "so-deadline-config-"),
    SUPER_OUTER_DATA_DIR: temporary(t, "so-deadline-data-"),
    SUPER_OUTER_HOOK_PROBE_FILE: probe,
    NODE_OPTIONS: lateStart(LATE_START_MS),
    NO_COLOR: "1",
  }, { jev: "on" });

  const output = await runHook("UserPromptSubmit", {
    hook_event_name: "UserPromptSubmit",
    prompt: "Build a conversational builder where faculty talk to an AI agent that edits their activity. Go ahead and plan the build.",
    cwd: root,
    session_id: "deadline-session",
  }, env);

  assert.match(output.hookSpecificOutput?.additionalContext ?? "", /^Super-outer routed this request as (FOCUSED|FULL|CRITICAL)\./);
  assert.equal(server.requests.length, 1, "Jev was still asked");

  const lines = probeLines(probe).filter((line) => line.event === "UserPromptSubmit");
  const started = lines.find((line) => line.phase === "started");
  const routed = lines.find((line) => line.phase === "routed");
  const completed = lines.find((line) => line.phase === "completed");
  assert.equal(routed.jev_status, "failed");
  assert.equal(routed.jev_reason, "deadline", "a call the deadline cut short is not recorded as Jev's own timeout");
  assert.ok(routed.jev_timeout_ms > 0 && routed.jev_timeout_ms < JEV_LIMIT_MS, `Jev was given ${routed.jev_timeout_ms} ms`);
  assert.ok(started.since_launch_ms >= LATE_START_MS, `the hook started ${started.since_launch_ms} ms after launch`);
  // Generous: a busy test machine slows the work after Jev, and the deadline
  // assertions above already fail on code without the deadline.
  assert.ok(completed.since_launch_ms < PROMPT_DEADLINE_MS + 2000, `the route was out ${completed.since_launch_ms} ms after launch`);
});

test("with too little time left, Jev and the checklist search are skipped, and the walk notice waits for the next prompt", async (t) => {
  const server = await startServer(() => {});
  t.after(() => server.close());
  const root = agentRepository(t);
  const probe = path.join(temporary(t, "so-deadline-probe-"), "probe.jsonl");
  const base = {
    SUPER_OUTER_STATE_DIR: temporary(t, "so-deadline-state-"),
    SUPER_OUTER_OPENROUTER_KEY: FAKE_KEY,
    SUPER_OUTER_JEV_ENDPOINT: server.url,
    SUPER_OUTER_CONFIG_DIR: temporary(t, "so-deadline-config-"),
    SUPER_OUTER_DATA_DIR: temporary(t, "so-deadline-data-"),
    SUPER_OUTER_HOOK_PROBE_FILE: probe,
    NO_COLOR: "1",
  };
  const ask = (text, extra) => runHook("UserPromptSubmit", {
    hook_event_name: "UserPromptSubmit", prompt: text, cwd: root, session_id: "deadline-late-session",
  }, isolatedEnv({ ...base, ...extra }, { jev: "on" }));
  const PLAN = "Build a conversational builder where faculty talk to an AI agent that edits their activity. Go ahead and plan the build.";
  const WALK = "Not yet covered by the code or a recorded walk:";

  // Started 3.95 s late: less than the floor is left for either step.
  const late = await ask(PLAN, { NODE_OPTIONS: lateStart(PROMPT_DEADLINE_MS - 50) });
  const lateContext = late.hookSpecificOutput?.additionalContext ?? "";
  assert.match(lateContext, /^Super-outer routed this request as (FOCUSED|FULL|CRITICAL)\./);
  assert.equal(server.requests.length, 0, "nothing was sent to Jev");
  const routed = probeLines(probe).find((line) => line.event === "UserPromptSubmit" && line.phase === "routed");
  assert.equal(routed.jev_status, "skipped");
  assert.equal(routed.jev_reason, "no_time");
  assert.ok(!lateContext.includes(WALK), "an unchecked search does not claim that nothing is covered");

  // The next planning prompt starts on time, searches, and says it once.
  const next = await ask("Go ahead and plan the build of the agent's editing flow.", { SUPER_OUTER_JEV: "off" });
  assert.ok((next.hookSpecificOutput?.additionalContext ?? "").includes(WALK), "the notice was kept for a prompt that could check");
});
