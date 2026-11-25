# Super-outer repository contract

Read `README.md`, `docs/architecture/index.md` and `docs/reference.md` before
material work.

## Product boundary

From 5.7.0, Super-outer is an end-to-end plain-language coding kit for people
who do not write code, covering a product's surfaces from setup to retirement.
Product intent sits at the router above the twelve specialists, beside the
completion contract. Its core path ships every method it needs and depends on no
separately installed skill.

Super-outer is balanced across twelve peer engineering dimensions. UI/UX is
first-class but not dominant. Frontend engineering is distinct from product
UI/UX. Repository-native rules strengthen the general plugin; no company's
taste becomes universal policy.

Layout: `hooks/super-outer-hook.mjs` is the one hook every host runs; `src/`
holds routing, the work record and Jev; `skills/super-outer/` is the skill with
its references, modules and failure-mode libraries; `skills/draw-system-diagram/`
is the diagram skill that ships beside it; `skills/jev-opportunities/` and
`skills/caveman-opportunities/` are the read-only finders for closed-decision
LLM calls and machine-only text; `skills/edge-cases/` ranks the common ways a
change can break; `adapters/cursor/` bridges
Cursor; `developer-update/` is the installer package; `optional/` holds the
learning plugin.

Super-outer is primarily an English-to-senior-developer translation layer for
the product owner.
Keep deep engineering analysis in the evidence layer. In conversation, explain
the intended product outcome, ordinary-language consequence, genuine decision,
recommendation, proof, and remaining gap. Do not surface specialist names,
scores, schemas, hashes, Git mechanics, or implementation vocabulary unless
the owner asks for the technical detail.

## Implementation rules

- Keep the router skill concise and progressively load specialist modules.
- The router is the only user interviewer.
- Translate every internal finding before showing it to the owner; simple language
  must never mean shallow engineering.
- Apply invariants without asking ceremonial questions.
- Research technical trade-offs and ask only for product thresholds.
- Interpretive decisions must begin with company and repository evidence.
- Keep runtime code dependency-free and compatible with Node ESM.
- Store approval state as hashes and allowlisted metadata only.
- Treat profile classifications as indivisible provenance: an observation's
  text and sources cannot inherit a policy label.
- Keep native Codex roles under `.codex/agents/`; installation must preserve
  unrelated roles and refuse unmanaged same-name overwrites.
- Never add outbound telemetry. The routing call to Jev, added in 5.8.0, is not
  telemetry: it sends only the typed request, to the routing model a person
  switched on with a key placed for Super-outer, and nothing about the
  repository, the person or the session. From 6.0 it may also send one-line summaries of agent activity, such
  as "five timing queries in a row against the live service". A summary never
  contains code, file contents, keys, tokens or customer data, and it passes
  the secret scan and length limit before it is sent.
- Tests and scripts that start the hook use `tests/helpers/isolated-env.mjs`
  or set `SUPER_OUTER_JEV=off`, so no check sends a prompt to OpenRouter.

## Multi-agent safety

- Work from a committed plan in a dedicated worktree.
- Before writing, run `git worktree list --porcelain` and `git status --short`
  in each sibling worktree. Compare changed paths with the intended files.
  For an unexpected overlap, snapshot the foreign files and diff at detection,
  read the changes, and establish with the owner which session continues before
  editing those files. Continue disjoint work; a known orchestrator's explicit
  ownership assignment already settles this choice.
- Give parallel agents exhaustive, disjoint ownership.
- Reserve schemas, manifests, shared contracts, integration tests, staging,
  commits, and reconciliation for one orchestrator.
- On unexpected modification, snapshot the foreign version and diff at
  detection, then stop.
- Verify from disk; agent reports are not proof.
- Audit the complete status before and after staging.

## Delivery gates

- A fix needs a check that fails on the old behavior when feasible.
- Run final checks after the last edit.
- Keep source, CI, package, installation, host discovery, hook execution,
  runtime journey, migration, and release evidence separate.
- Treat CI as proved only after rereading a completed successful remote run for
  the exact repository version; a caller-supplied matching version is not proof.
- Preserve the local source-evidence limitation in the durable task record: a
  byte hash binds the artifact, but does not authenticate its producer.
- Before push or PR, finish the exact clean-head source checks and record the
  independent review result. Review concerns are advisory for QUICK, FOCUSED,
  and FULL; they must remain visible rather than silently stopping ordinary
  work.
- A CRITICAL or explicit production-delivery claim requires exact-head
  independent PASS and live terminal CI. Do not tag, release, or promote v3
  ownership without the proof required by that claim.
- Do not modify or remove OUTER v3 during isolated development and testing.

Use one-line Conventional Commit subjects.

## Commands and release

- `npm test` runs `tests/` only. `npm run verify` is what CI runs: it adds the
  installer tests in `developer-update/tests`, packaging and isolated staging.
  Run it before every push.
- The package is built from committed files. After a change to shipped files,
  commit, run `npm run -s sync:digest`, and commit the digest file it updates.
- Speed tests (credential words, hook wait) fail when the machine is heavily
  loaded. Rerun the file alone before treating a failure as a regression.
- Release: bump the version everywhere except history (`CHANGELOG.md`), add a
  CHANGELOG entry, sync the digest, then run `npm run verify`.
- A change reaches people only when installed: `npm run -s setup -- --components
  skills` (Claude Code and Codex), `npm run -s install:cursor` (Cursor keeps
  its own runtime copy). Run each installed hook once.

## Diagrams

Keep `docs/diagrams/super-outer-architecture.svg`, `docs/diagrams/request-pipeline.svg`
and `docs/diagrams/tool-check-pipeline.svg` current in the same commit as any
change that makes them untrue, and update the architecture subtitle and its
`version` fact at every release. `tests/super-outer-diagrams.test.mjs` checks
them against the code; see `docs/diagrams/README.md`.

## C4/C5 documentation updates

Read `docs/architecture/CONVENTION.md` and `docs/architecture/index.md` before
material changes. Keep the README diagrams and the C5 views in
`docs/architecture/` true in the same change that alters a boundary they show.
Render every changed SVG to PNG and look at it before you commit. Record
unknown history as unknown; a planned review is not an executed review.

Generated documentation must use LF and exactly one final newline.
