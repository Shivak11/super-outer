# Abstractions and ownership

## Load boundary

Load for a new abstraction, shared primitive, plugin point, lifecycle ownership,
configuration layer, or extension seam.

## Review

- Require evidenced common responsibility across real consumers; do not abstract
  one instance for a hypothetical future.
- Give creation, mutation, cleanup, cancellation, errors, and configuration one
  clear owner. Keep abstractions smaller than the policy they hide.
- Preserve escape and migration paths when provider behavior differs materially.

## Failure probes and proof

Positive: two consumers share the invariant while retaining necessary variation.
Negative: a generic wrapper that leaks provider concepts fails. Boundary:
repository naming style is local evidence, not architecture. Test each consumer,
lifecycle cleanup, failure mapping, and provider substitution.

## Recovery

Inline or bypass the abstraction for affected consumers, restore ownership,
retain compatible interfaces, and remove it only after all callers migrate.
