# Reliability and Recovery

Module ID: `reliability-recovery`

Peer status: first-class, never default. Review failure behavior, containment,
restart, and recovery for promises that must survive bad days.

## Triggers

- External dependencies, asynchronous work, automatic retry, availability
  promises, staged rollout, restart, or partial completion are material.
- A failure can strand, duplicate, reorder, or lose work.
- Rollback, kill switches, graceful degradation, or recovery objectives change.

## Non-triggers

- Bounded local work with no availability, persistence, or dependency effect.
- Generic “make it reliable” language without a concrete failure boundary.
- A visual-only change whose prior surface remains safely recoverable.

## Progressive playbooks

- Load [timeouts-and-retries.md](reliability-recovery/subplaybooks/timeouts-and-retries.md) for slow,
  failed, recovered, duplicated, or rate-limited dependencies.
- Load [degradation-and-restart.md](reliability-recovery/subplaybooks/degradation-and-restart.md) for
  partial service, background work, checkpoints, restart, and cancellation.
- Load [rollout-and-recovery.md](reliability-recovery/subplaybooks/rollout-and-recovery.md) for staged
  release, disablement, rollback, recovery objectives, and rehearsal.

Load only the files implicated by the task.

## Router-facing method

Trace each invisible handoff and simulate slow, down, partial, duplicate,
reordered, restarted, cancelled, and recovered states. Distinguish safe retry
from repeat damage. Require an observable stop signal and a verified containment
or rollback path.

## Decision kinds

- Treat bounded retry, no silent loss, safe restart, and verifiable rollback as
  invariants for affected workflows.
- Treat availability, consistency, recovery time, recovery point, degradation,
  and rollout size as evidence-led trade-offs.
- Treat user-visible fallback priority as interpretive only where product
  promises do not already decide it.

## Source hierarchy

Apply [source authority](../references/source-authority.md): explicit service
promises and recovery policy, official dependency/runtime behavior, incident or
test evidence, mature practice, then observed local precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask about acceptable interruption, loss, fallback, manual control, or recovery
time only when evidence cannot decide. Never ask the user to choose retry
libraries, circuit breakers, queue mechanisms, or rollout vendors.

## Comparable evaluation cases

### Positive

A multi-stage external job selects timeout, restart, and rollout guidance.

### Negative

A static documentation correction returns `not_applicable`.

### Boundary

A synchronous local calculation loads no reliability playbook unless failure can
corrupt persistent or shared state.

### Failure

Detect retry storms, stranded jobs, false success, recovery without validation,
irreversible rollout, missing disablement, and restart from the wrong checkpoint.

### Recovery

Stop new work, preserve and classify in-flight state, resume only safe items,
reconcile outcomes, and verify recovery plus disable/rollback.
