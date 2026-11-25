# Architecture and agent-change documentation convention

Status: adopted for this repository. This public edition keeps the views and
decisions; the private evidence history (`raw/`, `log.md`) and the automatic
reconciliation workflow are not published.

## What deserves durable documentation

Record the knowledge needed to make the next safe change: product intent,
non-obvious constraints, rejected alternatives, accepted limits, failure modes,
ownership across repositories, rollout dependencies, and evidence gaps.
Code summaries, directory inventories, and routine change lists do not need
their own durable narrative when an agent can recover them from source.

For a routine edit, update existing relevant records or record that no durable
decision changed. Do not manufacture a decision record for every commit.

## C4 and our C5 extension

- **C4:** system context and deployable containers; selected component views
  only where they explain a consequential boundary or difficult workflow.
  The standard fourth level is code. Deployment is a separate view. Libraries
  and SDKs are components or implementation details, not
  independently deployed containers. These rules override inconsistent examples
  in the installed C4 skill.
- **Decision records:** the problem, decision drivers, alternatives actually
  considered, chosen approach, consequences, and reasons to revisit it.
- **C5:** our project extension for agent-assisted change provenance. It links
  the goal, decisions, recorded agent contributions, human interventions,
  validation and remaining gaps to the merged implementation. C5 is not an
  additional level of the standard C4 model.

An agent/model attribution is useful only when a source explicitly records it.
A commit author, co-author line, or a planned review does not establish tool,
model, prompts used, review completion, or approval. Mark missing facts unknown.
Capture concise decisions and outcomes, not entire chats or private reasoning.

## Files and authority

The repository README is the visual entry point for a new developer: keep a
compact Mermaid system map, the agent-to-documentation workflow, and links to
the detailed views and decisions. Reconcile its map whenever those boundaries
change. Avoid duplicating the full evidence or decision history in the README.

```
docs/architecture/
  index.md          map of current views and records
  CONVENTION.md     this process
  views/            the five C5 views as SVG, with PNG copies
  decisions/        proposed, accepted, observed, rejected or superseded decisions
```

An **accepted** decision has explicit human approval evidence. **Observed**
means the implementation and rationale were recovered from existing sources;
it must not invent a decider or imply a new approval. Supersede accepted records
with a new linked record when the decision changes. Preserve raw inputs and
past validation evidence instead of rewriting them to match a newer result.

Every view states the release it describes and the date it was drawn. The
fifth layer, the evidence and status view, labels each claim with one of the
evidence labels below. Keep numbers next to the file that contains them.

Label evidence as:

- **Observed in source:** present at the inspected code revision.
- **Recorded rationale:** explicitly stated in a linked decision, review or handoff.
- **Validated locally:** a recorded command and result from this session.
- **Inferred:** a synthesis with its inputs, clearly separated from recorded intent.
- **Unknown/unverified:** missing history, deployment, device or integration proof.

A view marked current means its release's source has been reconciled. It does not
establish live service health, deployed feature flags, device behavior or
unchanged unmonitored dependencies.

## Coding-agent workflow

Before a material change, read the relevant views and existing decisions.
During work, capture the problem, decision drivers, considered alternatives,
human directions and unexpected constraints. At handoff, put a short record of these in
the pull request description.
Record tests as passed, failed, skipped, or unrun, with command, scope and result.
An agent may record its own execution evidence; another agent must not convert
a plan or an unsupported claim into a completed validation.

No secret values, credentials, private user content, access tokens, or full
unsanitized conversation exports belong in these files. Record an agent/model
name only if known, and explain unavailable historical evidence as unknown.

## Reconciliation in the public edition

The author's development repository runs a documentation agent after each push to `main`.
That workflow needs a model API secret, so the public edition does not ship it.
Here, a contributor updates the views by hand in the same change that alters a
boundary they show. Render each changed SVG to PNG, look at it, and record the
check in the pull request.

## Validation and limits

`tests/super-outer-diagrams.test.mjs` compares the facts block of each diagram
in `docs/diagrams/` with the source code. The C5 views in `views/` describe the
same release and carry their version and date in the picture. No check proves
semantic correctness; a reviewer must still read the source.

## Skill sources

The development repository pins three third-party documentation skills: C4
Architecture from softaworks/agent-toolkit, and Architecture Decision Records
and Grounded Vault from wshobson/agents. Both sources are MIT licensed. They
are not bundled here. Install them from their sources if you want them.
