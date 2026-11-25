# Coexistence and migration

## Load boundary

Load for old/new clients, services, providers, data formats, staged adoption,
deprecation, dual behavior, or migration windows.

## Review

- Define supported combinations, negotiation/detection, write ownership,
  deprecation evidence, completion criteria, and rollback window.
- Ensure old writers cannot erase new meaning and new readers handle incomplete
  old state. Prefer additive expansion before contraction.
- Track actual adoption before removing compatibility.

## Failure probes and proof

Positive: every supported pair works. Negative: unsupported pairs fail without
corruption. Boundary: how long users must remain supported may need router input.
Test old/new cross-product, partial rollout, stale client, rollback, and delayed
events/data.

## Recovery

Retain or restore the compatibility bridge, stop contraction, reconcile mixed
state, and repeat the version matrix before advancing.
