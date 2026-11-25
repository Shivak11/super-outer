// The key file reading is ported from Super-outer Experimental's jev-route-check (scripts/jev-client.mjs, loadKey).
/**
 * Jev's settings: whether it is switched on, which key it uses, and whether
 * the private record is kept.
 *
 * Only a key placed for Super-outer switches Jev on. The owner decided this on
 * 7 October 2026. Many people set a general OpenRouter key for other tools,
 * and installing Super-outer must not start sending their prompts to
 * OpenRouter and TypeSafe without their choosing it. So this module reads one
 * key variable, SUPER_OUTER_OPENROUTER_KEY, from the environment or from
 * Super-outer's own key file, and no other key and no other file.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { MODEL_NAME } from "./client.mjs";

export const KEY_VARIABLE = "SUPER_OUTER_OPENROUTER_KEY";
export const SWITCH_VARIABLE = "SUPER_OUTER_JEV";
export const RECORD_VARIABLE = "SUPER_OUTER_JEV_RECORD";
export const KEY_FILE_NAME = "jev.env";
/**
 * The decision model can be changed by name, for example to a successor that
 * OpenRouter serves on the same System One endpoint. A value that does not read
 * as a model name is ignored and the default model is used.
 */
export const MODEL_VARIABLE = "SUPER_OUTER_JEV_MODEL";

export function resolveConfigDir(env = process.env, home = os.homedir()) {
  return env?.SUPER_OUTER_CONFIG_DIR || path.join(home, ".config", "super-outer");
}

export function resolveDataDir(env = process.env, home = os.homedir()) {
  return env?.SUPER_OUTER_DATA_DIR || path.join(home, ".local", "share", "super-outer");
}

const OFF = /^(?:off|0|false)$/i;
const ON = /^on$/i;
const word = (value) => String(value ?? "").trim();

// A value in one pair of matching quotes keeps everything inside them. An
// unquoted value loses a trailing comment, so "SUPER_OUTER_JEV=off # paused"
// still switches Jev off.
const unquote = (value) => {
  const first = value[0];
  if (value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1);
  return value.replace(/\s+#.*$/, "");
};

/**
 * The assignments in a key file, one NAME=value to a line, as a map from each
 * name to every value it was given, in file order. A line may start with
 * "export ", and spaces around the name, the equals sign and the value are
 * ignored. A line starting with # is a comment.
 */
function parseKeyFile(text) {
  const values = new Map();
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const found = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!found) continue;
    values.set(found[1], [...(values.get(found[1]) ?? []), word(unquote(found[2].trim()))]);
  }
  return values;
}

// When the key is given twice, the first line counts, as in the route check.
// A person stops Jev or the record by adding an off line, often below an
// earlier on line, so for the two switches an off on any line wins.
const firstOf = (values, name) => values.get(name)?.[0] ?? "";
const anyOff = (values, name) => (values.get(name) ?? []).some((value) => OFF.test(value));
const onWithoutOff = (values, name) => (values.get(name) ?? []).some((value) => ON.test(value)) && !anyOff(values, name);

/**
 * The key in a file that anyone other than its owner can read is refused.
 * Its off switch still counts, because a person who follows the reminder and
 * adds an off line to a new file should get no more reminders. Anything that
 * is not an ordinary file, such as a named pipe, is ignored, because reading
 * one could make the hook wait. A session started by the desktop app may not
 * inherit variables set in a shell profile, so the file is the dependable
 * place for the key.
 */
function readKeyFile(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { readableByOthers: false, values: new Map() };
  }
  if (!stat.isFile()) return { readableByOthers: false, values: new Map() };
  let values = new Map();
  try {
    values = parseKeyFile(fs.readFileSync(file, "utf8"));
  } catch {
    values = new Map();
  }
  if ((stat.mode & 0o077) !== 0) return { readableByOthers: true, offInFile: anyOff(values, SWITCH_VARIABLE), values: new Map() };
  return { readableByOthers: false, values };
}

/**
 * Returns { key, keySource, state, record }. The state is one of "on",
 * "off", "no_key" and "key_file_permissions". The off switch in the
 * environment is checked before the key file is opened.
 */
export function loadSettings({ env = process.env, configDir } = {}) {
  const without = (state) => ({ key: null, keySource: null, state, record: false });
  try {
    if (OFF.test(word(env?.[SWITCH_VARIABLE]))) return without("off");
    const file = readKeyFile(path.join(configDir ?? resolveConfigDir(env), KEY_FILE_NAME));
    if (file.readableByOthers) return without(file.offInFile ? "off" : "key_file_permissions");
    if (anyOff(file.values, SWITCH_VARIABLE)) return without("off");

    // The record is kept only when it is switched on, and an off in the
    // environment outranks an on in the file.
    const recordInEnvironment = word(env?.[RECORD_VARIABLE]);
    const record =
      ON.test(recordInEnvironment) ||
      (!OFF.test(recordInEnvironment) && onWithoutOff(file.values, RECORD_VARIABLE));

    // The model field is present only when a valid model is named, so the
    // default settings keep the shape they had before 5.10.
    const named = word(env?.[MODEL_VARIABLE]) || firstOf(file.values, MODEL_VARIABLE);
    const model = MODEL_NAME.test(named) ? { model: named } : {};

    const fromEnvironment = word(env?.[KEY_VARIABLE]);
    if (fromEnvironment) return { key: fromEnvironment, keySource: "env", state: "on", record, ...model };
    const fromFile = firstOf(file.values, KEY_VARIABLE);
    if (fromFile) return { key: fromFile, keySource: "file", state: "on", record, ...model };
    return { key: null, keySource: null, state: "no_key", record, ...model };
  } catch {
    return without("no_key");
  }
}
