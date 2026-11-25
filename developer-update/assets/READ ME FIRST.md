# Super-outer v__SUPER_OUTER_VERSION__ developer update

This package switches Super-outer on for Claude Code and Codex on this
computer. If you have the repository cloned instead, you do not need this
package at all: run `npm run setup` in the clone and stop reading here.

## Install

1. Quit Claude Code and Codex.
2. Double-click `Install Super-outer.command`.
3. Choose 1 for the optional learning skills, or 2 for no optional part.
4. Type `YES` once.
5. Restart Claude Code and Codex when the installer finishes.

If macOS blocks the first launch, Control-click the file, choose **Open**, and
confirm once.

## What changes

- Super-outer v__SUPER_OUTER_VERSION__ becomes the only active OUTER version.
- Any earlier OUTER 2.1 and v3 installation is deactivated and moved into a
  separate recovery archive. The old versions are not deleted.
- A Super-outer section is added to `~/.claude/CLAUDE.md` and
  `~/.codex/AGENTS.md`. The section states the version that is actually
  installed, and it is rewritten on every install.
- Everything outside that section is yours and is kept byte for byte. A section
  a previous installer wrote is removed only when it still matches that
  installer's exact text. If you edited it, or wrote your own section headed
  `## Super-outer`, it is left alone and named in the receipt so you can remove
  it yourself. Everything else still installs.
- Ordinary engineering work receives visible notices without repeated approval
  phrases. Approval is reserved for a concrete extreme consequence.
- Missing, stale, branch-mismatched, or multiple OUTER task records may produce
  a warning, but do not block ordinary tools, commits, integration merges, or CI.
- Cursor is not read or changed. It has its own installer.

## Optional parts

- The learning skills are Brief me and Meditate, for Claude Code and Codex.
  Brief me gives you the vocabulary of a field before you build in it, with
  each term's source page and an example request. Meditate turns a finished
  stretch of work into a short visual study that starts with a map of how the
  thing you built works.
- Your choice is saved. A later update keeps it unless you choose again.

Repositories that still contain the old v3 `outer-delivery-gate` have a
separate, repository-local legacy rule. This global update does not silently
rewrite project files. That old rule should be amended in the repository so
record-count findings warn instead of block.

## Your repository's design system still wins

Super-outer does not replace a repository's design system with generic taste.
For user-facing work it follows that repository's own instructions, components,
tokens, typography, spacing, accessibility rules, motion language, content
style, and journey contracts. It first reuses established local patterns and
uses external examples only when the repository genuinely has no direction.

UI/UX and motion remain first-class, but they do not dominate backend, data,
security, scale, reliability, architecture, integrations, operations, AI, or
delivery. The task decides the emphasis.

## Check or undo

- Double-click `Verify Super-outer.command` to confirm the installed state.
- Double-click `Roll Back Super-outer.command` to restore the managed files from
  before the latest update.

The installer writes a plain-English receipt to:

`~/.super-outer/developer-upgrade-receipt.txt`

Recovery archives live under:

`~/.super-outer/legacy-archives/`
