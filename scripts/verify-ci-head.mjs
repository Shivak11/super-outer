#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const verifyCiHead = ({ cwd = process.cwd(), expected = process.env.SUPER_OUTER_CI_HEAD } = {}) => {
  const candidate = String(expected || "").trim();
  if (!/^[a-f0-9]{40}$/.test(candidate)) {
    throw new Error("The remote check did not identify the exact candidate version.");
  }
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  if (actual !== candidate) {
    throw new Error("The remote check is running against a different version from the candidate.");
  }
  return {
    schema_version: "1.0.0",
    status: "IDENTITY_CONFIRMED",
    terminal: false,
    conclusion: null,
    evidence_layer: "ci-execution-identity",
    head: actual,
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyCiHead();
    process.stdout.write(`Remote checks are running against the exact candidate ${result.head}.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
