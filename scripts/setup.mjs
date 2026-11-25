#!/usr/bin/env node
/**
 * One command that switches Super-outer on for Claude Code and Codex from a
 * fresh clone.
 *
 * Why this file exists: `super-outer install` stages into a throwaway folder
 * and deliberately refuses the real home, which is correct for verification
 * and useless for a developer who just cloned the repository. The only path
 * that actually switches the plugin on lived inside a packaged zip that the
 * documentation never mentioned, so a careful reader concluded installation
 * was blocked on purpose and stopped. It was not blocked; it was unreachable.
 *
 * This builds that same package, unpacks it, and runs it. Nothing here is a
 * second installation mechanism: the artifact installed is byte-for-byte the
 * one a released zip would carry, so both routes carry identical proof.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildDeveloperPackage, DEVELOPER_PACKAGE_NAME } from "../developer-update/build.mjs";
import {
  describeComponents,
  hostAvailable,
  installDeveloperUpgrade,
  normalizeComponents,
  rollbackDeveloperUpgrade,
  verifyDeveloperUpgrade,
  VERSION,
} from "../developer-update/runtime/developer-upgrade.mjs";

const ROOT = path.dirname(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))));
const MINIMUM_NODE_MAJOR = 22;
const BUNDLE_DIRECTORY = `Super-outer-Developer-Update-${VERSION}`;

const COMMANDS = Object.freeze(["install", "verify", "rollback"]);

const parseArguments = (values) => {
  const args = { command: "install", json: false, home: undefined, components: undefined };
  let index = 0;
  if (values[0] && !values[0].startsWith("--")) {
    if (!COMMANDS.includes(values[0])) throw new Error(`Use one of: ${COMMANDS.join(", ")}.`);
    args.command = values[0];
    index = 1;
  }
  for (; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--json") args.json = true;
    else if (value === "--home") args.home = values[++index];
    else if (value === "--components") {
      const choice = values[++index];
      if (choice === undefined || choice.trim() === "" || choice.startsWith("--")) throw new Error("Give --components a value: skills or none.");
      args.components = normalizeComponents(choice);
    }
    else throw new Error(`Unknown option: ${value}. Use --components <skills|none>, --home <directory> or --json.`);
  }
  return args;
};

const assertEnvironment = ({ requireHost = true } = {}) => {
  if (!["darwin", "linux"].includes(process.platform) && process.env.SUPER_OUTER_ALLOW_TEST_PLATFORM !== "1") {
    throw new Error("Super-outer installs on macOS and Linux. Windows is not supported.");
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(`Super-outer needs Node ${MINIMUM_NODE_MAJOR} or newer. This is Node ${process.versions.node}.`);
  }
  if (requireHost && !hostAvailable("claude") && !hostAvailable("codex")) {
    throw new Error(
      "Neither Claude Code nor Codex was found on your PATH. Install at least one of them, then run this again.",
    );
  }
};

/** The package is a zip so that this route and the released route stay identical. */
const unpack = (packageFile) => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "super-outer-setup-"));
  const extracted = spawnSync("unzip", ["-q", packageFile, "-d", destination], { encoding: "utf8" });
  if (extracted.error?.code === "ENOENT") {
    throw new Error("This needs the `unzip` command, which was not found. Install unzip and run this again.");
  }
  if (extracted.status !== 0) throw new Error(`The installer package could not be unpacked: ${extracted.stderr.trim()}`);
  return path.join(destination, BUNDLE_DIRECTORY);
};

/** Build and unpack the same artifact a released zip would carry. */
const prepareBundle = (root) => {
  const built = buildDeveloperPackage({ root, outputDir: path.join(root, "dist", "developer-update") });
  return { built, bundleRoot: unpack(built.package) };
};

export const setup = async ({ command = "install", home, root = ROOT, components } = {}) => {
  assertEnvironment({ requireHost: command === "install" });
  const { built, bundleRoot } = prepareBundle(root);
  const run = {
    install: () => installDeveloperUpgrade({ home, bundleRoot, yes: true, components }),
    verify: () => verifyDeveloperUpgrade({ home, bundleRoot, components }),
    rollback: () => rollbackDeveloperUpgrade({ home, bundleRoot, yes: true }),
  }[command];
  const result = await run();
  return { ...result, command, package: built.package, packageSha256: built.sha256 };
};

const describe = (result) => {
  const lines = [];
  const hosts = Object.entries(result.hosts ?? {}).filter(([, host]) => host.present).map(([name]) => name);
  if (result.command === "rollback") {
    lines.push(`Super-outer ${VERSION} was removed and the previous files were restored.`);
    lines.push("Restart Claude Code and Codex.");
    return lines.join("\n");
  }
  if (result.command === "verify") {
    lines.push(result.valid
      ? `Super-outer ${VERSION} is switched on for ${hosts.join(" and ") || "no host"}.`
      : `Super-outer is not fully switched on. Unresolved: ${result.failures.join(", ")}.`);
    return lines.join("\n");
  }
  lines.push(result.idempotent
    ? `Super-outer ${VERSION} was already switched on. Nothing needed changing.`
    : `Super-outer ${VERSION} is switched on for ${hosts.join(" and ")}.`);
  lines.push(`Optional parts: ${describeComponents(result.components)}.`);
  for (const host of result.receipt?.hosts ?? []) {
    for (const id of host.replaced ?? []) {
      lines.push(`The copy of ${id.split("@")[0]} from ${id.split("@")[1] ?? "another source"} was replaced, so only one copy runs in ${host.host === "claude" ? "Claude Code" : "Codex"}.`);
    }
  }
  for (const entry of result.receipt?.guidance ?? []) {
    if (entry.action === "refuse") {
      lines.push(`Your own "## Super-outer" section in ~/${entry.file} was left exactly as you wrote it.`);
      lines.push("Rename that heading if you would like the installer to keep it up to date for you.");
    }
  }
  for (const note of result.notes ?? []) {
    if (note.endsWith("legacy-guidance-left-to-author")) {
      lines.push(`⚠️ An older Super-outer section in ~/${note.startsWith("claude") ? ".claude/CLAUDE.md" : ".codex/AGENTS.md"} had been edited, so it was left alone.`);
      lines.push("Delete that older section by hand; the new one sits below it.");
    } else if (!note.endsWith("guidance-left-to-author")) {
      lines.push(`⚠️ Worth a look: ${note}`);
    }
  }
  lines.push("Restart Claude Code and Codex, then use /super-outer:super-outer or $super-outer.");
  return lines.join("\n");
};

const invokedDirectly = process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const result = await setup({ command: args.command, home: args.home, components: args.components });
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${describe(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
