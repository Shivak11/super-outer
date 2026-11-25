# How Super-outer is organised

Super-outer has one conversation layer and several internal evidence layers.

## The conversation layer

One router speaks to the owner. It receives the task, learns the repository's own
rules, decides how much review is warranted, gathers specialist findings, and
translates them into:

- the intended outcome;
- the user or business consequence;
- the recommendation;
- any genuine choice for the owner;
- what is proved and what remains open.

Specialists never interview the owner directly.

## The internal layers

The router selects among twelve peer engineering dimensions. Selection happens
from evidence about impact, uncertainty, novelty, reversibility, affected
boundaries, and missing information. File order or module order does not create
priority.

Warn-first enforcement does not change specialist selection or make delivery
more important than another dimension. It is a separate consequence check
after the router has gathered the relevant evidence.

Each selected specialist loads only the relevant smaller playbooks. All use the
same result contract, but the content differs by domain. UI/UX may contain more
interpretive product decisions; security and data contain more non-negotiable
conditions; backend, scale, and reliability often contain measured trade-offs.

Repository profiles point to local sources and record their content hashes.
Changed sources are reread. Unchanged sources can be reused. A repeated pattern
in code remains an observation; it never silently becomes company policy.
Source and inheritance paths are checked after symbolic links are resolved.
Status, authority, summary, and sources move together during inheritance, so an
observed repository exception cannot wear an explicit company-policy label.

## Enforcement and proof

Ordinary material work does not require a Super-outer approval phrase.
Brainstorming, evidence gathering, reversible code changes, tests, builds, and
routine repository delivery keep moving. A short-lived, task-bound approval is
reserved for the rare extremely critical action. Repository gates independently
calculate the real branch, base, changed files, deleted files, worktree,
current version, CI version, and release version.

A mismatch between the recorded and active branch normally produces an
advisory warning. Read-only work, local checks, builds, reversible code changes,
routine CI recovery, and unfamiliar non-critical tools continue. The warning
tells the owner what was expected, what was found, why
it matters for this action, and whether work may continue. The host uses a
single orange `⚠️ Worth a look` line. Without colour, the same emoji and words
remain.

The enforcement layer escalates to a rare red `🛑 Stopping here` line only for an
extremely critical action: production or private-data harm; identity,
permissions, secrets, payments, privacy, or security changes; destructive or
privileged production infrastructure; consequential external actions; production
delivery; or anything that defeats recovery, rollback, audit, or repository
protection. Without colour, the same emoji and words remain.

Unknown is not treated as proof of danger. When the hook cannot classify a
tool or shell command and finds no concrete extreme consequence, it quietly
lets the work continue.

Independent review remains a separate proof signal. Its concern or absence is
advisory for QUICK, FOCUSED, and FULL and must be disclosed. It may block only
an extremely critical action or a CRITICAL production-proof claim. This keeps
ordinary work moving without turning a warning into evidence.

Delivery then keeps each proof layer separate. The internal records are
versioned JSON so Claude Code and Codex adapters can produce equivalent
decisions even though the hosts install plugins differently.

Claude reviewer roles use the plugin's native agent records. Codex receives the
same canonical contracts as native `.codex/agents` TOML files. Installation
copies those roles into the isolated Codex configuration without replacing
unrelated or unmanaged roles.
