# Boundaries and dependencies

## Load boundary

Load for module/service responsibilities, contracts, shared foundations,
coupling, dependency direction, or consumer blast radius.

## Review

- Map responsibility, state/data owner, public contract, callers, consumers,
  sibling behavior, dependencies, and failure ownership.
- Point dependencies toward stable policy, keep volatile providers behind narrow
  boundaries, and avoid cycles or shared mutable ownership.
- Preserve explicit contracts while moving implementation.

## Failure probes and proof

Positive: consumers depend on one stable contract. Negative: a new layer that
only forwards calls adds no boundary. Boundary: two services sharing a schema do
not automatically share ownership. Test consumer contracts, failure isolation,
and replacement of the volatile dependency.

## Recovery

Restore the prior contract edge, isolate new behavior behind an adapter, keep
coexistence, and verify all named consumers.
