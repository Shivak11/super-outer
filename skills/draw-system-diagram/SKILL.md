---
name: draw-system-diagram
description: Draws and maintains light, colourful diagrams of a software system as SVGs with PNG copies. An architecture diagram shows the parts and how they connect, with live and planned parts and one traced request. A pipeline diagram shows how inputs become outputs, stage by stage, with who performs each step. A code-flow diagram explains one endpoint or backend flow to a developer: a column per system, time running down, numbered steps, what runs at the same time, the function to open for each step and what happens on failure. It also draws a one-problem diagram of a change that took several attempts. A facts block in each SVG and a test keep the pictures in step with the code. Use when someone asks for an architecture, system or deployment diagram, a picture of how a product, process or AI pipeline works, how an endpoint, API route or backend flow works, a diagram of one hard problem, or when a change makes an existing diagram untrue. Not for data charts, slides or quick sketches in chat.
---

# Draw a system diagram

Each diagram teaches someone who does not read the code how the system works today. Every box names something that exists in the code or is marked as planned, every arrow says what moves, and the facts the picture states are checked against the source.

## Choose the kind

| Kind | What it explains | Start from |
|---|---|---|
| Architecture | The parts and how they connect: the people and their clients, the system, outside services and models, storage, release and checks, the next phase, and one real request traced from start to finish. Usually `docs/architecture/system-diagram.svg`, shown at the top of the README. | [assets/template-system.svg](assets/template-system.svg) and [references/style.md](references/style.md) |
| Pipeline | How inputs become outputs: what is prepared and when, each stage and who performs it, the data between stages, decisions, validation and results. | [assets/template-pipeline.svg](assets/template-pipeline.svg) and [references/pipeline.md](references/pipeline.md) |
| Code-flow | One endpoint or backend flow, for a developer who will open the code: a column for each system, time running down, numbered steps, an AT ONCE tag on work that runs at the same time, a code pointer on every step, a failure strip and a glossary. Generated from a script. | [assets/example-code-flow.py](assets/example-code-flow.py), which builds [assets/template-code-flow.svg](assets/template-code-flow.svg), and [references/code-flow.md](references/code-flow.md) |
| One-problem | One change that took several attempts: what the person saw before, the fix, the approaches tried and dropped, and what was measured and what is still open. | The one-problem section of `style.md` |

Take the kind from the request:

- "architecture", "system diagram", "components", "services", "infrastructure" or "deployment" means architecture;
- "how it works", "pipeline", "AI pipeline", "processing flow", "data flow" or "what happens to the input" means pipeline;
- "endpoint", "API flow", "request flow", "backend flow", "how this route works", "sequence" or "what runs in parallel" means code-flow;
- a request that asks for both, or names both kinds, means two diagrams;
- "a diagram of this problem" or "why this took so long" means one-problem.

When the request fits more than one kind, pick the one whose question the person asked and name the choice in the report. When "how it works" or "data flow" could mean a pipeline or a code-flow diagram, pick by reader: a reader who will open the code gets code-flow, anyone else gets the pipeline. Ask only when the two kinds would show the person different things they need, such as "draw how the app works" for a product with a large hosting setup and a long AI process. Set `data-diagram="pipeline"`, `data-diagram="code-flow"` or `data-diagram="one-problem"` on the `<svg>` element; an SVG without it is checked as an architecture diagram.

## Workflow

Copy this checklist and work through it:

```
- [ ] 1. Read the code and list what the picture needs
- [ ] 2. Separate what runs today from what is planned
- [ ] 3. Choose the example: one real request, or one real input
- [ ] 4. Draw each SVG from its template
- [ ] 5. Add the facts block and its test
- [ ] 6. Run the checker until it passes
- [ ] 7. Render each PNG and look at it
- [ ] 8. Commit the SVGs, PNGs, test and note together
```

**1. Read the code.** For architecture, list the entry points, workers, scheduled jobs, stores, outside services and models, and switches from the source and the deployment config. For a pipeline, follow one input through the code that handles it and list each step that changes it, who or what performs it, and what it passes on. Use the names the project uses. When the repository already has diagrams, read them and its diagram note first, and keep their names.

**2. Today or planned.** A part or step is live only when the live release runs it. Read the switch values in the deployment config, not the code's defaults, and read when work happens from the code, not from a design note. An architecture diagram draws a part that is built and switched off, or agreed and not built, with a dashed border. A pipeline diagram draws only what runs, unless the person asks to see a proposed change. When a handler is only a stub, or what a part does is stated only in a comment, draw what the code does today and name the gap in the report. When the source does not settle this, say so in the report and do not guess. When the repository records no live release, the subtitle names the commit and date the picture was drawn from, and the facts test does not compare that commit, because it changes with every commit.

**3. The example.** For architecture, pick a request a real person sends, quote it exactly, and trace it through the parts in four or five numbered steps, with one sentence on how a different request takes another path. When the repository holds no real request, write a typical one and title the strip so ("A typical email, start to finish"); never present an invented request as a real one. A pipeline needs no traced strip: its stages are the path. Use a real input's values in the boxes only when they help the reader, and name its source.

**4. Draw.** For code-flow, follow the steps in `code-flow.md` instead: read the live refs with `scripts/snapshot-refs.sh`, generate the SVG with `scripts/diagram_kit.py`, check each claim with `scripts/verify_facts_template.py`, and review a tall picture with `scripts/slice-diagram.mjs`. `scripts/selftest.sh` proves those tools work on this machine. For the other kinds, start from the template for the kind and follow its reference for layout, colours, shapes and arrows. When the repository has its own design tokens or brand colours, map each kind of part to one of them and keep the other rules. Write every label as a plain statement of what the part or step does.

**5. Facts and test.** Put the values the picture states into a `<metadata id="diagram-facts">` block (older diagrams use `architecture-facts`, which still works) and add a test in the repository's own runner that compares them with the source. [references/keeping-it-true.md](references/keeping-it-true.md) has the block, test examples in Node and Python, the repository note and the redraw triggers. Make the test fail once with a wrong fact before trusting it.

**6. Check.** Run:

```bash
node <skill-folder>/scripts/check-diagram.mjs path/to/diagram.svg
```

It measures every line of text against its box, because SVG text does not wrap. It checks the white canvas, the title and description, the facts block, that every arrow has a label, that no arrow runs through a box or is drawn under one, and that no text presents a model's confidence as accuracy. For architecture and one-problem diagrams it also checks the legend; pipeline and code-flow diagrams need none. It rejects scripts, images and outside links. For two diagrams of one system, pass both files with `--one-system` so a fact the two state differently is reported. Fix every error and run it again until it passes. Use `--no-facts` only for a diagram that states no values from code.

**7. Render and look.** Run:

```bash
node <skill-folder>/scripts/render-diagram.mjs path/to/diagram.svg
```

It writes a PNG at twice the size beside the SVG, using Chrome, Chromium, Edge or Brave without a window. Open the PNG and look at it. Check that no label crosses a border, that every arrow reaches the box it points at, that the eye can follow the request or the input from start to finish, and that dashed parts are the ones the release does not run. Fix the SVG, then check and render again. If no browser is installed, say so in the report and commit only the SVG.

**8. Commit.** The SVGs, PNGs, test and repository note go in one commit with the change that made them necessary. When this is the repository's first diagram, also add the diagram note and the one-line rule for agents described in `keeping-it-true.md`, and link the SVG from the README.

## Existing diagrams

- When the repository has a diagram of this kind, keep it current in the same commit as any change that makes it untrue. The redraw triggers are in `keeping-it-true.md`.
- When the repository keeps Mermaid or other diagrams that its own process maintains, leave them in place and add this diagram beside them. Replace them only when the owner asks.
- Never change a fact in the block just to make the test pass. Redraw the part of the picture that changed, then update the block.

## Report

Show the owner each PNG. Say which kind you drew and why, what the picture now shows that it did not before, which parts are dashed and why, and anything the code could not settle.
