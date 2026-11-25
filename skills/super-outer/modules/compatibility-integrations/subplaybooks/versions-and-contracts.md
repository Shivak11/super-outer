# Versions and contracts

## Load boundary

Load for SDK/platform/protocol versions, webhooks, file formats, dependency
upgrades, supported-version policy, or external contract drift.

## Review

- Record producer, consumer, exact current/target versions, normative or
  official contract, installed/runtime source, and repository assumptions.
- Test load-bearing behavior rather than relying on release-note summaries.
- Validate parsing, authentication/signature, errors, limits, and unknown fields;
  fail safely without silently dropping meaning.
- Read errors as the host wraps them before writing retry rules, and check both
  the fresh client version and any cached version the host restores.

## Failure probes and proof

Positive: supported old/current versions satisfy the contract. Negative:
unsupported or malformed input fails clearly. Boundary: patch version alone does
not trigger deep review unless behavior is load-bearing. Test version matrix,
unknown fields, reordered/replayed events, limits, and provider error drift.

## Recovery

Pin or restore the verified version, keep the prior adapter, quarantine invalid
events, and reprocess only after contract validation.
