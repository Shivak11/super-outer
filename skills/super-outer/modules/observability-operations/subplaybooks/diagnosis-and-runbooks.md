# Diagnosis and runbooks

## Load boundary

Load for operational ownership, incident diagnosis, read-only production
evidence, escalation, runbooks, or emergency action.

## Review

- Start with read-only evidence and a discriminator between plausible causes.
  Name query, expected signal, scope, authority, and residual uncertainty.
- Give each runbook trigger, owner, safe inspection, containment, approvals,
  rollback/repair, validation, and terminal state.
- Keep writes, alert changes, rollout changes, credentials, and incident actions
  separately approval-gated.

## Failure probes and proof

Positive: a fresh operator can diagnose and contain the defined failure.
Negative: the runbook cannot mutate production through a read-only step.
Boundary: missing access becomes a blocker, not fabricated proof. Rehearse stale
signals, unavailable dependency, false alarm, containment, and handoff.

## Recovery

Return systems and access to normal, validate user outcomes, preserve minimal
incident evidence, update the discriminator, and close with a named owner.
