# Client performance and platform

## Load boundary

Load for startup, lists, rendering latency, main-thread work, client memory,
responsive layout, or iOS/Android/browser adaptation.

## Review

- Measure the affected interaction in its runtime medium. Inspect list sizes,
  render causes, blocking work, resources, and installed framework behavior.
- Keep immediate press/hold feedback local and independent of network latency.
- Share core composition while adapting safe areas, input, back, permissions,
  keyboard, material, and resource constraints at platform boundaries.

## Failure probes and proof

Positive: measured target interaction stays responsive under representative
data. Negative: source inspection cannot prove a stutter. Boundary: visible
motion quality remains UI/UX. Test long lists, low-resource conditions, rapid
input, rotation/reflow where applicable, and each supported platform.

## Recovery

Disable the expensive enhancement, restore a bounded rendering path, release
resources, and remeasure the original symptom without claiming untested parity.
