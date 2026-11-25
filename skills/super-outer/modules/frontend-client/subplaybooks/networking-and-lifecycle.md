# Networking and lifecycle

## Load boundary

Load for requests, caching, offline behavior, backgrounding, reconnect, resume,
cancellation, optimistic state, or stale response risk.

## Review

- Map request identity, ownership, cancellation, freshness, deduplication,
  persistence, retry, and the visible state before and after interruption.
- Prevent late work from overwriting a newer owner or account. Bound automatic
  retry and distinguish safe replay from duplicate user action.
- Define offline and reconnect behavior from explicit product policy.

## Failure probes and proof

Positive: one action yields one accepted outcome through reconnect. Negative: a
spinner is not recovery. Boundary: server idempotency belongs jointly to backend.
Test slow/reordered replies, account switch, background/foreground, offline
start, reconnect, cancellation, and duplicate input.

## Recovery

Cancel or fence stale work, retain the last valid local result, reconcile
optimistic changes, and expose a safe retry or return path.
