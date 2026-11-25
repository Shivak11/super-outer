# Data and Migrations

Module ID: `data-migrations`

Peer status: first-class, never default. Protect stored truth, mixed-version
operation, repairability, and reversible delivery.

## Triggers

- Schemas, stored data, transformations, backfills, retention, ownership, or
  deletion behavior changes.
- Old and new application versions or data shapes can coexist.
- Locking, large scans, validation, rollback, or repair may affect production.

## Non-triggers

- Backend logic that neither reads nor writes a changed data contract.
- UI-only, copy-only, or operational documentation work.
- Ephemeral in-memory state with no durable integrity consequence.

## Progressive playbooks

- Load [invariants-and-migrations.md](data-migrations/subplaybooks/invariants-and-migrations.md)
  for constraints, schema order, locking, and transactional boundaries.
- Load [backfills-and-mixed-versions.md](data-migrations/subplaybooks/backfills-and-mixed-versions.md)
  for online changes, backfill, coexistence, and validation.
- Load [rollback-and-repair.md](data-migrations/subplaybooks/rollback-and-repair.md) for
  reversibility, restore, reconciliation, retention, and destructive changes.

Load only the files implicated by the task.

## Router-facing method

Name every invariant before mechanism. Trace reads and writes across current and
adjacent versions, partial execution, restart, replay, and rollback. Measure
data volume and lock/resource impact rather than assuming a small development
dataset represents production.

## Decision kinds

- Treat ownership, uniqueness, referential integrity, required retention, and
  no silent loss as invariants.
- Treat migration order, lock duration, backfill rate, coexistence window, and
  storage cost as evidence-led trade-offs.
- Treat retention or user-visible history policy as interpretive only when
  binding and explicit contracts do not decide it.

## Source hierarchy

Apply [source authority](../references/source-authority.md): binding data and
privacy duties, explicit schema/business invariants, official datastore
behavior, measured evidence, then observed repository precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask only about acceptable unavailability, loss, history, repair, or coexistence
when policy is absent. Never ask the user to choose locks, migration libraries,
index algorithms, transaction levels, or backfill mechanisms.

## Comparable evaluation cases

### Positive

A required-column backfill selects all applicable data playbooks.

### Negative

A stateless API error-copy change returns `not_applicable`.

### Boundary

A query optimization with no shape change loads invariant/lock analysis but not
destructive rollback guidance unless evidence shows write risk.

### Failure

Detect mixed-version write loss, non-resumable backfills, lock amplification,
partial constraints, owner leakage, and rollback that cannot read new data.

### Recovery

Pause writes or backfill safely, preserve checkpoints and source data, reconcile
invariants, restore compatible readers, and verify repair counts.
