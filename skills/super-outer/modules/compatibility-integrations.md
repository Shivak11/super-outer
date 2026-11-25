# Compatibility and Integrations

Module ID: `compatibility-integrations`

Peer status: first-class, never default. Verify versioned and third-party
boundaries from official behavior and coexistence evidence.

## Triggers

- SDKs, protocols, platforms, webhooks, providers, file formats, or old/new
  application versions change.
- A contract can drift outside this repository's control.
- Coexistence, fallback, migration, or isolation across a boundary is required.

## Non-triggers

- Internal-only work with no versioned or external boundary.
- A dependency mention with no changed behavior or supported-version impact.
- Generic comparison unconnected to an implementation or delivery decision.

## Progressive playbooks

- Load [versions-and-contracts.md](compatibility-integrations/subplaybooks/versions-and-contracts.md) for
  supported versions, protocol/SDK behavior, and contract drift.
- Load [coexistence-and-migration.md](compatibility-integrations/subplaybooks/coexistence-and-migration.md)
  for old/new clients, staged adoption, data exchange, and deprecation.
- Load [isolation-and-fallback.md](compatibility-integrations/subplaybooks/isolation-and-fallback.md) for
  dependency failure, provider change, adapters, and fallback behavior.

Load only the files implicated by the task.

## Router-facing method

Identify producer, consumer, exact supported versions, official contract,
repository assumptions, and failure ownership. Verify actual installed/runtime
behavior when the integration is load-bearing. Design coexistence and rollback
before removing prior behavior.

Before adding an identity, email or other hosted provider, inspect the current
deployment platform's supported services, existing storage, account permissions
and prerequisites such as sender domains. Compare an established library on
that platform with a hosted provider against the actual signup and recovery
journeys. Use current official documentation and account evidence; separate
missing setup from missing capability. Record the requirement the extra
service meets and its operating cost. Existing deployment does not excuse
weaker security or a poor fit.

## Decision kinds

- Treat protocol conformance, verified supported versions, signature/authenticity
  checks, and non-corrupting parsing as invariants.
- Treat support windows, fallback, adapter complexity, and provider portability
  as evidence-led trade-offs.
- Treat user-visible degradation between equivalent integrations as interpretive
  only when product intent is missing.

## Source hierarchy

Apply [source authority](../references/source-authority.md): binding protocol
or contractual rules, explicit local support contracts, official versioned
documentation/runtime source, evidence, then observed precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask about which users/versions must continue, acceptable degraded behavior, or
switch timing when contracts do not decide. Never ask the user to choose SDKs,
adapters, protocol libraries, parsers, or provider APIs.

## Comparable evaluation cases

### Positive

An SDK major-version change selects version, coexistence, and fallback review.

### Negative

An internal text-only refactor returns `not_applicable`.

### Boundary

A patch upgrade loads official compatibility evidence only if behavior is
load-bearing or changed; version number alone is insufficient.

### Failure

Detect contract drift, webhook replay, old-client breakage, provider-wide
failure, ambiguous deprecation, silent parse loss, and fallback recursion.

### Recovery

Restore the prior adapter or version, isolate the failing provider, replay only
verified-safe events, and prove old/new coexistence.
