# Product intent

Read this first when the route names the design path: a user-facing new
feature, an overhaul or a replacement. The intent record says what the product
must make true for the person using it. Design, task decomposition, every
builder assignment and the final review must follow it, and so must backend and
reliability decisions.

Contents:

- [Moments over time](#moments-over-time)
- [When a record is required](#when-a-record-is-required)
- [Where the record is kept](#where-the-record-is-kept)
- [Start from what already exists](#start-from-what-already-exists)
- [What the record holds](#what-the-record-holds)
- [Intent is not a feature inventory](#intent-is-not-a-feature-inventory)
- [Ask the design questions that follow from intent](#ask-the-design-questions-that-follow-from-intent)
- [When the owner rejects the hierarchy or interaction model](#when-the-owner-rejects-the-hierarchy-or-interaction-model)
- [Confirm assumptions before building what a customer sees](#confirm-assumptions-before-building-what-a-customer-sees)
- [No approval phrase for design work](#no-approval-phrase-for-design-work)

The order of work is fixed: record the intent, ask only the design questions
that change the outcome, produce the [design package](design-package.md), give
each builder a [brief](builder-brief.md), build, run the
[experience review](experience-review.md), then record the owner's acceptance.

## Moments over time

A screen is seen at one moment; the person lives with it for weeks. When the
feature keeps work people come back to, or has an AI agent that acts for them,
the record also says what happens when they:

- come back to unfinished work days later;
- start something that runs for minutes, then close the tab;
- hit a failure halfway through a change;
- say "this is not working" with no detail;
- point at their other work ("do it like my last one");
- state a habit once ("I always want an audio reflection");
- want an earlier version back.

Answer these with the owner by walking one customer's week through the design
([story walk](story-walk.md)) and save the walk table in this record or the
product brief, where Super-outer looks for it. An AI agent product also uses
the [agent library](archetypes/ai-agent-product.json). The walk comes before
the build plan.

## When a record is required

| Work | Intent record |
|---|---|
| User-facing new feature, overhaul or replacement | Required before any screen is designed |
| Backend-only work | Cite the existing record for the surface it serves, when one exists |
| Small visual correction or maintenance | None |

Record it in the task with `super-outer task design`, the command shown in
[design package](design-package.md), adding
`--intent <file> --intent-version <version>`. The command stores the record's
path, version and SHA-256 in the task's `product_intent` field, so never edit
the task file by hand. For backend-only work, run it with `--required no` and
the existing record. Nothing blocks a tool while the record is missing. A task
whose design package is required cannot close as `PROVED` without an
intent-conformance review, and that review needs this record.

## Where the record is kept

One file per surface at `.engineering/super-outer/intent/<surface>.md`, for
example `editor`, `onboarding` or `billing-settings`. The first lines name the
surface and carry a version line:

```text
# Product intent: <surface>
Version: 2 (7 October 2026)
```

Raise the version whenever a quality, a hierarchy consequence or an owner
decision changes, and run `super-outer task design` again with the new
version. Never change a version that a brief or package already cites. When
the owner changes a requirement mid-build, sort it as a detail or a scope
change first ([requirement changes](requirement-changes.md)): a detail gets a
dated change line and one line to the owner; a scope change reopens the
interview for the questions it opens and the plan, and waits for the owner's
ok before the affected parts are built.

## Start from what already exists

Before writing anything:

1. Read the journey contracts and decision tables the repository holds, and
   keep each decision's decider and date. List the decisions that touch the
   surface and mark each one keep or propose change. Only a propose-change
   decision may differ in the design, and each one goes to the owner as a
   question that names its decider.
2. Read the design system: components, tokens, content rules and motion.
3. Read the owner's recorded rules for this type of surface.
4. Render the current interface, when it exists, at the size the user sees it.
5. List every surface the owner named in the request and check that the record
   covers each one.
6. For a new product or a new main surface, give the
   benchmark researcher agent (`super-outer:benchmark-researcher`) one generic
   question: how do two or three of the best products built for the same
   recurring interaction handle it? For a writing extension, that means the
   best writing tools. Its privacy rules apply, so the question names the kind
   of product and never this product. Keep its findings with their sources for
   the design questions.

Write fresh only where nothing exists, and cite the source of everything you
carried over.

## What the record holds

- **The user:** who is working, and in what situation. Take who they are and
  which device they use from the [product brief](product-brief.md) when one
  exists.
- **The work they are completing:** the outcome they came for.
- **The main object:** the thing they work on, such as a manuscript, an invoice
  or a delivery route.
- **The recurring interaction:** what they do with that object again and again.
- **Qualities:** what must stay true throughout that interaction, written as
  statements a reviewer can check on the rendered screen.
- **What the person can do at each step:** when the product has a
  [journey map](journey-map.md), each `Launch` row's "what they can do here,
  and how they can tell" is a quality, checked on the rendered screen.
- **The person's own task:** when the feature's value depends on the person
  doing something, such as marking, rating or approving, the main screen says
  in plain words what to do and why. A figure built from that input says what
  it counts, for example "Of the 7 requests you marked, Claude used a skill you
  marked in 5". An idiom such as "your call" does not name the action.
- **Owner decisions:** each with its date and decider.
- **Rejected directions:** each with the reason it was rejected.
- **Open questions:** each with what it blocks.
- **Consequences for hierarchy:** which object receives the most visual
  attention, where actions appear, what stays compact, and where supporting
  material opens.

Keep owner decisions, designer recommendations and working assumptions in
separate, labelled lists. Never present an assumption as a decision. The
[example record](examples/design-package/intent.md) shows the format.

## Intent is not a feature inventory

A list of controls says nothing about which one matters while the user works.
The record describes the activity and what must hold during it. Every material
design decision and every builder assignment states how it supports the
recurring interaction. A combined experience that frustrates that interaction
fails review even when every control works.

## Ask the design questions that follow from intent

Follow [plain-English questions](plain-english-questions.md) and its audit.
Design questions count toward the route's question allowance. In addition:

- Ask first about the recurring interaction itself, in the words of the
  product's main job. For a writing extension, that is how writing in it should
  feel and flow; for a recording app, how recording should feel. Show what the
  best products found in step 6 do for it, and recommend one direction.
- Ask only questions whose answers change what the user sees or does.
- Ask in dependency order. Hold back a question until every answer it depends
  on is settled. Ask the questions that are ready together, a small number at
  a time, each with your recommended answer.
- Look facts up yourself in the repository, the current interface and the
  records. Only decisions go to the owner.
- Explain each trade-off in plain words and recommend a direction.
- Never ask the owner to choose implementation primitives such as a component
  library, a layout mechanism, an animation primitive or a state store.
- Do not ask again what a record already settles. Cite the record instead.

When a choice is hard to judge in words, show it. Render two or three
structurally different alternatives inside the real page, as described in
[mockup stacks](mockup-stacks.md), let the owner try them, and record which one
won and why as an owner decision.

## When the owner rejects the hierarchy or interaction model

Treat the rejection as a change to intent. Revisit the intent, the design
package and the journey together, raise the intent version, and mark every
brief built on the earlier version as stale. Never answer this feedback by
adding another button, panel or setting to the existing screen.

## Confirm assumptions before building what a customer sees

Before building a new feature or changing an existing screen, show the owner
one block of the assumptions you would otherwise build on. This applies
whether or not the work needs an intent record, so a filter added to an orders
page gets the block too. For example:

```text
I'm assuming:
- most people use this on a phone;
- the newest 20 orders show first;
- an empty list says "No orders yet";
- on a slow network, a placeholder shows while the list loads;
- after saving, you return to the list.

Reply 'ok' or correct any line.
```

- Go through the checklist below and write a line only where you chose
  something the customer will see. Leave out anything the product brief or an
  intent record already settles.
- Keep each line to one short fact. The block asks one thing, whether the
  lines are right, so it counts as one question against the task's allowance
  and satisfies the one-question floor.
- On a new feature or a screen change, wait for the reply before building. On
  `QUICK` work, show the block and continue unless the owner corrects a line.
- Never show the block on a small fix, such as a colour, a typo or a
  misaligned button, because extra caveats on small fixes made results worse
  in evaluation.
- Record each correction as an owner decision in the intent record, when one
  exists. The block is not an approval phrase.

The checklist:

- who uses it and on which device;
- what shows when the screen is empty, loading, slow or failed;
- where the user lands after success;
- confirm or undo for anything destructive;
- the default sort order, filters and page size;
- who sees which controls;
- language, currency, date format and time zone.

## No approval phrase for design work

Ordinary design work needs no approval phrase and no repeated confirmation.
Confirm the assumptions that change what the customer sees, as described
above, then proceed, and bring the owner rendered work to react to. The
owner's acceptance is recorded once, at the end,
from the owner's own words, as described in
[experience review](experience-review.md).

Credit: dependency-ordered questioning and in-page variants are adapted from
Matt Pocock's skills, github.com/mattpocock/skills (MIT licence).
