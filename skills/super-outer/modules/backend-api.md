# Backend and API Engineering

Module ID: `backend-api`

Peer status: first-class, never default. Enforce stable service invariants and
research trade-offs without outsourcing implementation choices to the user.

## Triggers

- APIs, services, business rules, validation, authorization boundaries,
  background work, external calls, or service contracts change.
- Concurrency, duplicate requests, timeouts, retries, error mapping, or version
  compatibility can affect behavior.
- A client-visible promise depends on server processing.

## Non-triggers

- Pure UI presentation with no request or service-contract effect.
- Static documentation or local tooling with no service boundary.
- Data storage work whose API and business behavior remain unchanged.

## Progressive playbooks

- Load [contracts-and-authorization.md](backend-api/subplaybooks/contracts-and-authorization.md)
  for request/response contracts, validation, business rules, and authz.
- Load [concurrency-and-idempotency.md](backend-api/subplaybooks/concurrency-and-idempotency.md)
  for duplicate, concurrent, ordered, or multi-step work.
- Load [dependency-failures.md](backend-api/subplaybooks/dependency-failures.md) for timeouts,
  retries, external services, error contracts, and cancellation.

Load only the files implicated by the task.

## Router-facing method

Trace one accepted request and its invalid, unauthorized, duplicate, concurrent,
cancelled, and dependency-failure variants. Inspect callers and consumers before
changing a contract. Apply known correctness mechanisms directly; do not create
questions merely because several code patterns are possible.

## Decision kinds

- Treat validation, authorization at the resource boundary, idempotent handling
  where duplicates are possible, and contract truthfulness as invariants.
- Treat consistency, timeout, retry, throughput, and complexity choices as
  evidence-led trade-offs tied to product thresholds.
- Use interpretive findings only when a business rule or user-visible error
  policy is genuinely unspecified.

## Source hierarchy

Apply [source authority](../references/source-authority.md): binding security
and data rules, explicit service contracts, official protocol/runtime behavior,
measured engineering evidence, then observed local precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Propose questions about acceptable delay, duplicate outcomes, consistency, or
visible failure only if those product policies are missing. Never ask the user
to choose queues, locks, transaction modes, retry libraries, or API frameworks.

## Comparable evaluation cases

### Positive

An authenticated endpoint with background work selects contracts, concurrency,
and dependency guidance as applicable.

### Negative

A motion-duration adjustment with no service effect returns `not_applicable`.

### Boundary

A timeout-only fix loads dependency guidance, not migration guidance.

### Failure

Detect partial success, replayed requests, cross-tenant authorization, unbounded
retries, late dependency results, and incompatible error-shape changes.

### Recovery

Stop retries at a bound, reconcile or compensate partial work, preserve a stable
contract, and prove safe replay plus dependency recovery.
