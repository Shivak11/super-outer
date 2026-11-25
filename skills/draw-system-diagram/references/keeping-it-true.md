# Keeping a diagram true

A diagram that drifts from the code teaches the wrong system. Three things keep it true: a facts block inside the SVG, a test that compares the block with the source, and a note in the repository that tells the next agent when to redraw.

## Contents
- The facts block
- The test
- The repository note
- When to redraw

## The facts block

Put one `<metadata id="diagram-facts">` element directly after `<desc>`. Diagrams drawn before pipelines were added use `id="architecture-facts"`; the checker accepts both, so leave an existing one as it is. It holds one JSON object with every value the picture states that the code also states:

- the names of the parts that come from code, such as a worker, a queue or a store;
- model names, effort levels and tiers;
- limits, thresholds, timers and slot counts;
- whether each switch is on in the live release (this is what makes a border solid or dashed);
- the release identifier and date shown in the subtitle;
- for a pending change, a nested object marked `"deployed": false`, so the picture can show it dashed while the test still checks it.

```xml
<metadata id="diagram-facts">{"release":"4f2c9e1","routerModel":"model-small","taskSlots":2,"cron":"* * * * *","webSearch":{"enabled":false}}</metadata>
```

Leave out anything the code does not state. A count of boxes or a colour is style, not a fact.

## The test

Write the test in the repository's own test runner, beside its other tests. When that runner is already broken before you start, leave it alone, run the test file directly, and say in the report which command you used and why. It reads the SVG, parses the block and compares each value with the source. Import the constant where the language allows it. Read the source text with a narrow pattern only when the value is not exported, such as a value in a deployment config.

Node (`node:test`):

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ROUTER_MODEL } from "../src/router.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const svg = read("docs/architecture/system-diagram.svg");
const facts = JSON.parse(/<metadata id="(?:diagram|architecture)-facts">([\s\S]*?)<\/metadata>/.exec(svg)?.[1] ?? "null");

test("the system diagram states what the code does", () => {
  assert.ok(facts, "system-diagram.svg needs its facts block");
  assert.equal(facts.routerModel, ROUTER_MODEL);
  assert.equal(facts.cron, /"crons":\s*\["([^"]+)"\]/.exec(read("wrangler.jsonc"))?.[1]);
});

test("the system diagram has its PNG", () => {
  assert.ok(existsSync(new URL("../docs/architecture/system-diagram.png", import.meta.url)), "render the PNG");
});
```

Python (`pytest`):

```python
import json, re
from pathlib import Path
from app.router import ROUTER_MODEL

ROOT = Path(__file__).resolve().parents[1]
SVG = (ROOT / "docs/architecture/system-diagram.svg").read_text()
FACTS = json.loads(re.search(r'<metadata id="(?:diagram|architecture)-facts">(.*?)</metadata>', SVG, re.S).group(1))

def test_diagram_states_what_the_code_does():
    assert FACTS["routerModel"] == ROUTER_MODEL
```

Each assertion message says what to redraw. Run the test once with one fact deliberately wrong and confirm it fails, then put the fact back. A test that never failed proves nothing.

For one-problem diagrams, keep one test per diagram in a separate file, so a failure names the problem whose picture went stale. A pipeline diagram gets its own test too, which checks the model, the preparation schedule and whether each step reads its inputs together or one at a time. When a repository has both an architecture and a pipeline diagram, also run the checker on the two with `--one-system`, so the shared facts cannot drift apart.

## The repository note

When the first diagram lands, add `docs/architecture/DIAGRAM-STYLE.md`, or the repository's usual place for such notes. Keep it short:

- what the diagram is, where it is shown, and that the PNG is a copy at twice the size;
- the list under "When to redraw" below, written for this repository;
- the colour mapping, if the repository's own colours replaced the house colours;
- the exact commands that check and render it, with the paths in this repository and the skill folder's path as installed on this computer.

Add one line to the repository's agent instructions (`AGENTS.md` or `CLAUDE.md`), naming every diagram: "Keep docs/architecture/system-diagram.svg current in the same commit as any change that makes it untrue; see docs/architecture/DIAGRAM-STYLE.md." When the repository has neither file, create `AGENTS.md` with that line. Say in the report that you added it.

## When to redraw

Redraw in the same commit as the change when:

- a part is added, removed or renamed;
- a part starts calling a different outside service, model or API, or a model level, route or limit changes;
- a switch is turned on or off in the live release, or a planned part goes live, so its dashed border becomes solid;
- the owner agrees an item for the next phase, or one leaves it;
- a new release goes live, which changes the date in the subtitle;
- for a pipeline diagram, a stage is added or removed, a step changes who performs it, work moves between being prepared once and being done for each request, or a step starts or stops reading its inputs together.

After redrawing, update the facts block, run the checker and the test, render the PNG and look at it.
