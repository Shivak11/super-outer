# Rollout and recovery

## Load boundary

Load for staged release, feature flags, kill switches, rollback, recovery time or
point, wide rollout, or changes whose failures appear only in production.

## Review

- Define audience stages, entry/exit criteria, normal/warning/stop evidence,
  owner, disable path, rollback compatibility, and cleanup.
- Separate stopping new exposure, rolling code back, repairing data, and
  reconciling in-flight work.
- Rehearse rollback or containment on the exact artifact and environment class.

## Failure probes and proof

Positive: each stage advances only on current evidence. Negative: stop signal
halts promotion and the disable path works. Boundary: release authority remains
delivery/approval. Test bad configuration, partial rollout, stale clients,
dependency failure, rollback, and post-rollback validation.

## Recovery

Freeze promotion, disable the affected path, preserve evidence and state,
rollback or contain, repair as needed, and reprove before any resumed stage.
