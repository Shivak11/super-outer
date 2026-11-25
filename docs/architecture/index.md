# Architecture views

These views follow the C5 convention in [CONVENTION.md](CONVENTION.md). C5 is
the four C4 views plus a fifth layer for evidence and status. Each SVG is the
source. Each PNG is a copy at twice the size. Every view shows release 6.6.0
and the date it was drawn.

| View | What it shows | Files |
|---|---|---|
| 1. System context | Who and what Super-outer works with | [SVG](views/01-system-context.svg), [PNG](views/01-system-context.png) |
| 2. Containers | The parts that run, and where they live | [SVG](views/02-containers.svg), [PNG](views/02-containers.png) |
| 3. Components: routing path | How one typed request gets its route | [SVG](views/03-components-routing.svg), [PNG](views/03-components-routing.png) |
| 4. Dynamic: one request | The steps after "Add Google sign-in to my app" | [SVG](views/04-dynamic-one-request.svg), [PNG](views/04-dynamic-one-request.png) |
| 5. Evidence and status | How proof stays apart, and what this release has proven | [SVG](views/05-evidence-status.svg), [PNG](views/05-evidence-status.png) |

## Decisions

- [Operating constraints](decisions/0002-operating-constraints.md): evidence
  categories stay separate, and the installer owns only its own markers.
- [Jev decides the design path when a person switches it on](decisions/0004-jev-routing-judgement.md).

## Other diagrams

The diagrams in [docs/diagrams/](../diagrams/README.md) carry a facts block.
`tests/super-outer-diagrams.test.mjs` compares those facts with the source.

## Keep the views true

Update a view in the same change that makes it untrue. Render the SVG to PNG
and look at the PNG before you commit. Record a fact you could not check as
unknown.
