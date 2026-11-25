# Cost, provider, and human control

## Load boundary

Load for metered inference, latency, quotas, provider drift/failure, automatic
actions, escalation, override, or high-consequence generated decisions.

## Review

- Count model calls, tokens/units, retries, tool calls, and charges per accepted
  outcome. Bound loops, budgets, latency, and concurrency.
- Define provider failure/drift signals and a truthful independent fallback.
- Preserve human preview, correction, cancel, escalation, and auditability
  proportional to consequence; models do not approve their own privileged work.

## Failure probes and proof

Positive: outcome fits quality, latency, and cost budgets. Negative: provider
down, slow, rate-limited, changed, or looping cannot remove human control or
multiply charges. Boundary: low-risk drafts may use lightweight review. Test
budget stop, cancellation, fallback, override, and reconciliation.

## Recovery

Stop model/tool execution, preserve user work, switch to deterministic/manual
control, reconcile effects and charges, and re-enable only after fresh evaluation.
