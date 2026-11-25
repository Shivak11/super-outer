/**
 * The environment a test hands to a process it starts.
 *
 * A test process inherits the developer's environment, and on Shiva's machine
 * that environment can hold an OpenRouter key. From 5.8.0 the prompt hook can
 * send a typed request to OpenRouter, so a test that passed the environment
 * through unchanged could send test prompts under a real account. This helper
 * removes every key and Jev variable, points Super-outer's key and record
 * folders at empty folders, and switches Jev off. A test that exercises Jev
 * passes `{ jev: "on" }` and points the call at a local server itself.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const JEV_VARIABLES = Object.freeze([
  "OPENROUTER_API_KEY",
  "SUPER_OUTER_OPENROUTER_KEY",
  "SUPER_OUTER_JEV",
  "SUPER_OUTER_JEV_RECORD",
  "SUPER_OUTER_JEV_MODEL",
  "SUPER_OUTER_JEV_ENDPOINT",
  "SUPER_OUTER_JEV_TIMEOUT_MS",
  "SUPER_OUTER_CONFIG_DIR",
  "SUPER_OUTER_DATA_DIR",
]);

let emptyFolders = null;
const folders = () => {
  if (emptyFolders) return emptyFolders;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "so-isolated-env-"));
  process.on("exit", () => fs.rmSync(base, { recursive: true, force: true }));
  emptyFolders = { config: path.join(base, "config"), data: path.join(base, "data"), home: path.join(base, "home") };
  return emptyFolders;
};

export function isolatedEnv(extra = {}, { jev = "off" } = {}) {
  const env = { ...process.env };
  for (const name of JEV_VARIABLES) delete env[name];
  env.SUPER_OUTER_CONFIG_DIR = folders().config;
  env.SUPER_OUTER_DATA_DIR = folders().data;
  // The shared hook leaves Cursor events to an installed Cursor bridge, which
  // it looks for under this home. Shiva's own home has one, so a test that
  // looked there would pass or fail depending on the computer. Advisory mode
  // is a personal setting too, and it turns every refusal into a notice.
  env.SUPER_OUTER_INSTALL_HOME = folders().home;
  delete env.SUPER_OUTER_ENFORCEMENT;
  if (jev === "off") env.SUPER_OUTER_JEV = "off";
  return { ...env, ...extra };
}
