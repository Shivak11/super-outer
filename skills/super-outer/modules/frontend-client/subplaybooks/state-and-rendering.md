# State and rendering

## Load boundary

Load for component boundaries, client state ownership, navigation, rendering,
forms, derived state, or multi-step visual states.

## Review

- Name one owner for each state, its source of truth, transitions, consumers,
  derived values, persistence, and reset/cancellation behavior.
- Model multi-step states explicitly; do not let loading, success, ready, and
  failure states flash through impossible combinations.
- Inspect shared consumers and render boundaries before changing semantics.

## Failure probes and proof

Positive: repeated renders preserve one outcome. Negative: do not introduce a
global store for local state. Boundary: UI interpretation remains with UI/UX.
Test rapid input, navigation away/back, stale props, duplicate submit, empty
state, and old/new component coexistence.

## Recovery

Reset only task-owned transient state, retain valid persisted state, restore the
previous component contract, and verify all direct consumers.
