# Authorization and privacy

## Load boundary

Load for resource access, role changes, personal/private data, consent, purpose,
retention, deletion, export, or logs containing sensitive material.

## Review

- Authorize actor, action, resource, owner/tenant, and current state at the
  protected operation. Recheck on every path, including background work.
- Minimize collection, model/provider exposure, storage, logs, retention, and
  access to the stated purpose. Apply binding duties before product preference.
- Use direct symmetric consent and recovery; do not bundle unrelated authority.

## Failure probes and proof

Positive: correct owner gets only needed data. Negative: ID substitution,
account switch, stale role, export, logs, and support/admin paths cannot leak it.
Boundary: retention interpretation never overrides legal deletion. Verify with
cross-tenant and lifecycle tests plus privacy-safe evidence inspection.

## Recovery

Contain access, stop further processing, remove unauthorized copies where
permitted, correct authorization, and verify revocation and retention outcomes.
