// The key file tests are ported from Super-outer Experimental's tests/jev-client.test.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { loadSettings, resolveConfigDir, resolveDataDir } from "../src/jev/settings.mjs";

// Every test here uses its own temporary folders. Once a real key file exists
// in ~/.config/super-outer, a test that read the default folder would pick up
// the real key.
const temporary = (t, prefix) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const writeKeyFile = (directory, text, mode = 0o600) => {
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "jev.env");
  fs.writeFileSync(file, text, { mode });
  fs.chmodSync(file, mode);
  return file;
};
const settingsWith = (t, { env = {}, file = null, mode = 0o600 } = {}) => {
  const configDir = temporary(t, "jev-settings-");
  if (file !== null) writeKeyFile(configDir, file, mode);
  return loadSettings({ env, configDir });
};

test("the config and data folders default to Super-outer's own folders under the home folder", () => {
  assert.equal(resolveConfigDir({}, "/home/someone"), path.join("/home/someone", ".config", "super-outer"));
  assert.equal(resolveDataDir({}, "/home/someone"), path.join("/home/someone", ".local", "share", "super-outer"));
  assert.equal(resolveConfigDir({ SUPER_OUTER_CONFIG_DIR: "/tmp/config" }, "/home/someone"), "/tmp/config");
  assert.equal(resolveDataDir({ SUPER_OUTER_DATA_DIR: "/tmp/data" }, "/home/someone"), "/tmp/data");
});

test("the key in the environment is used first, trimmed, and the state is on", (t) => {
  assert.deepEqual(settingsWith(t, { env: { SUPER_OUTER_OPENROUTER_KEY: "  from-the-environment  " }, file: "SUPER_OUTER_OPENROUTER_KEY=from-the-file\n" }), {
    key: "from-the-environment",
    keySource: "env",
    state: "on",
    record: false,
  });
});

test("with no key in the environment the key file is read", (t) => {
  assert.deepEqual(settingsWith(t, { file: "# my key for Super-outer\nSUPER_OUTER_OPENROUTER_KEY=from-the-file\n" }), {
    key: "from-the-file",
    keySource: "file",
    state: "on",
    record: false,
  });
});

test("a key file line written with export, spaces or one pair of matching quotes is read the same way", (t) => {
  for (const line of [
    'export SUPER_OUTER_OPENROUTER_KEY="from-the-file"',
    "export SUPER_OUTER_OPENROUTER_KEY='from-the-file'",
    "  SUPER_OUTER_OPENROUTER_KEY = from-the-file  ",
    "SUPER_OUTER_OPENROUTER_KEY=from-the-file\r",
  ]) {
    assert.equal(settingsWith(t, { file: `${line}\n` }).key, "from-the-file", line);
  }
  // Quotes that do not match are part of the value.
  assert.equal(settingsWith(t, { file: "SUPER_OUTER_OPENROUTER_KEY=\"from-the-file'\n" }).key, "\"from-the-file'");
});

test("with no key anywhere the state is no_key", (t) => {
  assert.deepEqual(settingsWith(t), { key: null, keySource: null, state: "no_key", record: false });
  assert.deepEqual(settingsWith(t, { file: "# nothing here yet\n" }), { key: null, keySource: null, state: "no_key", record: false });
});

test("a general OPENROUTER_API_KEY in the environment never switches Jev on, and the same value under Super-outer's name does", (t) => {
  assert.equal(settingsWith(t, { env: { OPENROUTER_API_KEY: "general-key-0123456789" } }).state, "no_key");
  assert.equal(settingsWith(t, { env: { SUPER_OUTER_OPENROUTER_KEY: "general-key-0123456789" } }).state, "on");
});

test("an OPENROUTER_API_KEY line in Super-outer's key file is not read, and the same value under Super-outer's name is", (t) => {
  assert.equal(settingsWith(t, { file: "OPENROUTER_API_KEY=general-key-0123456789\n" }).state, "no_key");
  assert.equal(settingsWith(t, { file: "SUPER_OUTER_OPENROUTER_KEY=general-key-0123456789\n" }).state, "on");
});

test("the Experimental key file is never read, and the same file in Super-outer's folder is", (t) => {
  const home = temporary(t, "jev-settings-home-");
  const text = "OPENROUTER_API_KEY=experimental-key-0123456789\nSUPER_OUTER_OPENROUTER_KEY=experimental-key-0123456789\n";
  const experimentalFolder = path.join(home, ".config", "super-outer-experimental");
  writeKeyFile(experimentalFolder, text);

  const env = { SUPER_OUTER_EXPERIMENTAL_CONFIG_DIR: experimentalFolder };
  assert.equal(resolveConfigDir(env, home), path.join(home, ".config", "super-outer"));
  assert.equal(loadSettings({ env, configDir: resolveConfigDir(env, home) }).state, "no_key");

  writeKeyFile(path.join(home, ".config", "super-outer"), text);
  const found = loadSettings({ env, configDir: resolveConfigDir(env, home) });
  assert.deepEqual([found.state, found.keySource, found.key], ["on", "file", "experimental-key-0123456789"]);
});

test("SUPER_OUTER_JEV=off in the environment, in any case and also written as 0 or false, switches Jev off", (t) => {
  const file = "SUPER_OUTER_OPENROUTER_KEY=from-the-file\nSUPER_OUTER_JEV_RECORD=on\n";
  for (const value of ["off", "OFF", "Off", "0", "false", "False", " off "]) {
    assert.deepEqual(
      settingsWith(t, { env: { SUPER_OUTER_JEV: value, SUPER_OUTER_OPENROUTER_KEY: "from-the-environment" }, file }),
      { key: null, keySource: null, state: "off", record: false },
      value,
    );
  }
  assert.equal(settingsWith(t, { env: { SUPER_OUTER_JEV: "on", SUPER_OUTER_OPENROUTER_KEY: "from-the-environment" }, file }).state, "on");
});

test("the off switch in the environment is checked before the key file, so a key file others can read does not matter then", (t) => {
  const file = "SUPER_OUTER_OPENROUTER_KEY=from-the-file\n";
  assert.equal(settingsWith(t, { env: { SUPER_OUTER_JEV: "off" }, file, mode: 0o644 }).state, "off");
  assert.equal(settingsWith(t, { env: {}, file, mode: 0o644 }).state, "key_file_permissions");
});

test("SUPER_OUTER_JEV=off in the key file switches Jev off, even with a key in the environment", (t) => {
  const env = { SUPER_OUTER_OPENROUTER_KEY: "from-the-environment" };
  for (const line of ["SUPER_OUTER_JEV=off", "export SUPER_OUTER_JEV=OFF", 'SUPER_OUTER_JEV="off"', "SUPER_OUTER_JEV=off # paused for a week"]) {
    assert.deepEqual(settingsWith(t, { env, file: `SUPER_OUTER_OPENROUTER_KEY=from-the-file\n${line}\n` }), { key: null, keySource: null, state: "off", record: false }, line);
  }
  assert.equal(settingsWith(t, { env, file: "SUPER_OUTER_OPENROUTER_KEY=from-the-file\nSUPER_OUTER_JEV=on\n" }).state, "on");
});

test("an off line anywhere in the key file switches Jev off, also below an earlier on line", (t) => {
  const keyLine = "SUPER_OUTER_OPENROUTER_KEY=from-the-file\n";
  for (const lines of ["SUPER_OUTER_JEV=on\nSUPER_OUTER_JEV=off\n", "SUPER_OUTER_JEV=off\nSUPER_OUTER_JEV=on\n"]) {
    assert.equal(settingsWith(t, { file: `${keyLine}${lines}` }).state, "off", lines);
  }
});

test("an off line anywhere in the key file stops the record, also below an earlier on line", (t) => {
  const keyLine = "SUPER_OUTER_OPENROUTER_KEY=from-the-file\n";
  for (const lines of ["SUPER_OUTER_JEV_RECORD=on\nSUPER_OUTER_JEV_RECORD=off\n", "SUPER_OUTER_JEV_RECORD=off\nSUPER_OUTER_JEV_RECORD=on\n"]) {
    assert.equal(settingsWith(t, { file: `${keyLine}${lines}` }).record, false, lines);
  }
  assert.equal(settingsWith(t, { file: `${keyLine}SUPER_OUTER_JEV_RECORD=on\nSUPER_OUTER_JEV_RECORD=on\n` }).record, true);
});

test("when the key is given twice in the key file, the first line counts, as in the route check", (t) => {
  assert.equal(settingsWith(t, { file: "SUPER_OUTER_OPENROUTER_KEY=first-key\nSUPER_OUTER_OPENROUTER_KEY=second-key\n" }).key, "first-key");
});

test("the key in a file that its group or anyone else can read is refused, even when the environment holds a key", (t) => {
  const file = "SUPER_OUTER_OPENROUTER_KEY=from-the-file\nSUPER_OUTER_JEV_RECORD=on\n";
  for (const mode of [0o644, 0o640, 0o604, 0o660, 0o666]) {
    assert.deepEqual(
      settingsWith(t, { env: { SUPER_OUTER_OPENROUTER_KEY: "from-the-environment" }, file, mode }),
      { key: null, keySource: null, state: "key_file_permissions", record: false },
      mode.toString(8),
    );
  }
  // The key in a refused file is never used, but its off switch counts, so a
  // person who follows the reminder with a newly created file is not
  // reminded again (from the 5.8.0 review).
  assert.equal(settingsWith(t, { file: "SUPER_OUTER_JEV=off\n", mode: 0o644 }).state, "off");
  assert.equal(settingsWith(t, { file: `${file}SUPER_OUTER_JEV=off\n`, mode: 0o644 }).key, null);
  for (const mode of [0o600, 0o400]) {
    assert.equal(settingsWith(t, { file, mode }).state, "on", mode.toString(8));
  }
});

test("the record is kept only when SUPER_OUTER_JEV_RECORD is on, and an off in the environment outranks an on in the file", (t) => {
  const key = { SUPER_OUTER_OPENROUTER_KEY: "from-the-environment" };
  const keyLine = "SUPER_OUTER_OPENROUTER_KEY=from-the-file\n";
  assert.equal(settingsWith(t, { env: key }).record, false);
  assert.equal(settingsWith(t, { env: { ...key, SUPER_OUTER_JEV_RECORD: "on" } }).record, true);
  assert.equal(settingsWith(t, { env: { ...key, SUPER_OUTER_JEV_RECORD: "ON" } }).record, true);
  assert.equal(settingsWith(t, { file: `${keyLine}SUPER_OUTER_JEV_RECORD=on\n` }).record, true);
  assert.equal(settingsWith(t, { env: { SUPER_OUTER_JEV_RECORD: "off" }, file: `${keyLine}SUPER_OUTER_JEV_RECORD=on\n` }).record, false);
  assert.equal(settingsWith(t, { env: { SUPER_OUTER_JEV_RECORD: "on" }, file: `${keyLine}SUPER_OUTER_JEV_RECORD=off\n` }).record, true);
  assert.equal(settingsWith(t, { file: `${keyLine}SUPER_OUTER_JEV_RECORD=yes\n` }).record, false);
  assert.equal(settingsWith(t, { env: { SUPER_OUTER_JEV: "off", SUPER_OUTER_JEV_RECORD: "on" }, file: keyLine }).record, false);
});

test("loadSettings never throws, whatever the key file path holds", (t) => {
  const configDir = temporary(t, "jev-settings-odd-");
  fs.mkdirSync(path.join(configDir, "jev.env"), { mode: 0o700 });
  fs.chmodSync(path.join(configDir, "jev.env"), 0o700);
  assert.equal(loadSettings({ env: {}, configDir }).state, "no_key");
  assert.equal(loadSettings({ env: { SUPER_OUTER_OPENROUTER_KEY: "from-the-environment" }, configDir }).state, "on");
  assert.equal(loadSettings({ env: null, configDir }).state, "no_key");
});

// From the 5.8.0 review: a named pipe in place of the key file made the hook
// wait until it was killed.
test("a key file that is not an ordinary file is ignored without waiting", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "so-jev-fifo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const made = spawnSync("mkfifo", [path.join(dir, "jev.env")]);
  if (made.status !== 0) return t.skip("mkfifo is not available");
  // A read of the pipe would block this whole process, so the check runs in a
  // child process that is killed after three seconds. A regression then fails
  // the test instead of stopping the test run.
  const settingsUrl = new URL("../src/jev/settings.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `const { loadSettings } = await import(${JSON.stringify(settingsUrl)}); process.stdout.write(loadSettings({ env: {}, configDir: ${JSON.stringify(dir)} }).state);`,
  ], { encoding: "utf8", timeout: 3000, env: {} });
  assert.equal(child.signal, null, "loadSettings waited on the pipe until it was killed");
  assert.equal(child.stdout, "no_key");
});
