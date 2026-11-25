# Security, Privacy and Abuse

Module ID: `security-privacy-abuse`

Peer status: first-class, never default. Threat-model trust boundaries and
enforce least privilege without confusing configured controls with coverage.

## Triggers

- Identity, authentication, authorization, permissions, secrets, private data,
  payment, hostile input, public exposure, or privileged operations change.
- A supply-chain, webhook, file, model, admin, or third-party boundary changes.
- Misuse, enumeration, leakage, fraud, or incident containment is plausible.

## Non-triggers

- A local prose or formatting change with no exposure or dependency consequence.
- Generic fear unconnected to an asset, actor, boundary, or abuse case.
- Performance work that does not change access, exposure, or resource abuse.

## Progressive playbooks

- Load [trust-boundaries.md](security-privacy-abuse/subplaybooks/trust-boundaries.md) for assets,
  actors, entry points, hostile input, and privilege transitions.
- Load [authorization-and-privacy.md](security-privacy-abuse/subplaybooks/authorization-and-privacy.md)
  for resource authorization, minimization, retention, consent, and leakage.
- Load [abuse-supply-chain-response.md](security-privacy-abuse/subplaybooks/abuse-supply-chain-response.md)
  for rate abuse, fraud, dependencies, auditability, and containment.

Load only the files implicated by the task.

When the product has a [journey map](../references/journey-map.md), read its
personal data list and its who-can-do-what list in the product brief before
this review.

## Router-facing method

Identify assets, legitimate and hostile actors, trust crossings, authorization
decisions, data flows, and containment controls. Test at the protected resource,
not only the UI or gateway. Keep private details out of research and evidence.

## Decision kinds

- Treat resource-level authorization, secret protection, least privilege,
  private-data minimization, and fail-closed privileged action as invariants.
- Treat control friction, retention, rate limits, and incident thresholds as
  evidence-led trade-offs within binding constraints.
- Treat user-facing consent or recovery language as interpretive only when law
  and explicit product contracts leave room.

## Source hierarchy

Apply [source authority](../references/source-authority.md). Binding legal,
privacy, security, and payment duties come first; then explicit policies,
official platform behavior, evidence-backed controls, and local precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask only about who may do what, acceptable user friction, data purpose,
retention, or incident policy when not already constrained. Never ask which
crypto, authentication library, secret store, scanner, or firewall to use.

## Comparable evaluation cases

### Positive

An authenticated multi-tenant endpoint selects authorization and abuse review.

### Negative

A private local test rename with no dependency change returns `not_applicable`.

### Boundary

A public read endpoint loads exposure and abuse guidance even without accounts.

### Failure

Detect cross-tenant access, indirect object reference, secret leakage, unsafe
logs, privilege escalation, replay, dependency compromise, and enumeration.

### Recovery

Revoke or narrow access, contain exposure, preserve privacy-safe audit evidence,
rotate only affected credentials with approval, and verify the boundary closed.
