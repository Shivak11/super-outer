# Rollback and repair

## Load boundary

Load for destructive changes, retention/deletion, irreversible transformation,
restore, reconciliation, rollback, or operator repair.

## Review

- Distinguish code rollback from data rollback. Prove the prior version can read
  new data or retain a compatible bridge.
- Snapshot or preserve authoritative source data before destructive work; name
  restore time, restore point, validation, and ownership.
- Make repair resumable, auditable, privacy-safe, and bounded.

## Failure probes and proof

Positive: rollback restores a usable verified state. Negative: a migration tool
exit code alone is not restore proof. Boundary: legally required deletion may
forbid restoring removed data. Rehearse partial delete, corrupt transform,
restore, mixed versions, and post-restore invariant checks.

## Recovery

Stop destructive work, isolate affected records, restore or repair from the
approved source, reconcile counts/invariants, and document irrecoverable loss.
