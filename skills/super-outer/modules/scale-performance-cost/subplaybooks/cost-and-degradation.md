# Cost and degradation

## Load boundary

Load for metered services, cost targets, quotas, storage growth, expensive work,
fallbacks, graceful degradation, or kill switches.

## Review

- Calculate cost per accepted user outcome at normal, burst, retry, and abuse
  conditions; include idle and retained-data cost where material.
- Set normal, warning, and stop boundaries with an action and owner for each.
- Preserve core behavior under quota/cost pressure; degraded mode must be
  truthful, bounded, reversible, and privacy-safe.

## Failure probes and proof

Positive: normal outcome fits budget. Negative: loops, retries, duplicates, and
abuse cannot create unbounded spend. Boundary: product choice decides which
feature degrades, not the technical mechanism. Test quota exhausted, provider
price/limit drift, fallback load, and return to normal.

## Recovery

Disable or rate-limit the expensive path, preserve core service, reconcile
metered effects, and re-enable gradually below verified stop thresholds.
