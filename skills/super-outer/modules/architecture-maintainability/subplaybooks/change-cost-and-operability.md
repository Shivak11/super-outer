# Change cost and operability

## Load boundary

Load for long-lived systems, refactors, diagnosis difficulty, test seams,
operational ownership, or repeated change cost.

## Review

- Compare current and proposed paths for concepts, states, dependencies, failure
  modes, test seams, deployment units, diagnosis, and ownership.
- Prefer locally boring mechanisms with explicit contracts and reversible
  migration. Complexity must buy a measured product or operating benefit.
- Ensure important failure states are inspectable without privileged mutation.

## Failure probes and proof

Positive: the next evidenced change becomes smaller or safer. Negative: line
count reduction alone is not maintainability. Boundary: temporary coexistence
may add justified complexity. Rehearse diagnosis, rollback, new-consumer change,
and removal of the old path.

## Recovery

Stop the refactor at a compatible boundary, restore the previous path, keep
diagnostic evidence, and migrate in smaller verified units.
