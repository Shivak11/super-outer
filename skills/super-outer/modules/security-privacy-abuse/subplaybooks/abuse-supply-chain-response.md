# Abuse, supply chain, and response

## Load boundary

Load for fraud, resource abuse, enumeration, dependencies, build inputs,
credentials, auditability, or incident containment.

## Review

- Define actor-level and system-level abuse limits, bypass paths, economic
  amplification, false-positive consequence, and escalation ownership.
- Verify dependency provenance, integrity, permissions, update policy, and
  runtime exposure; a scanner result is evidence, not complete assurance.
- Keep incident actions separately approval-gated and preserve minimal useful
  logs without secrets or unnecessary personal data.

## Failure probes and proof

Positive: legitimate bursts remain usable. Negative: distributed/replayed abuse,
dependency substitution, exposed token, and bypass routes are contained.
Boundary: cost pressure jointly routes to scale. Exercise containment, revoke,
restore, and audit paths in an isolated environment.

## Recovery

Isolate affected components, revoke/narrow approved credentials, restore trusted
artifacts, reconcile abuse effects, and reopen only after boundary validation.
