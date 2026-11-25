# Invariants and migrations

## Load boundary

Load for schema, constraint, index, durable ownership, transactional boundary,
locking, or migration-order changes.

## Review

- State data invariants and every reader/writer before selecting DDL or code
  order. Preserve compatibility while versions coexist.
- Measure production volume, lock behavior, scan/write amplification, resource
  headroom, and cancellation characteristics from official datastore behavior.
- Separate expand, migrate, validate, enforce, and contract phases where needed.

## Failure probes and proof

Positive: valid old/new writes preserve invariants. Negative: invalid ownership
or references fail safely. Boundary: a query-only index still needs lock/resource
evidence. Rehearse partial DDL, concurrent traffic, cancellation, and validation
on representative volume.

## Recovery

Pause at a phase boundary, retain compatible readers/writers, remove only safe
additive artifacts, and verify all invariants before resuming.
