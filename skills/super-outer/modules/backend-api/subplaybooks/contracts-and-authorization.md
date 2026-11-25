# Contracts and authorization

## Load boundary

Load for request/response shapes, business rules, validation, error contracts,
authentication context, or resource authorization.

## Review

- Specify accepted, missing, malformed, oversized, hostile, and incompatible
  input; keep error contracts truthful and backward-aware.
- Authorize the actor against the exact resource and action at the protected
  boundary. UI hiding and authentication alone are insufficient.
- Trace every caller and consumer before changing shape or semantics.

## Failure probes and proof

Positive: allowed actor and valid input produce the contract. Negative: reject
wrong owner/role and hostile input. Boundary: privacy policy routes to security.
Test old/new clients, resource enumeration, missing fields, limits, and explicit
error mappings.

## Recovery

Restore the prior compatible contract or adapter, deny uncertain privileged
actions, preserve audit evidence, and verify all known consumers.
