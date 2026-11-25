# Concurrency and idempotency

## Load boundary

Load when requests can repeat, actors can race, order matters, or one action
performs several writes or external effects.

## Review

- Define the business identity of one action, invariant, conflict outcome,
  duplicate window, and atomic/compensating boundary before choosing a mechanism.
- Make replay return the original accepted outcome or a truthful conflict;
  never duplicate money, jobs, writes, or messages.
- Keep ordering and ownership explicit across asynchronous handoffs.

## Failure probes and proof

Positive: one request completes once. Negative: duplicate and concurrent inputs
cannot create extra effects. Boundary: acceptable conflict behavior may require
a router question, not the locking mechanism. Run deterministic race, replay,
partial-failure, and restart tests against the real datastore boundary.
Include a committed write whose response is lost, then show that a refresh
confirms the write without replaying it, and run two client instances at once.

## Recovery

Stop new duplicates, reconcile effects by business identity, compensate only
verified partial work, and prove safe replay after recovery.
