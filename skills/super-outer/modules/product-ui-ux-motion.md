# Product UI/UX and Motion

Module ID: `product-ui-ux-motion`

Peer status: first-class, never default. Review product behavior and interaction;
do not act as a generic visual-taste layer.

## Triggers

- Visible behavior, information hierarchy, content, navigation, gestures,
  animation, accessibility, or recovery states change.
- A journey crosses screens, surfaces, platforms, or state transitions.
- Local product character or a design/motion system materially constrains the
  solution.

## Non-triggers

- Backend-only, infrastructure-only, or documentation-only work with no user
  journey effect.
- A code change merely occurs in a frontend repository.
- A request for generic polish unsupported by product evidence.

## Progressive playbooks

- Load [company-native-system.md](product-ui-ux-motion/subplaybooks/company-native-system.md) for
  product grammar, content, component, or visual-system questions.
- Load [journeys-and-motion.md](product-ui-ux-motion/subplaybooks/journeys-and-motion.md) for
  transitions, gestures, navigation, continuity, or Reduce Motion.
- Load [accessibility-and-recovery.md](product-ui-ux-motion/subplaybooks/accessibility-and-recovery.md)
  for semantics, assistive technology, error, empty, offline, or retry states.

Load only the files implicated by the task.

## Router-facing method

Inspect the profile's product and UI sources, the actual entry and exit journey,
shared components, platform behavior, and runtime evidence. Preserve the
company's native system. External examples may fill a documented absence but
must not overwrite explicit or observed product character.

## Design before building

This module reviews designs and never produces them. For a user-facing new
feature or redesign, the router's design path supplies a recorded product
intent and a design package made by the design-prototyper role. Reject a
combined interface whose controls compete with the main object named in that
intent, even when each control works. A rendered review against a recorded
intent counts as required verification, separate from the owner's own taste.

## Decision kinds

- Treat accessible semantics, truthful state, recoverability, and user autonomy
  as invariants.
- Treat responsiveness, density, and performance-sensitive interaction as
  evidence-led trade-offs when thresholds differ.
- Treat product voice, hierarchy, motion character, and interaction emphasis as
  interpretive only after local evidence is exhausted.

## Source hierarchy

Apply [source authority](../references/source-authority.md). Local design,
content, component, motion, and journey contracts outrank external style. Do not
transfer any other product's or company's taste into this repository.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Propose a question about the intended user experience or product character only
when company-native evidence cannot decide it. Never ask the user to choose a
component library, animation primitive, easing curve, or layout mechanism.

## Comparable evaluation cases

### Positive

A new navigation gesture selects this module and loads journey/motion guidance.

### Negative

A server timeout fix with unchanged UI returns `not_applicable`.

### Boundary

A color-token correction loads company-native evidence but not motion.

### Failure

Reject a locally attractive screen that breaks the entry/exit journey, hides a
recovery action, or imports unrelated visual taste.

### Recovery

Preserve the prior component or flag the new surface off, restore reachable
navigation, verify assistive and Reduce Motion paths, then repeat the journey.
