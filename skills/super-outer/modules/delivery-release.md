# Delivery and Release

Module ID: `delivery-release`

Peer status: first-class, never default. Independently verify repository, exact
head, CI, package, installation, runtime activation, rollout, and rollback.

## Triggers

- Branches, worktrees, commits, CI, packages, installs, migrations, deployments,
  releases, promotion, or rollback are in scope.
- FULL or CRITICAL work is being called delivered.
- A claim depends on an environment, artifact, host discovery, or exact SHA.

## Non-triggers

- Read-only analysis with no delivery claim or repository mutation.
- Source correctness alone when the task explicitly stops before delivery.
- A passing local test presented as package, installation, or runtime proof.

## Progressive playbooks

- Load [git-topology-and-ci.md](delivery-release/subplaybooks/git-topology-and-ci.md) for base,
  merge-base, head, diff, worktrees, stacked branches, CI SHA, and a first
  publish to a new repository or remote.
- Load [package-install-runtime.md](delivery-release/subplaybooks/package-install-runtime.md) for
  deterministic artifacts, checksums, isolated homes, discovery, and activation.
- Load [rollout-rollback-proof.md](delivery-release/subplaybooks/rollout-rollback-proof.md) for
  migration, promotion, staged release, exact rollback, and proof boundaries.

Load only the files implicated by the task.

## Router-facing method

Compute topology and evidence independently from the real repository and
artifact. Bind every claim to an exact head, environment, and runtime surface.
Keep source checks, terminal CI, package identity, installation, host discovery,
hook execution, launch, and direct journey proof separate.

Branch mismatch and separate-review gaps normally warn and continue, in one
line. Reserve the one-line stop notice for extremely critical production,
private-data, security, destructive/external, or recovery harm. Independent
review stays advisory through `FULL`.

## Decision kinds

- Treat correct target/topology, clean exact-head identity, artifact integrity,
  isolated install proof, and verified rollback as invariants.
- Treat rollout size, compatibility window, evidence depth, and release timing
  as evidence-led trade-offs within the recorded task scope. Approval is
  required only when the next action crosses the extremely critical boundary.
- Treat release confidence as interpretive only for residual risk evidence
  cannot eliminate; technical gate failure is never a matter of taste.

## Source hierarchy

Apply [source authority](../references/source-authority.md): explicit release
contracts and approvals, official host/CI/package behavior, exact repository and
runtime evidence, mature practice, then observed precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask about release audience, acceptable residual risk, compatibility window, or
rollback authority only when not already approved. Never ask the user to choose
Git commands, CI products, package tools, installers, or deployment mechanics.

## Comparable evaluation cases

### Positive

A pull request, isolated plugin install, or release selects relevant delivery
playbooks. FULL repository or CI gaps remain visible advisories; CRITICAL or
explicit production delivery requires repository enforcement evidence.

### Negative

A read-only local explanation returns `not_applicable`.

### Boundary

A committed source change with no delivery claim loads topology proof but not
package/install guidance.

### Failure

Detect wrong PR base, stale reviewed head, dirty or stacked diff, CI on another
SHA, nondeterministic package, install without discovery, and unproved rollback.

### Recovery

Stop promotion, preserve the exact prior state, correct the smallest topology or
artifact issue, restore from the verified snapshot, and reprove every layer.

Versions and lineage: [release lineage and versioning](../references/release-lineage-and-versioning.md).
