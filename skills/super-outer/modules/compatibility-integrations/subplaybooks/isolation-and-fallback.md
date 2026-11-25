# Isolation and fallback

## Load boundary

Load for external-provider failure, adapters, fallback, provider switch,
contract isolation, rate limits, or third-party removal.

## Review

- Keep provider-specific types, errors, credentials, retries, and limits behind
  a narrow boundary with a product-level contract.
- Verify fallback is genuinely independent, capacity-safe, semantically
  truthful, and not a recursive call to the same failed dependency.
- Define state reconciliation and deduplication across provider changes.

## Failure probes and proof

Positive: primary and fallback each satisfy declared behavior. Negative: partial
primary success plus fallback cannot double effects. Boundary: reduced feature
choice may need router input. Test down/slow/rate-limited/malformed provider,
fallback exhaustion, recovery, and switch-back.

## Recovery

Isolate the failing provider, stop unsafe fallback, reconcile effects by stable
identity, restore the prior adapter, and re-enable after recovery proof.
