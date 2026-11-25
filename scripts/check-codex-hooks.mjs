#!/usr/bin/env node
/**
 * Whether Codex will load Super-outer's hooks from a plugin folder.
 *
 * Codex 0.163 reads a plugin whose root holds an Agent Plugins `plugin.json`
 * (the file with the agent-plugins.org `$schema`) through a loader that takes
 * skills and MCP servers but no hooks, and it then skips its usual
 * `hooks/hooks.json` discovery. Super-outer's Codex hooks never loaded from
 * 7 August to 28 October 2026 for that reason. The repository keeps the root
 * file for the Agent Plugins standard; the installable package leaves it out.
 *
 * `codexHookBlockers` reads only the file list and the Codex manifest, so it
 * runs in every build without Codex installed. `readCodexPluginHooks` asks an
 * installed Codex through its app server (`plugin/read`), which is the proof
 * that counts; it starts Codex locally and sends nothing to a model.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_PLUGINS_SCHEMA_HOST = "agent-plugins.org";

/** The events Codex must list for Super-outer to work there. */
export const REQUIRED_CODEX_HOOK_EVENTS = Object.freeze(["userPromptSubmit", "preToolUse", "stop"]);

/**
 * Reasons Codex would load no hooks from a plugin folder holding `relatives`.
 * `readText(relative)` returns a file's text; it is called only for files the
 * list contains. An empty result means nothing in the folder blocks discovery.
 */
export const codexHookBlockers = (relatives, readText = () => "") => {
  const files = new Set(relatives);
  const blockers = [];
  if (!files.has("hooks/hooks.json")) blockers.push("hooks/hooks.json is missing, so Codex has no hooks to find");
  if (files.has("plugin.json")) {
    const text = String(readText("plugin.json") ?? "");
    if (text.includes(AGENT_PLUGINS_SCHEMA_HOST) || text.includes("$schema")) {
      blockers.push("the root plugin.json is an Agent Plugins manifest, and Codex then loads skills and MCP only, never hooks");
    }
  }
  if (files.has(".codex-plugin/plugin.json")) {
    let manifest = {};
    try { manifest = JSON.parse(String(readText(".codex-plugin/plugin.json") ?? "{}")); } catch { blockers.push(".codex-plugin/plugin.json is not valid JSON"); }
    if (Object.hasOwn(manifest, "hooks")) blockers.push(".codex-plugin/plugin.json names hooks itself, which replaces Codex's default hooks/hooks.json discovery");
  } else {
    blockers.push(".codex-plugin/plugin.json is missing, so Codex does not recognise the plugin");
  }
  return blockers;
};

/** The same check over a folder on disk, such as an installed plugin copy. */
export const codexHookBlockersInFolder = (folder) => {
  const relatives = [];
  for (const name of ["plugin.json", "hooks/hooks.json", ".codex-plugin/plugin.json"]) {
    if (fs.existsSync(path.join(folder, name))) relatives.push(name);
  }
  return codexHookBlockers(relatives, (relative) => fs.readFileSync(path.join(folder, relative), "utf8"));
};

/**
 * Asks an installed Codex which hook events it finds in `pluginFolder`. The
 * folder is copied into a temporary marketplace first, so the person's own
 * Codex settings and plugin cache are read but never changed.
 */
export const readCodexPluginHooks = ({ pluginFolder, codex = "codex", timeoutMs = 30_000 } = {}) => new Promise((resolve) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "so-codex-hooks-"));
  const finish = (result) => {
    fs.rmSync(scratch, { recursive: true, force: true });
    resolve(result);
  };
  try {
    const name = JSON.parse(fs.readFileSync(path.join(pluginFolder, ".codex-plugin", "plugin.json"), "utf8")).name;
    fs.cpSync(pluginFolder, path.join(scratch, "plugins", name), { recursive: true });
    const marketplace = path.join(scratch, ".agents", "plugins", "marketplace.json");
    fs.mkdirSync(path.dirname(marketplace), { recursive: true });
    fs.writeFileSync(marketplace, JSON.stringify({
      name: "super-outer-hook-check",
      plugins: [{ name, source: { source: "local", path: `./plugins/${name}` }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" } }],
    }));
    let child;
    try { child = spawn(codex, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] }); } catch (error) { finish({ ran: false, reason: error.message }); return; }
    let buffer = "";
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      finish(result);
    };
    const timer = setTimeout(() => done({ ran: false, reason: "Codex did not answer in time" }), timeoutMs);
    child.on("error", (error) => done({ ran: false, reason: error.code === "ENOENT" ? "Codex is not installed" : error.message }));
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "plugin/read", params: { pluginName: name, marketplacePath: marketplace } });
        } else if (message.id === 2) {
          if (message.error) done({ ran: false, reason: message.error.message });
          else {
            const plugin = message.result?.plugin ?? message.result;
            done({
              ran: true,
              events: (plugin?.hooks ?? []).map((hook) => hook.eventName),
              skills: (plugin?.skills ?? []).filter((skill) => skill.enabled !== false).map((skill) => skill.name),
            });
          }
        }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "super-outer-hook-check", version: "1" } } });
  } catch (error) {
    finish({ ran: false, reason: error.message });
  }
});

/** Skill folders in `pluginFolder` that Codex did not list as enabled skills of `plugin`. */
export const missingCodexSkills = ({ pluginFolder, plugin = "super-outer", skills = [] }) => {
  const root = path.join(pluginFolder, "skills");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .filter((name) => !skills.includes(`${plugin}:${name}`));
};

/** The events from REQUIRED_CODEX_HOOK_EVENTS that Codex did not list. */
export const missingCodexHookEvents = (events) => REQUIRED_CODEX_HOOK_EVENTS.filter((event) => !events.includes(event));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    process.stderr.write("Usage: node scripts/check-codex-hooks.mjs <installed or staged plugin folder>\n");
    process.exit(2);
  }
  const folder = path.resolve(process.argv[2]);
  const blockers = codexHookBlockersInFolder(folder);
  if (blockers.length) {
    process.stderr.write(`Codex would load no Super-outer hooks from ${folder}:\n- ${blockers.join("\n- ")}\n`);
    process.exitCode = 1;
  } else {
    const result = await readCodexPluginHooks({ pluginFolder: folder });
    if (!result.ran) {
      process.stdout.write(`The folder looks right, but Codex could not be asked: ${result.reason}\n`);
    } else if (missingCodexHookEvents(result.events).length) {
      process.stderr.write(`Codex found these hook events: ${result.events.join(", ") || "none"}. Missing: ${missingCodexHookEvents(result.events).join(", ")}.\n`);
      process.exitCode = 1;
    } else if (missingCodexSkills({ pluginFolder: folder, skills: result.skills }).length) {
      process.stderr.write(`Codex does not list these skills: ${missingCodexSkills({ pluginFolder: folder, skills: result.skills }).join(", ")}.\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`Codex finds Super-outer's hooks (${result.events.join(", ")}) and skills (${result.skills.join(", ")}).\n`);
    }
  }
}
