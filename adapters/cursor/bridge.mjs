#!/usr/bin/env node
/**
 * Cursor host bridge for Super-outer.
 *
 * Maps Cursor hook events and JSON I/O onto the shared Claude/Codex hook
 * (`hooks/super-outer-hook.mjs`), then translates responses back into Cursor's
 * native fields where the formats diverge.
 *
 * Cursor already understands Claude nested PreToolUse deny responses. This
 * bridge still normalizes session, cwd, client, and Stop assistant-message
 * capture so the shared warn-first / rare-STOP policy runs correctly.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const EVENT_MAP = {
  beforeSubmitPrompt: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  beforeShellExecution: "PreToolUse",
  afterAgentResponse: null,
  stop: "Stop"
};

const firstString = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() || "";

// How long the bridge waits for the shared hook. For a prompt it is one second
// inside the limit adapters/cursor/hooks.json gives Cursor, so a slow hook
// still ends with the bridge's answer. A prompt has no refusal to lose by
// stopping early. A tool call and a stop keep the old 20 seconds, longer than
// Cursor's own limits, as before 5.20.1: stopping them early would gain
// nothing, because Cursor and the bridge both let the action through when the
// hook runs out of time, and it would drop a refusal that arrives in the last
// second.
const SHARED_HOOK_WAIT_MS = Object.freeze({
  beforeSubmitPrompt: 9_000,
  preToolUse: 20_000,
  beforeShellExecution: 20_000,
  stop: 20_000
});

const readInput = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
};

const writeOutput = (value = {}) => {
  process.stdout.write(JSON.stringify(value ?? {}));
};

const resolveRuntimeRoot = () => {
  const envRoot = firstString(process.env.SUPER_OUTER_ROOT, process.env.SUPER_OUTER_CURSOR_RUNTIME);
  if (envRoot && fs.existsSync(path.join(envRoot, "hooks", "super-outer-hook.mjs"))) {
    return path.resolve(envRoot);
  }

  const staged = path.join(os.homedir(), ".super-outer", "cursor-runtime");
  if (fs.existsSync(path.join(staged, "hooks", "super-outer-hook.mjs"))) {
    return staged;
  }

  const pluginRoots = [
    path.join(os.homedir(), ".claude", "plugins", "cache", "super-outer-developer-update", "super-outer"),
    path.join(os.homedir(), ".claude", "plugins", "cache", "super-outer", "super-outer")
  ];
  for (const root of pluginRoots) {
    const direct = path.join(root, "hooks", "super-outer-hook.mjs");
    if (fs.existsSync(direct)) return root;
    try {
      const versions = fs.readdirSync(root).sort().reverse();
      for (const version of versions) {
        const nested = path.join(root, version);
        if (fs.existsSync(path.join(nested, "hooks", "super-outer-hook.mjs"))) return nested;
      }
    } catch {}
  }

  const fromAdapter = path.resolve(HERE, "..", "..");
  if (fs.existsSync(path.join(fromAdapter, "hooks", "super-outer-hook.mjs"))) return fromAdapter;
  return null;
};

const stateDir = () => {
  const root = process.env.SUPER_OUTER_STATE_DIR || path.join(os.tmpdir(), "super-outer-state");
  const directory = path.join(path.resolve(root), "cursor-sessions");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
};

const assistantCachePath = (sessionId) => {
  const safe = createHash("sha256").update(String(sessionId || "unknown-session")).digest("hex").slice(0, 32);
  return path.join(stateDir(), `${safe}.assistant.json`);
};

const saveAssistantMessage = (id, text) => {
  if (!text) return;
  fs.writeFileSync(
    assistantCachePath(id),
    `${JSON.stringify({
      session_id: id || null,
      saved_at: new Date().toISOString(),
      text
    })}\n`,
    { mode: 0o600 }
  );
};

const loadAssistantMessage = (id) => {
  try {
    const payload = JSON.parse(fs.readFileSync(assistantCachePath(id), "utf8"));
    return firstString(payload.text);
  } catch {
    return "";
  }
};

const workspaceCwd = (input) => {
  const roots = Array.isArray(input.workspace_roots) ? input.workspace_roots : [];
  return firstString(
    input.cwd,
    input.working_directory,
    input.tool_input?.working_directory,
    roots[0],
    process.cwd()
  );
};

const sessionId = (input) =>
  firstString(
    process.env.SUPER_OUTER_SESSION_ID,
    input.conversation_id,
    input.session_id,
    input.sessionId,
    input.transcript_path,
    input.generation_id
  );

const normalizeToolName = (input, cursorEvent) => {
  if (cursorEvent === "beforeShellExecution") return "Shell";
  return firstString(input.tool_name, input.toolName, input.tool);
};

const normalizeToolInput = (input, cursorEvent) => {
  if (cursorEvent === "beforeShellExecution") {
    return {
      command: firstString(input.command, input.tool_input?.command),
      working_directory: workspaceCwd(input),
      ...(input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {}),
      ...(input.super_outer_scope ? { super_outer_scope: input.super_outer_scope } : {})
    };
  }
  return input.tool_input || input.arguments || input.input || input.args || {};
};

const toSharedInput = (input, cursorEvent, sharedEvent) => {
  const cwd = workspaceCwd(input);
  const session = sessionId(input);
  const shared = {
    ...input,
    cwd,
    working_directory: cwd,
    client: "cursor",
    client_name: "cursor",
    session_id: session,
    hook_event_name: sharedEvent,
    event_name: sharedEvent
  };

  if (sharedEvent === "UserPromptSubmit") {
    shared.prompt = firstString(input.prompt, input.user_prompt, input.userPrompt);
  }

  if (sharedEvent === "PreToolUse") {
    shared.tool_name = normalizeToolName(input, cursorEvent);
    shared.tool_input = normalizeToolInput(input, cursorEvent);
  }

  if (sharedEvent === "Stop") {
    shared.last_assistant_message = firstString(
      input.last_assistant_message,
      input.lastAssistantMessage,
      loadAssistantMessage(session)
    );
  }

  return shared;
};

const callSharedHook = (runtimeRoot, sharedEvent, sharedInput, waitMs) => {
  const hookPath = path.join(runtimeRoot, "hooks", "super-outer-hook.mjs");
  const result = spawnSync(process.execPath, [hookPath, sharedEvent], {
    cwd: firstString(sharedInput.cwd, process.cwd()),
    input: JSON.stringify(sharedInput),
    encoding: "utf8",
    env: {
      ...process.env,
      SUPER_OUTER_CLIENT: "cursor",
      SUPER_OUTER_SESSION_ID: firstString(sharedInput.session_id, process.env.SUPER_OUTER_SESSION_ID),
      SUPER_OUTER_VERSION: process.env.SUPER_OUTER_VERSION || "6.6.0"
    },
    timeout: waitMs
  });

  if (result.error || (result.status !== 0 && result.status !== null)) {
    return {
      bridge_error: true,
      stderr: String(result.stderr || result.error?.message || ""),
      status: result.status
    };
  }

  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    return {};
  }
};

const stripAnsi = (text) => String(text || "").replace(/\u001b\[[0-9;]*m/g, "");

const CURSOR_CONTEXT_LIMIT = 10_000;

const messageFromShared = (shared) =>
  firstString(
    shared.systemMessage,
    shared.reason,
    shared.hookSpecificOutput?.permissionDecisionReason,
    shared.user_message,
    shared.agent_message
  );

const isDenied = (shared) => {
  if (shared?.decision === "block") return true;
  if (shared?.hookSpecificOutput?.permissionDecision === "deny") return true;
  if (shared?.permission === "deny") return true;
  return false;
};

// Until 5.17.2 an allowed tool call returned a bare allow, so no tool warning,
// including the 5.17.0 plan notice, reached Cursor. Cursor's documentation
// gives user_message and agent_message only for a denied call. The Cursor
// agent CLI (2026.09.10 to 2026.10.01) and the desktop app (3.24.18) read
// `additional_context` on an allowed preToolUse and give it to the agent; they
// show the person nothing. So the person's warning goes to the agent with a
// request to pass it on. The plan notice comes both as a warning and as
// context, so context the warning already holds is left out. Cursor drops all
// of it above 10,000 characters.
const TOOL_WARNING_LEAD = "Cursor does not show the person Super-outer's warnings. Tell them this one in a line of your own: ";

const toolContextForCursor = (shared) => {
  const warning = stripAnsi(shared.systemMessage).trim();
  const context = stripAnsi(shared.hookSpecificOutput?.additionalContext).trim();
  const parts = [];
  if (warning) parts.push(`${TOOL_WARNING_LEAD}${warning}`);
  if (context && !(warning && warning.includes(context.replace(/^Super-outer:\s*/, "")))) parts.push(context);
  return parts.join("\n\n").slice(0, CURSOR_CONTEXT_LIMIT);
};

const translateForCursor = (cursorEvent, shared) => {
  if (!shared || shared.bridge_error) return {};

  if (cursorEvent === "beforeSubmitPrompt") {
    if (isDenied(shared)) {
      return {
        continue: false,
        user_message: stripAnsi(messageFromShared(shared)) || "Super-outer blocked this prompt."
      };
    }
    // Until 5.10.1 the route travelled as `agent_message`, which Cursor reads
    // only when a tool call is denied, so this copy of the route never reached
    // the agent. Cursor's documentation lists no context field for this event,
    // but the Cursor agent CLI (2026.09.10 to 2026.10.01) and the desktop app
    // (3.23.12) both read `additional_context` here and add it to the prompt.
    // The CLI discards the whole text above 10,000 characters, so it is cut to
    // fit. The shared hook leaves this empty when the imported Claude Code
    // plugin has already routed the same turn.
    const routed = stripAnsi(shared.hookSpecificOutput?.additionalContext).trim();
    return routed
      ? { continue: true, additional_context: routed.slice(0, CURSOR_CONTEXT_LIMIT) }
      : { continue: true };
  }

  if (cursorEvent === "preToolUse" || cursorEvent === "beforeShellExecution") {
    if (isDenied(shared)) {
      const reason = stripAnsi(messageFromShared(shared)) || "Super-outer blocked this action.";
      return {
        permission: "deny",
        user_message: reason,
        agent_message: reason,
        hookSpecificOutput: shared.hookSpecificOutput || {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason
        }
      };
    }
    if (cursorEvent !== "preToolUse") return { permission: "allow" };
    const context = toolContextForCursor(shared);
    return context ? { permission: "allow", additional_context: context } : { permission: "allow" };
  }

  if (cursorEvent === "stop") {
    if (isDenied(shared)) {
      const reason = stripAnsi(messageFromShared(shared));
      return reason ? { followup_message: reason } : {};
    }
    const notice = stripAnsi(messageFromShared(shared));
    if (notice && /\bSTOP\b/.test(notice)) {
      return { followup_message: notice };
    }
    return {};
  }

  return {};
};

const failOpen = (cursorEvent) => {
  if (cursorEvent === "beforeSubmitPrompt") return { continue: true };
  if (cursorEvent === "preToolUse" || cursorEvent === "beforeShellExecution") return { permission: "allow" };
  return {};
};

const main = async () => {
  const input = await readInput();
  const cursorEvent = firstString(process.argv[2], input.hook_event_name, input.event_name);

  if (cursorEvent === "afterAgentResponse") {
    saveAssistantMessage(sessionId(input), firstString(input.text, input.last_assistant_message));
    writeOutput({});
    return;
  }

  const sharedEvent = EVENT_MAP[cursorEvent];
  if (!sharedEvent) {
    writeOutput({});
    return;
  }

  const runtimeRoot = resolveRuntimeRoot();
  if (!runtimeRoot) {
    writeOutput(failOpen(cursorEvent));
    return;
  }

  const sharedInput = toSharedInput(input, cursorEvent, sharedEvent);
  const sharedOutput = callSharedHook(runtimeRoot, sharedEvent, sharedInput, SHARED_HOOK_WAIT_MS[cursorEvent] ?? 20_000);
  if (sharedOutput.bridge_error) {
    writeOutput(failOpen(cursorEvent));
    return;
  }
  writeOutput(translateForCursor(cursorEvent, sharedOutput));
};

main().catch(() => {
  writeOutput({});
  process.exit(0);
});
