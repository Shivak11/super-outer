# Journeys and motion

## Load boundary

Load for navigation, gestures, transitions, object continuity, animation, or
Reduce Motion. Do not load for a static token correction.

## Review

- Inspect actual entry, target, next destination, reverse path, transient states,
  shared chrome, and ownership of secondary destinations.
- Require motion to explain cause, state, ownership, or continuity. Preserve
  stable control geometry and a visible reverse action.
- Provide a Reduce Motion path and platform-appropriate input/back behavior.

## Failure probes and proof

Positive: forward and reverse journeys preserve identity. Negative: a decorative
animation alone is insufficient. Boundary: a state replacement loads motion but
not navigation. Test interruption, repeated input, reverse action, and Reduce
Motion on the runtime surface; screenshots do not prove interaction.

## Recovery

Disable or simplify the transition, keep the prior route reachable, restore
stable state, and re-run forward, reverse, interrupted, and reduced-motion paths.
