# Requirement changes mid-build

Read this when the owner changes something already decided for work under
way: a feature, a screen, who it is for, where it runs. Sort the change first,
because a detail and a change of scope need different handling.

In one recorded build, the scope changed several times in passing, for
example "a separate branch, also deployed to the host" and "teachers would
also use the same route". Each was treated as a detail, so the plan and its
roadmap moved without anyone saying so.

## Sort the change

| Kind | What it changes | Examples |
|---|---|---|
| Detail | Look, wording, layout, or order inside something already decided | "make the yellow brighter", "move the strip to the right", "fewer boxes" |
| Scope | Who the product serves, what it can do, the kind of system, where it runs or is deployed, where data lives or who can see it, an outside integration, or the roadmap and its order | "faculty use the same route", "deploy it separately", "students can also download the report", "drop the AI check for now" |

When unsure, treat the change as scope and say so. Asking once costs one
reply; a missed scope change can cost rework of built parts.

## A detail

1. Update the record that holds the decision (the intent record or the
   product brief) with a dated change line.
2. Tell the owner in one line what changed and what it affects, such as
   "Recorded: the step strip moves to the right of the canvas; it affects the
   editor layout only."
3. Carry on.

## A scope change

1. **Say so plainly, first.** "This changes the product's scope: faculty use
   the same route as students. It affects sign-in, the activity list, and
   steps 3 and 4 of the plan."
2. **Re-open the interview for only the questions the change opens.** Take
   them from the [product brief](product-brief.md) interview and the
   [product intent](product-intent.md) record, in the customer's terms, each
   with a recommended answer, at most five in a round. Skip any question the
   records or the code already answer. The owner may skip any question; a
   skipped question takes the recommended answer and is marked `assumed`.
3. **Change the journey map, then re-walk the moments the change touches.**
   In the [journey map](journey-map.md), a new audience gets its own table, a
   new device or place changes the phases it touches, and a new capability
   adds or changes rows. Ask about the changed phases only. For the reading
   library of 27 October 2026, "including phones" changes First use and Comes
   back, and the First use row names the formats the person brings in, such
   as EPUB. Then add or change rows in the walk table
   ([story walk](story-walk.md)): for a new audience, walk one of them; for a
   new place it runs, walk the moments that place changes.
4. **Estimate the blast radius across the whole stack, from the code.** Find
   what actually depends on the parts the change touches: use CodeGraph where
   the repository is indexed (`codegraph explore "<symbols>"` shows callers and
   dependents), otherwise search the code. Never estimate from memory of the
   plan. Fill one row per layer, and write "not affected" where nothing
   changes, so the owner sees every layer was checked:

   | Layer | Affected? | What changes | Built parts needing rework | New stack needed |
   |---|---|---|---|---|
   | Interface (screens, navigation, copy) | | | | |
   | Client state and offline behaviour | | | | |
   | Server and API (routes, functions, actions) | | | | |
   | Data model and migrations | | | | |
   | Access (sign-in, roles, row-level rules) | | | | |
   | AI and agent (prompts, tools, memory, models) | | | | |
   | Background jobs and workflows | | | | |
   | Outside integrations and webhooks | | | | |
   | Deployment, environments and settings | | | | |
   | Observability (logs, traces, alerts) | | | | |
   | Tests and evals | | | | |
   | Cost and quotas | | | | |

   For any new stack a layer needs (a service, package, provider, account,
   environment setting or quota), recommend one choice with a runner-up, as
   the [story walk](story-walk.md#the-stack-recommendation) does, and say
   what it costs at the brief's scale.
   Then list the technical decisions already made that the change touches,
   and decide each again. On 27 October 2026 a reading library's requirements
   grew from search to large PDFs, EPUBs, full reading on phones and synced
   highlights, but its parser choice was never revisited: research covered
   where the parser would run, never which parser to use, and the owner had
   to name LlamaParse and Docling himself. For each affected decision,
   compare the current choice with at least two credible alternatives on a
   few of the owner's real inputs (for a parser, representative books), and
   recommend one with a runner-up. Research done for another decision, such
   as hosting, does not count for this one.
5. **Revise the plan in two parts.**
   - Functional: what the product does differently, for whom.
   - Technical: the layers the blast radius marked, in build order, with the
     new stack each needs.
   List the parts already built that now need rework, and any deferral in the
   ledger the change brings due.
6. **Update the records** (brief, intent record, journey map, walk table) with a dated
   "Scope change" entry naming the decision, who made it, and the blast
   radius table.
7. **Show the owner the revised plan and wait for "ok" before building the
   affected parts.** Work the change does not touch continues. Nothing is
   blocked by a tool; the wait is Claude's.

## When scope is cut

A smaller scope changes which acceptance targets can be met. When a plan
drops or reduces something, check every surviving `Done when` line and
threshold against the new scope before a builder starts. Count the categories
a target needs against the categories that remain: six policies cannot each
have a different pattern when five patterns exist. Run each threshold against
the data already on disk. Rewrite or remove a target the smaller scope cannot
meet, and tell the owner which ones changed.

## What the owner sees

One short block, then the questions:

> This changes the product's scope: faculty use the same route as students.
> It affects sign-in, the activity list, and plan steps 3 and 4. Built so far
> and now needing rework: the student-only route guard. Across the stack:
> access (a faculty role in the row-level rules) and the data model (an owner
> column on activities) change; no new service is needed.
>
> 1. Should faculty see their own activities only, or every activity in their
>    course? Recommended: their own and those shared with them.
> 2. ...
>
> Reply with answers or "ok" to take the recommended ones. Steps 1, 2 and 5
> continue meanwhile.
