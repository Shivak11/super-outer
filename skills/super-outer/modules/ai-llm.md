# AI and LLM Systems

Module ID: `ai-llm`

Peer status: first-class, never default. Review model variability, data and tool
boundaries, evaluation, provider drift, cost, and human control.

## Triggers

- Model calls, agents, retrieval, embeddings, generated decisions, tool use,
  model-visible private data, or metered AI behavior changes.
- Prompt injection, output validation, provider drift, evaluation, latency,
  fallback, or human override is material.
- Non-deterministic output can affect users or external state.

## Non-triggers

- Deterministic code with no model, retrieval, or AI-provider boundary.
- Marketing language that mentions AI but changes no AI system behavior.
- Generic model enthusiasm unsupported by a product workflow.

## Progressive playbooks

- Load [data-and-prompt-injection.md](ai-llm/subplaybooks/data-and-prompt-injection.md)
  for trust boundaries, retrieval, tools, instructions, and sensitive data.
- Load [evaluation-and-variability.md](ai-llm/subplaybooks/evaluation-and-variability.md)
  for task metrics, golden/adversarial cases, drift, and output validation.
- Load [cost-provider-human-control.md](ai-llm/subplaybooks/cost-provider-human-control.md)
  for latency, metering, provider failure, fallback, override, and auditability.

Load only the files implicated by the task.

When work builds or changes an agent, LLM chain, skill or MCP server, run the read-only `jev-opportunities` and `caveman-opportunities` skills.

## Router-facing method

Map data and instruction provenance, model authority, tools/external effects,
output consumers, variability, cost, and human control. Evaluate the user task,
not merely prompt shape. Treat model text as untrusted at every privileged or
structured boundary.

Every release of an AI feature replays a fixed set of real conversations and
records pass or fail for each one. Build the set from real, consented
conversations, including ones that went wrong in production, and add each new
failure to it. When Langfuse is connected, keep the set as a Langfuse dataset
and record each release as an experiment run. A review that never runs the real
model does not prove the feature works.

## Decision kinds

- Treat least model/tool privilege, private-data boundaries, untrusted output,
  externally validated actions, and human control for high consequence as
  invariants.
- Treat quality, latency, cost, context, fallback, and acceptable variability as
  evidence-led trade-offs.
- Treat tone and generative character as interpretive only after local product
  and content evidence is inspected.

## Source hierarchy

Apply [source authority](../references/source-authority.md): binding privacy
and safety duties, explicit product/data contracts, official provider behavior,
task-specific evaluations and research, then observed local precedent.

## Required result

Return every field in the [specialist result contract](../references/specialist-result-contract.md):
`schema_version`, `module`, `applicable`, `trigger_evidence`, `risk`,
`user_consequence`, `decisions`, `benchmark_evidence`, `existing_evidence`,
`unknowns`, router-only `proposed_questions`, `verification`, and `recovery`.

## Plain-English question guidance

Follow [plain-English questions](../references/plain-english-questions.md).
Ask about acceptable mistakes, human control, data use, latency, or cost only
when evidence cannot decide. Never ask the user to select models, embedding
methods, prompt templates, vector stores, or agent frameworks.

## Comparable evaluation cases

### Positive

A retrieval agent that can send messages selects all applicable AI playbooks.

### Negative

A deterministic API validation change returns `not_applicable`.

### Boundary

A model-generated draft with no external action still loads evaluation and data
guidance; tool-control guidance loads only if authority changes.

### Failure

Detect prompt injection, private-data leakage, hallucinated structured output,
provider drift, runaway tool loops, duplicate charges, and missing human escape.

### Recovery

Disable model or tool authority, preserve a deterministic fallback, quarantine
unsafe output, reconcile external effects, and rerun the task evaluation set.
