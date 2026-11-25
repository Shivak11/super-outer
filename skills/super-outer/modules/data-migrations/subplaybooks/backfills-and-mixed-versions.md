# Backfills and mixed versions

## Load boundary

Load for historical transformation, bulk repair, resumable data work, dual
reads/writes, or old/new application coexistence.

## Review

- Define selection, ordering, checkpoints, idempotency, version ownership,
  validation counts, throttling, and a completion condition.
- Prevent older writers from erasing new fields and newer readers from assuming
  incomplete historical data is complete.
- Observe lag, error rate, resource use, and invariant violations while running.

## Failure probes and proof

Positive: rerunning a completed batch changes nothing. Negative: interruption
cannot skip or duplicate rows. Boundary: retention policy remains a router-level
decision. Test restart at every checkpoint, concurrent old/new writes, poisoned
rows, volume limits, and validation mismatch.

## Recovery

Stop at the last durable checkpoint, quarantine poisoned records, reconcile from
the authoritative source, and resume with a changed strategy after proof.
