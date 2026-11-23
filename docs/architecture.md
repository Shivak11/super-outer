# Super-Outer architecture

![Super-Outer public architecture](architecture.svg)

The skill is a portable engineering workflow. It makes the creative brief and the test of success explicit; the coding host executes tools and enforces permissions. Running the installer is a separate act by the user.

| Layer | Input | Output | Boundary |
|---|---|---|---|
| Installation | A user runs the Vercel skills CLI | A local skill with `SKILL.md` and optional references | No hook or background process is included. GitHub and the package registry are part of the user's chosen installer path. |
| Agent host | A creator’s request, accessible repository and loaded skill | Decisions, permitted tool calls and their results | Claude Code or Codex controls actual permissions. The skill cannot grant access. |
| Review lanes | Repository evidence, affected users and reversibility | A direct fix, a bounded workflow plan or a wider approval decision | Stop at plan-only scope, an unresolved high-impact decision or a host refusal. |
| Delivery | A requested, permitted change | Test outputs and a short explanation of what is still unverified | A local smoke test is not deployment proof. |
| Evaluation | Synthetic case and model response | Structural checks and a human rubric | Run separately. No background collection of real prompts. |

## Editable diagram

```mermaid
flowchart TD
  C["Non-technical creator: describe what you want to build"]
  I["User runs npx skills add"] --> S["Local SKILL.md + reference files"]
  S --> H["Claude Code or Codex loads guidance"]
  C --> H
  H --> R["Read repository rules, relevant code and tests"]
  R --> Q{"How wide is the impact?"}
  Q -->|Tiny| T["Fix and check the specific issue"]
  Q -->|Local| L["Walk the journey and choose a reversible default"]
  Q -->|Wide| W["Name risks, recovery and the decision that needs approval"]
  T --> B{"Implementation requested and authorised?"}
  L --> B
  W --> B
  B -->|No| P["Return a plan, recommendation or approval request"]
  B -->|Yes| A{"Host permits the action?"}
  A -->|Denied| D["Stop the action; explain what cannot be verified"]
  A -->|Allowed| X["Make the scoped change and run observable checks"]
  X --> G["Report what changed, evidence and unverified items"]
  G --> C

  subgraph E["Separate synthetic evaluation"]
    F["Fixture"] --> M["Fresh agent response"]
    M --> J["Structural checks + human rubric"]
    J --> U["Maintainer edits and reviews the skill"]
  end
  U -. "A future release, when installed by the user" .-> S
```
