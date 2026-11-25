# Observability and Operations

Module ID: `observability-operations`

Peer status: first-class, never default. Define privacy-safe evidence that helps
operators detect product harm, diagnose it, and act within clear authority.

## Triggers

- Production services, background work, external calls, difficult runtime
  failures, availability promises, or incident response are material.
- A journey crosses several components and needs correlation.
- Alerts, runbooks, operating boundaries, or diagnostic ownership change.

## Non-triggers

- A self-contained local change whose claims are fully observable in tests.
- Adding logs or dashboards without a decision or failure they enable.
- Telemetry collection that lacks a necessary, privacy-safe operational purpose.

## Progressive playbooks

- Load [signals-and-correlation.md](observability-operations/subplaybooks/signals-and-correlation.md) for
  work maps, journey tags, logs, metrics, traces, and product-harm signals.
- Load [privacy-and-alerting.md](observability-operations/subplaybooks/privacy-and-alerting.md) for data
  minimization, normal/warning/stop bounds, paging, and false positives.
- Load [diagnosis-and-runbooks.md](observability-operations/subplaybooks/diagnosis-and-runbooks.md) for
  ownership, investigation, read-only evidence, and operational action.

Load only the files implicated by the task.

## Router-facing method

Start from one user-visible action and map requests, jobs, dependencies, writes,
results, retries, and charges. Define privacy-safe correlation and signals that
distinguish success, delay, duplication, loss, and silent product harm. A
configured SDK proves capability, not journey coverage.

On a deployed project, read the deploy config first and confirm that logs and
traces are on, even when the request never mentions logging. Before turning
tracing on, check [lessons](../references/lessons.md) for secrets carried in
URLs. Run-and-operate work loads
[run and operate](observability-operations/run-operate.md).

## Decision kinds

- Treat sensitive-data minimization, truthful signals, bounded cardinality, and
  evidence needed for high-consequence recovery as invariants.
- Treat retention, sampling, alert thresholds, and operating cost as
  evidence-led trade-offs.
- Treat dashboard presentation as interpretive only for an explicit operator
  workflow, never as a substitute for signal quality.

## Source hierarchy

Apply [source authority](../references/source-authority.md): binding privacy
and operating duties, explicit service objectives/runbooks, official platform
behavior, incident and test evidence, then observed precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask which harm must wake a person, acceptable diagnosis delay, or evidence
retention only when policy is absent. Never ask the user to choose telemetry
vendors, tracing libraries, log formats, or dashboard products.

## Comparable evaluation cases

### Positive

A multi-stage production job selects correlation, alerting, and runbook review.

### Negative

A local deterministic formatter change returns `not_applicable`.

### Boundary

A single service error fix loads signal guidance only when existing evidence
cannot distinguish recovery or user harm.

### Failure

Detect uncorrelated handoffs, secrets in logs, unbounded labels, alerts with no
action, false success metrics, missing ownership, and write-capable diagnostics.

### Recovery

Stop unsafe telemetry, preserve minimal evidence, switch to read-only diagnosis,
repair the signal, validate warning/stop behavior, and update the runbook owner.
