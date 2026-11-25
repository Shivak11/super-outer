# Accessibility and recovery states

## Load boundary

Load for semantics, focus, input, contrast, text scaling, loading, empty, error,
offline, success, permission, cancellation, or retry behavior.

## Review

- Apply binding accessibility requirements and official platform semantics;
  preserve labels, roles, order, targets, focus, contrast, and text reflow.
- Distinguish creating from retrieving. Keep destination identity and eventual
  content geometry truthful while saved content loads.
- Give each failure state one useful next action and consequence-proportional
  friction. Prefer undo for reversible actions.

## Failure probes and proof

Positive: keyboard/assistive and touch paths reach the same result. Negative: a
visual screenshot alone fails. Boundary: platform-native permission plus app
recovery have distinct ownership. Test denial, offline, retry, cancellation,
large text, assistive navigation, and recovery on each affected platform.

## Recovery

Return focus and state to a known location, preserve user work, expose retry or
undo, and restore the prior accessible control if the new path cannot be proved.
