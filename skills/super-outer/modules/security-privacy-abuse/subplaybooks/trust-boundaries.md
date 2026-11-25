# Trust boundaries

## Load boundary

Load for new entry points, public exposure, untrusted input, identity context,
privilege transitions, files, webhooks, admin paths, or external tools.

## Review

- Inventory assets, actors, entry points, trust crossings, privileges, data
  flows, and external effects. Name abuse goals and containment boundaries.
- Validate syntax, size, type, provenance, and authorization at each sensitive
  sink; treat client, model, webhook, and file content as untrusted.
- Default privileged and ambiguous operations to deny with useful audit evidence.

## Failure probes and proof

Positive: legitimate least-privilege flow succeeds. Negative: wrong actor,
tenant, origin, signature, input, and privilege fail closed. Boundary: public
read access still loads enumeration/resource-abuse review. Test direct boundary
calls rather than UI hiding.

## Recovery

Close or narrow the entry point, revoke affected privilege, preserve minimal
evidence, and verify every alternate path to the asset.
