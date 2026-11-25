# Rollout, rollback, and proof

## Load boundary

Load for migration, promotion, staged release, environment delivery, rollback,
tag/release, or final `PROVED` claims.

## Review

- Bind artifact, configuration, environment, deployment, CI, and reviewed code
  to exact identities. Define staged audience, stop signal, owner, and authority.
- Permit one active enforcement owner; preserve OUTER 2.1 and v3 in separate
  verified archives, remove both from active discovery after v4 proof, and
  verify exact rollback before user-wide change.
- Require a fresh read-only verifier against the exact clean head. `PASS` cannot
  be inferred from builder confidence or partial layers.

## Failure probes and proof

Positive: stage advances on current exact-head evidence. Negative: SHA mismatch,
failed rollback, missing host parity, or unproved journey stops promotion.
Boundary: tag/release needs merged-head reverification. Exercise interrupted
promotion, rollback, mixed versions, stale artifact, and direct journey failure.

## Recovery

Freeze rollout, disable v4 enforcement, restore exact settings/files and v3
ownership, verify prior behavior, and report every proof layer separately.
