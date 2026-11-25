# Diagrams of Super-outer

Three diagrams explain Super-outer itself. Each SVG is the source; the PNG beside it is a copy at twice the size for places that cannot show SVG.

| File | Kind | What it shows |
|---|---|---|
| `super-outer-architecture.svg` | Architecture | How the parts connect: the hosts, the prompt hook, the router skill, the specialists and review agents, the command layer and tool check, Jev, the public registries, the records in the owner's project, installation and the optional parts, with one typical request traced from start to finish. |
| `request-pipeline.svg` | Pipeline | How one typed request becomes plain decisions and checked work, including the planned journey for new work and the approval phrase before an extremely critical action. |
| `tool-check-pipeline.svg` | Pipeline | How the tool check turns a project's package lists into the Tools block the owner answers. |

They use the house colours of the `draw-system-diagram` skill unchanged; Super-outer has no colours of its own. A dashed border means built and switched off, or planned. Jev is dashed because it stays off until the owner adds a key.

## Keeping them true

Each SVG holds a `<metadata id="diagram-facts">` block with the values the picture states. `tests/super-outer-diagrams.test.mjs` compares those values with the source, so `npm test` fails when a diagram goes out of date. When it fails, redraw the part of the picture the message names, then update the facts block. Never change a fact only to make the test pass.

Redraw in the same commit as the change when:

- a part is added, removed or renamed, such as a hook event, a host, a specialist module, a review agent, a shipped skill or an optional part;
- Jev's address, its character limit or its default state changes, or the tool check calls a different registry;
- the depths, the question allowances, the approval phrase or its time limit change;
- the engineering approach gains, loses or reorders a line, or the kinds of proof change;
- a tool check stage, limit or safety rule changes, or the owner's answers are kept differently;
- the router routes the traced request ("Add Google sign-in to my app") differently;
- the version changes, which changes the architecture subtitle.

## Commands

Check, then render, from the repository root:

```bash
node skills/draw-system-diagram/scripts/check-diagram.mjs --one-system docs/diagrams/super-outer-architecture.svg docs/diagrams/request-pipeline.svg docs/diagrams/tool-check-pipeline.svg
node skills/draw-system-diagram/scripts/render-diagram.mjs docs/diagrams/super-outer-architecture.svg
node skills/draw-system-diagram/scripts/render-diagram.mjs docs/diagrams/request-pipeline.svg
node skills/draw-system-diagram/scripts/render-diagram.mjs docs/diagrams/tool-check-pipeline.svg
node --test tests/super-outer-diagrams.test.mjs
```

Open each PNG after rendering. Check that each label fits and each arrow reaches its destination. Use the README for the owner’s view. Link source paths, conditions and evidence from the C4 and C5 pages.
