# Builder brief

A UI builder works from a brief that points at exact files, never from a
summary of the design. Two builders working in parallel from the same package
must produce one interface. The brief cites a
[design package](design-package.md) and the
[product intent](product-intent.md) it serves.

## What every UI brief contains

1. The intent record's path and version.
2. The design package's path, version and manifest SHA-256.
3. The exact frames to open, by file name, and where the prototype runs.
4. How this unit supports the recurring interaction named in the intent.
5. The interaction and state specifications that apply, by state id.
6. Shared component and token constraints: what to reuse, what is new, and
   which tokens to use.
7. The builder's exclusive file list, and the files it must not touch.
8. Observable acceptance criteria, each one checkable by another person on the
   rendered screen.
9. The verification commands to run, and what the report must contain.

```text
Intent: <path>, version <n>
Package: <path>, version <n>, manifest SHA-256 <hex>
Open first: frames/<file>.png, frames/<file>.png; prototype at <location>
Supports the recurring interaction by: <one sentence>
States: <ids from states.md>
Reuse: <components>; new: <components>; tokens: <names>
Your files: <exhaustive list>. Do not touch: <list>
Done when: <observable criteria>
Verify with: <commands>
Report: changed files, command results, deviation list
```

The [example brief](examples/design-package/brief.md) shows a filled one.

## Before writing code

Open the frames and the prototype, and perform the journey in the prototype
yourself. If a technical constraint conflicts materially with an interaction,
report the conflict to the orchestrator before changing the interaction. The
conflict is resolved at the product and design level, and the package gets a
new version before the changed interaction counts as settled. When a quality
in the intent changes, the intent version rises too. Change the written design
first and the code second.

## Keep the design you were given

A common failure is a build that passes its checks and looks like a default
template. While building:

- Do not simplify the screen into a default template.
- Do not replace a distinctive layout with generic rows or cards.
- Keep the hierarchy, spacing and component family shown in the frames.
- Do not invent controls. A control missing from the package is a question for
  the orchestrator, and parallel builders never add controls of their own.

## When a detail is unclear

Resolve it in this order:

1. keep the visible design language;
2. keep the layout and spacing;
3. keep the component family;
4. ask the orchestrator;
5. only then choose the most implementation-friendly version that stays
   faithful to the frames.

Do not fill a gap with a generic default before working through the first four
steps.

## Report deviations

Every difference from the package goes into a deviation list in the builder's
report. Each entry names the state id or frame, what differs, the reason, and
who settled it. When there are no deviations, the report says so.

## Stale briefs

Check the manifest hash when you start and again before you report. When the
package version or manifest hash differs from the one in the brief, stop work
on the affected screens and wait to be re-briefed. Report work already done
against the old version instead of adapting it silently.

Credit: the rules for keeping the given design and resolving unclear details
are adapted from github.com/leonxlnx/taste-skill (MIT licence), and the rule to
change the written design before the code from github.com/addyosmani/agent-skills
(MIT licence).
