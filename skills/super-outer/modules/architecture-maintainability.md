# Architecture and Maintainability

Module ID: `architecture-maintainability`

Peer status: first-class, never default. Review system boundaries and future
change cost without turning every task into a redesign.

## Triggers

- Shared foundations, refactors, new abstractions, dependency direction,
  ownership, extensibility, or long-lived system boundaries change.
- Several consumers depend on changed semantics.
- Complexity, operability, testing seams, or replacement cost is material.

## Non-triggers

- A local, bounded fix that preserves existing boundaries and contracts.
- Speculative redesign unrelated to the confirmed objective.
- Style preferences that do not affect ownership or change cost.

## Progressive playbooks

- Load [boundaries-and-dependencies.md](architecture-maintainability/subplaybooks/boundaries-and-dependencies.md)
  for responsibility, contracts, coupling, and dependency direction.
- Load [abstractions-and-ownership.md](architecture-maintainability/subplaybooks/abstractions-and-ownership.md)
  for shared abstractions, lifecycle ownership, and extension seams.
- Load [change-cost-and-operability.md](architecture-maintainability/subplaybooks/change-cost-and-operability.md)
  for complexity, diagnostics, maintenance, testing, and replacement.

Load only the files implicated by the task.

## Router-facing method

Map changed responsibilities, every direct consumer, data/control ownership,
dependency direction, and the next credible change. Prefer the smallest boundary
that makes current behavior correct and future change legible. Do not recommend
an abstraction without at least two evidenced responsibilities or consumers.

## Decision kinds

- Treat one clear owner for state and enforceable contract boundaries as
  invariants where ambiguity causes correctness failures.
- Treat abstraction level, coupling, extension, operability, and migration cost
  as evidence-led trade-offs.
- Treat code organization aesthetics as interpretive only when they encode an
  explicit repository convention rather than personal preference.

## Source hierarchy

Apply [source authority](../references/source-authority.md): explicit
architecture contracts, official platform constraints, measured change and
operating evidence, mature patterns, then observed repository precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask about expected ownership, lifespan, replacement, or change frequency only
if it affects product or delivery. Never ask the user to choose patterns,
dependency-injection tools, folder structures, or abstraction mechanisms.

## Comparable evaluation cases

### Positive

A cross-service shared contract refactor selects boundary and operability review.

### Negative

A one-line isolated validation fix returns `not_applicable`.

### Boundary

A second consumer may justify an abstraction review; one hypothetical future
consumer does not.

### Failure

Detect split ownership, circular dependencies, hidden global state, a wrapper
that leaks its dependency, and abstractions that make failure harder to operate.

### Recovery

Restore the previous contract seam, isolate the new path behind a narrow adapter,
retain migration compatibility, and verify all known consumers.
