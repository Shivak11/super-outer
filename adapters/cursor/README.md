# Cursor adapter

Native Cursor hooks for Super-outer v4. They reuse the shared Claude/Codex
dispatcher in `hooks/super-outer-hook.mjs` through a thin bridge.

## Events

| Cursor event | Shared event | Notes |
|---|---|---|
| `beforeSubmitPrompt` | `UserPromptSubmit` | Records the user turn and gives the agent the route as `additional_context`, at most 10,000 characters; rare blocks become `continue: false` |
| `preToolUse` | `PreToolUse` | Warn-first ordinary mutations; rare STOP becomes `permission: deny` |
| `afterAgentResponse` | _(local cache)_ | Saves assistant text so Stop can bind `APPROVE SUPER-OUTER` phrases |
| `stop` | `Stop` | Approval binding and delivery checks; Cursor cannot hard-block Stop, so a critical stop becomes `followup_message` |

`additional_context` is missing from Cursor's documentation for
`beforeSubmitPrompt`; the Cursor agent CLI 2026.10.01 and the desktop app
3.23.12 both read it.

## With Super-outer in Claude Code too

Cursor also runs the Claude Code plugin's hooks by default, so with Super-outer
installed in both hosts the shared hook runs twice for each Cursor prompt, tool
call and stop. Cursor lets a refusal from either copy win, and before 5.10.2
the Claude Code copy refused every extremely critical action that had been
approved through the bridge.

From 5.10.2 the bridge owns every Cursor event. The Claude Code copy returns
nothing when `~/.cursor/hooks.json` runs the bridge for the same event. With a
bridge from before 5.10.1, which sent the route in a field Cursor ignores, the
Claude Code copy still routes prompts. Without the bridge it keeps every event,
reads the project from Cursor's `workspace_roots` on a prompt, and cannot bind an approval
phrase, because Cursor does not give it the assistant's text. When both copies
route the same prompt, the first to claim the turn's `generation_id` gives the
route and the other stays quiet.

## Install globally

From this repository:

```sh
node scripts/install-cursor.mjs
```

This stages a runtime copy under `~/.super-outer/cursor-runtime`, installs the
bridge at `~/.cursor/hooks/super-outer-bridge.mjs`, and merges Super-outer
entries into `~/.cursor/hooks.json` without removing unrelated hooks.

Restart Cursor (or open a new agent chat) after installation. Confirm in
**Cursor Settings → Hooks**.

## Policy

The repository's own design system remains authoritative. Super-outer stays
warn-first: ordinary reversible work continues; only an extremely critical
consequence asks for one exact approval phrase.
