# Timeouts and retries

## Load boundary

Load for slow/down dependencies, transient failures, reconnect, retry, resume,
rate limits, late results, or caller cancellation.

## Review

- Derive deadlines from the user-visible budget and propagate cancellation.
- Classify operations as safe replay, conditionally replayable, or never
  automatic. Bound attempts/duration and change strategy or gather evidence.
- Add jitter/backoff and deduplication where needed; respect dependency limits.

## Failure probes and proof

Positive: transient failure recovers once. Negative: permanent failure, late
success, and cancellation create no extra effect. Boundary: retry policy is
technical until acceptable delay/loss is missing. Count attempts under timeout,
reset, rate limit, partial success, and recovery.

## Recovery

Stop at the retry budget, cancel abandoned work, reconcile late/duplicate
effects, and resume only after a verified recovery signal.
