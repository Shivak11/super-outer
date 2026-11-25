# Design package

A design package is the near-production design of one surface: rendered
frames, state specifications and, where behaviour matters, a prototype.
Builders build from it and reviewers check the built product against it. Read
[product intent](product-intent.md) first, because every package serves one
recorded intent version.

Contents:

- [Decide whether one is required](#decide-whether-one-is-required)
- [Folder](#folder)
- [manifest.json](#manifestjson)
- [What the package must show](#what-the-package-must-show)
- [The first rendered slice](#the-first-rendered-slice)
- [Who makes it](#who-makes-it)
- [Render real frames](#render-real-frames)
- [Versions and staleness](#versions-and-staleness)
- [External references](#external-references)
- [While design questions are open](#while-design-questions-are-open)

## Decide whether one is required

Decide after reading the request and the repository. The route's word
classifier only prompts the decision; the agent makes it.

| Change | What to produce |
|---|---|
| Maintenance, such as a rename, copy fix or dependency update | Nothing new |
| Small visual correction | Before and after frames of the affected screen |
| Backend-only work | No package; cite the intent record when one exists |
| User-facing new feature, overhaul or replacement | The full package below |

Record the decision with the task command, never by editing the task file by
hand. The words in angle brackets are parameters:

```text
super-outer task design --id <task-id> --required yes --reason <one sentence> --package <folder> --package-version <version> --intent <file> --intent-version <version>
```

Run it with `--required` and `--reason` as soon as you decide, and again with
the package and intent once they exist. It hashes `<folder>/manifest.json` and
the intent file, stores both versions in the task record, and clears final
verification recorded against an earlier package. When the requirement is
`yes`, the task cannot close as `PROVED` until an intent-conformance review and
the owner's acceptance are recorded. No tool is blocked during the work; the
check runs at closure.

## Folder

A package lives at `.engineering/super-outer/design/<surface>/v<N>/`. It holds
`manifest.json`, the rendered `frames/`, `states.md` with the state and
interaction specification, and the standalone prototype when there is one. The
orchestrator keeps builder briefs in `briefs/` inside the same version folder.
A version that a brief cites is never edited; changes go into `v<N+1>`.

## manifest.json

| Field | Content |
|---|---|
| `schema_version` | `"1.0.0"` |
| `surface` | The surface name used in the folder path |
| `version` | The package version as a string that matches the folder: `"2"` for `v2` |
| `intent` | `{ path, version }` of the intent record it serves; `path` is repository-relative |
| `frames` | `{ file, state, width, height, theme, sha256 }` per PNG; `file` is relative to the package folder under `frames/`, `width` and `height` are the viewport in CSS pixels, and the optional `sha256` is the frame file's hash, so that a changed frame also changes the manifest's hash |
| `states_covered` | The state ids from `states.md` that the package specifies |
| `decisions` | `{ id, statement, provenance, date, decider }`; `provenance` is exactly `owner`, `designer` or `assumption` |
| `simulated` | `{ what, how }` for every data source or service the prototype fakes |
| `components` | `{ name, status, source }`; `status` is `existing` or `new` |
| `tokens` | `{ source, names }`: the token file and the token names used |
| `prototype` | `{ kind, location, branch }`; `kind` is `in-app` or `standalone`, and `branch` is null for a standalone file kept in the package |
| `supersedes` | The version this one replaces, or null |

```json
{
  "schema_version": "1.0.0",
  "surface": "editor",
  "version": "2",
  "intent": { "path": ".engineering/super-outer/intent/editor.md", "version": "3" },
  "frames": [{ "file": "frames/editor-1440x900.png", "state": "editing", "width": 1440, "height": 900, "theme": "light", "sha256": "<SHA-256 of the PNG>" }],
  "states_covered": ["editing", "passage-selected", "sources-loading", "sources-error"],
  "decisions": [{ "id": "d1", "statement": "Passage actions appear beside the selection.", "provenance": "owner", "date": "2026-10-07", "decider": "owner" }],
  "simulated": [{ "what": "Source search", "how": "Fixed excerpts returned after a timer" }],
  "components": [{ "name": "Popover", "status": "existing", "source": "src/components/Popover.tsx" }],
  "tokens": { "source": "src/styles/tokens.css", "names": ["--color-text", "--space-4"] },
  "prototype": { "kind": "in-app", "location": "/editor?variant=b", "branch": "prototype/editor-v2" },
  "supersedes": "1"
}
```

The [example package](examples/design-package/) is a complete small package
for a generic writing app. It bundles its intent record and one brief beside
the manifest so that it can be read in one place.

## What the package must show

- Realistic content, typography, spacing, colour, density and action
  hierarchy, built from the product's existing components and tokens.
- The principal screen at the host's real dimensions, including host chrome
  and any embedded panels.
- At least one frame for every surface the owner named in the request. Check
  this list before the package is shown to the owner.
- The connected states of the primary journey, in order.
- An interactive prototype wherever behaviour cannot be judged from frames.
- Loading, empty, error, recovery and long-running states, including what the
  user can do while work continues and what they find when they return.
- Selection, focus, keyboard paths and dismissal.
- Narrow layouts, every supported theme, and reduced motion.
- Component reuse, icons and assets, motion notes, and short implementation
  notes tied to specific frames.
- Every faked data source and service, listed in `simulated` and marked
  visibly in the prototype, so nobody believes a connector or a save works.

## The first rendered slice

Render the main working screen first, where the user performs the recurring
interaction. Never start with the smallest screen or one the owner already
approved, because a wrong hierarchy there costs the most to change later.

## Who makes it

The `design-prototyper` role produces the package. It writes only inside the
package folder and in prototype files the orchestrator names on a prototype
branch, and it never edits product source on the build branch. Files from a
human designer are accepted as the package when their provenance is recorded:
their decisions carry `designer` provenance with the designer as decider, and
the manifest names the source files.

## Render real frames

Frames are real renders of the prototype in a browser: `agent-browser` when
`command -v agent-browser` succeeds, otherwise the host's own browser tools.
With agent-browser, `set viewport`, `open`, `screenshot` and
`set media dark reduced-motion` cover most frames; check `agent-browser --help`
for the installed version. Check each frame's pixel size against the manifest.
A written description or one attractive screenshot is not a package when the
requirement depends on several interactions.

## Versions and staleness

Builders and reviewers cite the same package version and the SHA-256 of its
`manifest.json`. Write the manifest last, after the frames, and compute its
hash afterwards with `shasum -a 256`; the manifest never holds its own hash.
A new version supersedes the old one, makes every brief that cites the old
hash stale, and needs `super-outer task design` run again with the new folder
and version. If the manifest changes after the task recorded it, closure
reports: "The design package changed after this task recorded it, so builders
and reviewers may be working from different versions." When the owner rejects
the hierarchy or the interaction model, the intent changes first, as
[product intent](product-intent.md) describes.

## External references

Use an external product only to inform a specific hierarchy or interaction
decision, and record which decision it informed. It never overrides the
product's own character. A colourful reference is not a reason to give every
action equal prominence.

## While design questions are open

Engineering investigation may continue while design questions are open, since
data shape, services, performance and recovery work need no frames. An
unsettled interface decision is never handed to a builder as if it were
specified. Record it as an `assumption` decision or an open question, and keep
it out of briefs until it is settled.
