# Frontend and Client Engineering

Module ID: `frontend-client`

Peer status: first-class, never default. Review client correctness and runtime
behavior separately from product UI/UX judgement.

## Triggers

- Client state, rendering, navigation, networking, caching, lifecycle, offline
  behavior, responsiveness, or platform code changes.
- A frontend boundary consumes a new or changed service contract.
- Main-thread, hydration, list, startup, or client-memory behavior is material.

## Non-triggers

- Pure visual interpretation with no client behavior or code consequence.
- Backend-only, schema-only, or operations-only work with unchanged clients.
- Static prose outside a shipped client.

## Progressive playbooks

- Load [state-and-rendering.md](frontend-client/subplaybooks/state-and-rendering.md) for state
  ownership, rendering, navigation, and component boundaries.
- Load [networking-and-lifecycle.md](frontend-client/subplaybooks/networking-and-lifecycle.md) for
  caching, offline, cancellation, backgrounding, and stale responses.
- Load [performance-and-platform.md](frontend-client/subplaybooks/performance-and-platform.md) for
  responsiveness, resource use, platform adaptation, and compatibility.

Load only the files implicated by the task.

## Router-facing method

Trace state ownership and one user action through render, network, persistence,
navigation, interruption, and return. Inspect actual platform and framework
versions. Separate client correctness from product taste and from server
correctness.

## Decision kinds

- Treat deterministic state ownership, cancellation safety, accessible client
  semantics, and truthful error presentation as invariants.
- Treat caching, rendering boundaries, responsiveness, and offline freshness as
  evidence-led trade-offs.
- Treat client interaction character as interpretive only when selected jointly
  with the UI/UX module.

## Source hierarchy

Apply [source authority](../references/source-authority.md): explicit client
contracts, official platform/runtime behavior, measured evidence, then observed
repository precedent. A framework convention does not overrule product law.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask only about observable freshness, interruption, latency, or recovery policy.
Never ask the user to pick state libraries, rendering APIs, cache algorithms, or
platform-specific code structure.

## Comparable evaluation cases

### Positive

An offline-capable client write selects this module and lifecycle guidance.

### Negative

A database index change with no client contract change returns `not_applicable`.

### Boundary

A copy-only label change does not load networking or performance guidance.

### Failure

Detect stale responses overwriting newer state, duplicate submits, navigation
loss after backgrounding, and loading states that misrepresent saved content.

### Recovery

Cancel or fence stale work, restore the last valid local state, keep a retry or
return path, and verify interruption on the actual client surface.
