import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { SUPER_OUTER_VERSION } from "./constants.mjs";

/**
 * An installer-owned block inside a hand-written instruction file.
 *
 * The problem this solves: `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` said
 * "Super-outer v4 guidance" while 5.3.0 was installed. Hand-written labels do
 * not update themselves, so the active instruction claimed a version that had
 * not been running for months.
 *
 * The block reports the *installed runtime version* and is rewritten on every
 * install. Everything outside the markers is the author's and is preserved
 * byte-for-byte — this file never reformats, reorders, or trims a line it does
 * not own.
 */

export const BEGIN_MARKER = "<!-- BEGIN SUPER-OUTER MANAGED GUIDANCE -->";
export const END_MARKER = "<!-- END SUPER-OUTER MANAGED GUIDANCE -->";

export function renderManagedGuidance(version = SUPER_OUTER_VERSION) {
  return [
    BEGIN_MARKER,
    `<!-- Written by the Super-outer installer. Edits inside this block are replaced. -->`,
    "",
    `## Super-outer — installed guidance (v${version})`,
    "",
    // From 5.19 the block is four points. Claude Code and Codex load it into
    // every session of every project, and the skill already holds the
    // procedure, so the block says only when to use the skill and the rules
    // that must hold even before the skill loads, including the two the OUTER
    // v3 replacement promised: native design authority and records that only
    // warn.
    "- For material engineering work, use the `super-outer` skill",
    "  (`super-outer:super-outer` in Claude Code, `$super-outer` in Codex). It",
    "  holds the procedure.",
    "- Ordinary analysis, code changes, tests, builds, and Git or CI work never",
    "  need an approval phrase. Missing, stale, branch-mismatched, or",
    "  multiple OUTER task records are bookkeeping warnings only and never block them.",
    "- Follow the repository's own design system, components, tokens, content,",
    "  accessibility, motion, and journey contracts before external style.",
    "- Ask for one exact `APPROVE SUPER-OUTER <token>` phrase only when the next",
    "  live action has a super-critical consequence: protected data, secrets or",
    "  authority, production delivery or infrastructure, a consequential external",
    "  transaction, protected history, or defeated recovery.",
    "",
    END_MARKER,
  ].join("\n");
}

const findBlock = (text) => {
  const start = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) return null;
  return { start, end: end + END_MARKER.length };
};

/**
 * Refuse rather than overwrite when an unmanaged section already claims to BE
 * the installed guidance. Silently replacing something a person wrote by hand
 * is exactly the behaviour the installer promises never to perform.
 *
 * Deliberately narrower than "any heading naming Super-outer". A reader who
 * keeps their own `## Super-outer — my own additions` notes beside the block
 * is not claiming to own the guidance, and refusing there would cost them the
 * managed block permanently while protecting nothing.
 */
const UNMANAGED_HEADING = /^##\s+Super-outer\b[^\n]*?(?:\bv\d|guidance)[^\n]*$/im;

export function planManagedGuidance(filePath, version = SUPER_OUTER_VERSION) {
  const exists = existsSync(filePath);
  const current = exists ? readFileSync(filePath, "utf8") : "";
  const block = findBlock(current);
  const rendered = renderManagedGuidance(version);

  if (block) {
    const next = current.slice(0, block.start) + rendered + current.slice(block.end);
    return { action: "replace", changed: next !== current, next, previous: current, exists };
  }

  if (UNMANAGED_HEADING.test(current)) {
    return {
      action: "refuse",
      changed: false,
      reason:
        "an unmanaged Super-outer guidance section already exists; rename or remove that heading before the installer takes ownership",
      previous: current,
      exists,
    };
  }

  const separator = current.length === 0 ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  const next = `${current}${separator}${rendered}\n`;
  return { action: "append", changed: true, next, previous: current, exists };
}

export function applyManagedGuidance(filePath, version = SUPER_OUTER_VERSION) {
  const plan = planManagedGuidance(filePath, version);
  if (plan.action === "refuse" || !plan.changed) return plan;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, plan.next, "utf8");
  return plan;
}

/** Removing the block restores the author's file exactly, markers and all. */
export function removeManagedGuidance(filePath) {
  if (!existsSync(filePath)) return { action: "absent", changed: false };
  const current = readFileSync(filePath, "utf8");
  const block = findBlock(current);
  if (!block) return { action: "absent", changed: false };
  const next = (current.slice(0, block.start) + current.slice(block.end)).replace(/\n{3,}$/, "\n");
  writeFileSync(filePath, next, "utf8");
  return { action: "removed", changed: true, next, previous: current };
}

/** The version the block currently claims, for skew detection. */
export function managedGuidanceVersion(filePath) {
  if (!existsSync(filePath)) return null;
  const match = readFileSync(filePath, "utf8").match(/## Super-outer — installed guidance \(v([0-9][^)]*)\)/);
  return match ? match[1] : null;
}
