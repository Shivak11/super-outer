#!/usr/bin/env node
/**
 * Rewrites the pinned payload digest in the developer update runtime.
 *
 * The digest is what lets an installed plugin be recognised as exactly the
 * reviewed payload rather than something that merely shares a version number.
 * It must therefore stay a real gate. Keeping a one-command fix beside it is
 * what stops that gate from stranding the next contributor: edit source, run
 * this, commit both.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { developerPayloadDigest } from "../developer-update/build.mjs";

const ROOT = path.dirname(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))));
const RUNTIME = path.join(ROOT, "developer-update", "runtime", "developer-upgrade.mjs");
const PATTERN = /^export const PAYLOAD_DIGEST = "[a-f0-9]{64}";$/m;

export const syncPayloadDigest = ({ root = ROOT, write = true } = {}) => {
  const actual = developerPayloadDigest(root);
  const source = fs.readFileSync(RUNTIME, "utf8");
  const current = source.match(/PAYLOAD_DIGEST = "([a-f0-9]{64})"/)?.[1] ?? null;
  if (current === actual) return { changed: false, digest: actual };
  if (!PATTERN.test(source)) throw new Error("The payload digest declaration could not be found.");
  if (write) fs.writeFileSync(RUNTIME, source.replace(PATTERN, `export const PAYLOAD_DIGEST = "${actual}";`), "utf8");
  return { changed: true, digest: actual, previous: current };
};

const invokedDirectly = process.argv[1] &&
  fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const result = syncPayloadDigest();
  process.stdout.write(result.changed
    ? `Payload digest updated to ${result.digest}. Commit developer-update/runtime/developer-upgrade.mjs with your change.\n`
    : `Payload digest is already current (${result.digest}).\n`);
}
