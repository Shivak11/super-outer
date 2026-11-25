# Which diagrams a piece of work needs

Super-outer decides which diagrams a piece of work needs and draws them with the `draw-system-diagram` skill without being asked. The decision runs at two moments: when a plan is written, and at the milestone sweep (`super-outer sweep --plan` lists the result).

| Kind | Draw it when |
|---|---|
| Architecture | A product is set up, or its parts change: a service, store, outside service or model is added, removed or renamed, or a switch changes in the live release. |
| Pipeline | An AI or data process is added, or its stages change. |
| Code-flow | An endpoint or backend flow is added or changed, and a developer will maintain it. |
| One-problem | Only when someone asks for it. |

Decide from the changed files and the project facts first (`src/diagram-plan.mjs` holds the file patterns). When they do not settle it, ask Jev the closed `diagram-kinds` question. This one question decides from the start, because a wrong pick costs only a redraw. If Jev is off or unsure, ask the owner one question, for example: "Will a developer maintain this new export route, so it needs a diagram of how the request flows through the code?"

When a repository already has a diagram of a kind the work changes, update it in the same commit as the change without asking.
