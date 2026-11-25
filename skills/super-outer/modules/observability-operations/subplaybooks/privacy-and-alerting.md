# Privacy and alerting

## Load boundary

Load for logs/metrics/traces containing sensitive context, retention, sampling,
cardinality, alerts, paging, or normal/warning/stop boundaries.

## Review

- Minimize fields, access, retention, and cardinality to the operational purpose;
  use bounded values and privacy-safe identifiers.
- Define normal, warning, and stop thresholds from user harm or service
  objectives, with action, owner, urgency, and false-positive consequence.
- Alert on actionable symptoms; dashboards without an owner are not controls.

## Failure probes and proof

Positive: a stop condition reaches the responsible owner with enough safe
context. Negative: secrets, transcripts, payloads, or unbounded labels never
enter telemetry. Boundary: alert thresholds may require product risk input.
Test warning/stop, duplicate alert, missing owner, delayed data, and recovery.

## Recovery

Disable unsafe fields, restrict access, correct retention where authorized,
restore a bounded signal, and verify alert resolution and owner handoff.
