# Data and prompt injection

## Load boundary

Load for model-visible private data, retrieval, tools, external content,
instructions from several sources, agent authority, or prompt injection.

## Review

- Map data/instruction provenance, trust, purpose, retention, provider exposure,
  model authority, tool inputs/outputs, and external effects.
- Keep untrusted content separate from governing instructions. Validate and
  authorize every tool action outside model text.
- Minimize context and privileges; never place secrets or unnecessary personal
  data in prompts, traces, evaluations, or caches.

## Failure probes and proof

Positive: trusted task succeeds with least authority. Negative: retrieved/user
content cannot override policy, exfiltrate data, or invoke unauthorized tools.
Boundary: generated draft without tools still loads data review. Test indirect
injection, encoded content, tool arguments, cross-user retrieval, and refusal.

## Recovery

Disable model/tool authority, quarantine unsafe output, revoke affected access,
reconcile external actions, and restore a deterministic least-privilege path.
