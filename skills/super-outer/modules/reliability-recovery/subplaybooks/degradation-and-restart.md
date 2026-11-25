# Degradation and restart

## Load boundary

Load for asynchronous work, process restart, checkpoints, partial service,
offline/reconnect, cancellation, or graceful degradation.

## Review

- Name durable state, checkpoint ownership, in-flight states, completion signal,
  cancellation, and restart behavior.
- Ensure degraded behavior preserves the core promise and never reports false
  success. Keep partial work visible and repairable.
- Make restart idempotent and distinguish abandoned, retryable, completed, and
  poisoned work.

## Failure probes and proof

Positive: restart resumes or safely restarts one unit. Negative: crash at every
handoff cannot lose or duplicate it. Boundary: UI presentation routes jointly
to frontend/UI. Test process death, checkpoint corruption, poison work,
cancellation, degraded dependency, and return to normal.

## Recovery

Stop intake, classify in-flight work, restore from the last verified checkpoint,
quarantine unsafe items, reconcile results, and resume gradually.
