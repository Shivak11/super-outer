# Signals and correlation

## Load boundary

Load for cross-component journeys, background work, invisible handoffs, difficult
runtime failure, or product-harm detection.

## Review

- Map one visible action through requests, jobs, external calls, reads, writes,
  retries, results, and charges with maximum legitimate counts.
- Use one privacy-safe journey identifier across handoffs; exclude content,
  secrets, identity, and unnecessary personal data.
- Measure useful outcomes, delay, duplication, loss, abandonment, and cost—not
  just process uptime or error counts.

## Failure probes and proof

Positive: one journey can be reconstructed end to end. Negative: duplicate/lost
handoffs become visible. Boundary: a configured SDK without journey coverage is
not evidence. Test correlation across retry, queue delay, provider failure,
restart, cancellation, and successful recovery.

## Recovery

Stop unsafe emission, preserve minimal existing evidence, repair missing links,
and validate correlation on new test journeys without backfilling sensitive data.
