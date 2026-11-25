# Dependency failures

## Load boundary

Load for external calls, slow/down dependencies, timeouts, retries, cancellation,
rate limits, partial responses, or provider recovery.

## Review

- Set deadlines from the caller's usable time budget and propagate cancellation.
- Retry only transient, safe operations with a bound, backoff, and deduplication;
  respect rate-limit signals and avoid synchronized storms.
- Define degraded behavior and stable error mapping for slow, down, malformed,
  partial, and recovered dependencies.

## Failure probes and proof

Positive: healthy dependency meets the contract. Negative: permanent failures do
not retry forever. Boundary: product fallback priority may need router input.
Test slow, timeout, reset, malformed, partial, rate-limited, recovered, and late
responses while counting external effects.

## Recovery

Cancel abandoned work, stop at the retry budget, isolate the dependency,
reconcile late results, and restore normal flow only after a recovery probe.
