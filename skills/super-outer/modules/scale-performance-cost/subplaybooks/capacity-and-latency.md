# Capacity and latency

## Load boundary

Load for throughput, concurrency, strict latency, large payloads, resource
ceilings, capacity targets, or load testing.

## Review

- Quantify current, expected, burst, and stop demand; service time; concurrency;
  payload; CPU, memory, connection, storage, and provider ceilings.
- Allocate an end-to-end latency budget across actual handoffs and distinguish
  average from tail behavior.
- Use representative data and a controlled load shape; record saturation rather
  than extrapolating from a single request.
- Before accepting a deadline wrapper, time the path end to end at realistic
  size and input count, and report whether the normal case finishes inside the
  budget. Count subprocess starts and network round trips per call.

## Failure probes and proof

Positive: target demand meets useful latency with headroom. Negative: over-limit
load degrades predictably without corrupting work. Boundary: small metered work
may load cost only. Test warm/cold, burst/sustained, tail latency, resource
exhaustion, recovery, and correctness under load.

## Recovery

Reduce admission or expensive features, drain bounded work, restore headroom,
and repeat the same load shape before raising limits.
