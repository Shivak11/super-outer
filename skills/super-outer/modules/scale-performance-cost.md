# Scale, Performance and Cost

Module ID: `scale-performance-cost`

Peer status: first-class, never default. Quantify capacity and amplification;
do not activate merely because software could someday grow. This stays true
with the story walk, because the specialist activates on demand the owner
stated in the product brief or on a measured signal, never on the possibility
of growth.

## Triggers

- High volume, strict latency, fan-out, queues, expensive computation, metered
  services, large payloads, or resource limits are material.
- A user action can multiply requests, jobs, writes, model calls, or charges.
- Saturation, backpressure, degradation, capacity, or cost boundaries change.

## Non-triggers

- Small bounded work without a stated or evidenced capacity concern.
- UI polish, static content, or architecture discussion with no measurable load.
- Premature optimization unsupported by a product or operational threshold.

## Progressive playbooks

- Load [capacity-and-latency.md](scale-performance-cost/subplaybooks/capacity-and-latency.md) for demand,
  concurrency, latency budgets, resource ceilings, and load proof.
- Load [amplification-and-backpressure.md](scale-performance-cost/subplaybooks/amplification-and-backpressure.md)
  for fan-out, queues, retries, batching, overload, and admission control.
- Load [cost-and-degradation.md](scale-performance-cost/subplaybooks/cost-and-degradation.md) for unit
  economics, quotas, fallbacks, graceful degradation, and stop controls.

Load only the files implicated by the task.

## Router-facing method

Build a one-in/one-out count for requests, jobs, external calls, reads, writes,
bytes, and billable events. Measure current and target demand, service time,
concurrency, resource ceilings, saturation behavior, and cost per useful result.

For a new product, feature, overhaul or subsystem, the
[story walk](../references/story-walk.md) runs first and takes demand from the
product brief. For a web or mobile product, take now and later thresholds from
the [web and mobile pack](../references/architecture-packs/web-and-mobile-apps.md)
before setting your own.

## Decision kinds

- Treat bounded resource consumption and protection against uncontrolled
  amplification as invariants where one actor can harm others.
- Treat latency, throughput, headroom, batching, freshness, degradation, and
  cost as evidence-led trade-offs tied to explicit thresholds.
- Treat perceived-speed priorities as interpretive only when jointly selected
  with product UI/UX and local intent is missing.

## Source hierarchy

Apply [source authority](../references/source-authority.md): explicit service
objectives and budgets, official platform quotas/behavior, measured load data
and mature practice, then observed local precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask about acceptable wait, demand, cost, freshness, or reduced functionality
when thresholds are missing. Never ask the user to choose caches, queue types,
batch algorithms, autoscaling products, or profiling tools.

## Comparable evaluation cases

### Positive

A high-volume fan-out endpoint selects all applicable scale playbooks.

### Negative

A local color-token change returns `not_applicable`.

### Boundary

A single low-volume expensive model call loads cost guidance but not capacity
guidance unless concurrency evidence makes it relevant.

### Failure

Detect retry storms, queue growth, head-of-line blocking, memory exhaustion,
quota collapse, cost amplification, and degradation that breaks core behavior.

### Recovery

Shed or defer bounded work, disable amplification, preserve core service,
reconcile delayed jobs, and prove recovery below stop thresholds.
