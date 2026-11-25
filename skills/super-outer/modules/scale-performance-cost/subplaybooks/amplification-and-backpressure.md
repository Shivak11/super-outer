# Amplification and backpressure

## Load boundary

Load for fan-out, queues, retry, batching, cascading work, overload, or one user
action producing multiple requests, writes, jobs, or charges.

## Review

- Build a one-in/one-out maximum count for every handoff and billable effect.
- Bound queue depth, age, retries, per-actor concurrency, fan-out, and batch size;
  define admission, shedding, fairness, and priority.
- Ensure backpressure reaches the producer rather than moving overload to a
  downstream store or provider.

## Failure probes and proof

Positive: normal demand completes within counts. Negative: retry storms and a
noisy actor cannot starve others. Boundary: safe duplicate handling routes to
backend too. Test bursts, slow consumer, poison work, provider limits, queue
growth, cancellation, and drain.

## Recovery

Stop producers or nonessential fan-out, quarantine poison items, drain by
priority within budgets, reconcile duplicates, and verify stable queue age.
