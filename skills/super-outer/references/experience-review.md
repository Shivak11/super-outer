# Experience review

The experience review checks the built product against the recorded
[product intent](product-intent.md) and [design package](design-package.md) by
using it. It is required verification for a user-facing new feature or
overhaul, and its verdict is evidence at closure. It is not a taste judge.

Contents:

- [When it runs](#when-it-runs)
- [Who runs it](#who-runs-it)
- [What it receives](#what-it-receives)
- [Browser ladder](#browser-ladder)
- [Procedure](#procedure)
- [Finished-product walk](#finished-product-walk)
- [Verdict](#verdict)
- [Record the result](#record-the-result)
- [One fix round, then the owner](#one-fix-round-then-the-owner)
- [Worked example: the checks pass and the review fails](#worked-example-the-checks-pass-and-the-review-fails)

## When it runs

Before closure of any task that records `design_package.required: true`, after
the orchestrator has verified the builders' work from disk.

## Who runs it

The `experience-reviewer` role runs it. Each instance is fresh and read-only,
never sees builder notes, builder reports or the orchestrator's opinion of the
build, and does not edit, install, commit or question the owner. Each instance
gets one assignment:

- `design`: assessment A, a design judgement of the screens against the intent
  and the frames.
- `mechanical`: assessment B, the mechanical evidence pass.
- `synthesis`: receives both recorded results and gives the verdict.
- `both`: one instance does A and B, records A before starting B, and starts
  its report with `Degraded: single-context review (<reason>)`.

The orchestrator normally runs one `design` instance and one `mechanical`
instance, then a separate `synthesis` instance, so that the synthesis never
happens in the orchestrator's own context. Assign `both` only when the host
cannot run separate agents.

## What it receives

- the assignment: `design`, `mechanical`, `synthesis` or `both`;
- the intent record's path and version;
- the design package's path, version and manifest SHA-256;
- the built app's route or address, or the command that starts it, and the
  revision under review;
- the target client and its real dimensions, for example a desktop browser at
  1440 by 900 or a phone at 390 by 844;
- each sentence of the plan or intent that describes a screen, quoted, so the
  reviewer checks it as a claim;
- when the work has a [journey map](journey-map.md), the path of the file that
  holds it, the name of the test environment the walk runs in and, for each
  person in it, a test account with no data and a test account that already
  holds data;
- for `synthesis`, the two recorded results.

The reviewer first checks that the intent version and the manifest hash match
what it was given, and checks each frame against its hash when the manifest
records one. A mismatch makes the result UNPROVED.

## Browser ladder

1. `agent-browser`, when `command -v agent-browser` succeeds.
2. Otherwise, the host's own browser tools.
3. Otherwise, screenshots captured by the orchestrator.

The report states which of the three ran. A screenshot-only review cannot pass
an interaction claim such as selection, focus, keyboard reach, dismissal,
loading or returning to unfinished work. Those claims stay UNPROVED. A review
in which nothing could be rendered starts with
`Source-only review: nothing was rendered`. It may return FAIL from what the
source shows, but never PASS.

## Procedure

1. A `design` or `mechanical` instance performs the primary journey itself, in
   the target client at real dimensions, starting from the entry point the
   user actually uses: it performs the recurring action on the main object,
   leaves, and returns. When the work has a [journey map](journey-map.md), the
   instance performs the [finished-product walk](#finished-product-walk) in
   place of the primary journey. Work with no journey map keeps the primary
   journey.
2. **Assessment A (`design`):** check each intent quality as a claim, marked
   PASS, FAIL or UNPROVED with its evidence: the step performed, the
   screenshot file and the observed value. Compare each screen with the
   package frame for the same state, theme and dimensions, and name each
   difference in hierarchy, spacing, component family and the placement of
   actions. List each sentence in the plan or the intent that describes a
   screen, such as "shows picks with scores" or "three columns", and mark each
   one PASS, FAIL or UNPROVED against the rendered screen. When the intent
   records the person's own task, check that the screen states it and that
   every figure built from it says what it counts. When the work has a journey
   map, mark each launch row as the
   [finished-product walk](#finished-product-walk) describes.
   When the screen shows content that is chosen by publication state, such as
   draft, in review or published items, review it with the content state of
   the release environment, or compare the public content with what the
   reviewed page showed. A required part of the design that depends on an
   unpublished item is an unresolved release dependency. Report it, and do not
   publish the item or change the agreed design to hide the gap.
3. **Assessment B (`mechanical`):** check overflowing or clipped content,
   contrast, focus order, keyboard reach, every decision point with more than
   four visible options, controls that compete with the main object for
   attention, and whether an unrelated product could use the screen unchanged.
4. Neither instance reads the other's findings until both results are
   recorded.
5. **Synthesis (`synthesis`):** say where A and B agree, what B found that A
   missed, and which of B's findings are false positives, without rewriting
   either result. Then give the verdict. A `both` instance does this itself
   after recording A and then B.

## Finished-product walk

The finished-product walk performs the launch rows of the
[journey map](journey-map.md) on the built product. A launch row is a row
whose "When" starts with `Launch`. The instance performs each launch row for
each person in the map, starting from the entry point that person really
uses.

Each launch row is walked in three states:

1. a new account;
2. an account that already holds data;
3. after the break that the row names under "where they could get stuck, or
   what could break", for example a lost network or a declined payment. When
   the row names no break, the third state is an interruption: the app is
   closed or the network is lost halfway through the action.

In each state the instance checks the row's "what they can do here, and how
they can tell" on the rendered screen: the action is available, and the screen
shows the sign the row describes.

Assessment A marks each launch row PASS, FAIL or UNPROVED with its evidence:
the step performed, the screenshot file and the observed value.

- A row passes only when it passed in all three states.
- A state that cannot exist for a row, such as an account with data on a row
  about a first visit, is marked not applicable with the reason and does not
  count against the row.
- A row nobody performed is listed as UNPROVED with the reason.
- A step that would send a real message, take a real payment, or create or
  delete records in a real outside service is not performed. That state is
  UNPROVED.
- A launch row is an interaction claim under the
  [browser ladder](#browser-ladder), so a screenshot-only review leaves it
  UNPROVED.

A row for the person misusing the product says what they try. Attempt it
only in the named test environment, against test accounts, and at a small
scale: a few requests, never thousands, and never a real person's data. That
row passes when the product stops the attempt as the row says, and fails when
the attempt works. When the block needs more attempts than a few requests can
reach, such as a spending cap or an hourly limit, the row is UNPROVED: name
the test that would prove it, and never raise the volume to reach the block.

The walk blocks nothing. It reports each row, and ordinary tools and other
work remain available.

A product with no screens, for example an agent reached through chat, is
walked by its builder through the product's real client, in a test
environment, under the same rule:
the three states, and PASS, FAIL or UNPROVED with evidence for each launch
row. Each row's result is recorded as a `journey` receipt with method
`direct-observation`; see the [completion contract](completion-contract.md).

## Verdict

The verdict is exactly one word:

- **PASS:** the journey was performed in a rendered client at the target
  dimensions, every intent claim passed with evidence, and no screen
  contradicts the package without a recorded decision that allows it.
- **FAIL:** an intent claim failed, or a screen contradicts the package in
  hierarchy or interaction without a recorded decision that allows it.
- **UNPROVED:** an input was missing, the identity check failed, or a claim
  could not be observed, and nothing failed.

When the work has a journey map, the launch rows count toward the verdict.
PASS also needs every launch row performed and passed in its three states. A
failed launch row makes the verdict FAIL. A launch row that could not be
performed, with nothing failed, leaves the verdict UNPROVED.

## Record the result

The verdict becomes the `intent-conformance` receipt in the task's completion
evidence, with method `direct-observation`; see the
[completion contract](completion-contract.md). Only a review that rendered and
operated the screens can supply a PASS receipt.

When the work has a journey map, each launch row's result is also recorded as
a `journey` receipt for that row's claim, with method `direct-observation`. A
row marked UNPROVED gets no receipt, and its claim stays unproved.

The owner's acceptance is a separate `owner-acceptance` receipt, taken from the
owner's own words after they have seen or used the built screens. Record what
they said, when they said it, and which build and package version they saw.
Never infer acceptance from silence, from approval of a plan, or from a passing
review. The context file behind both receipts names the pinned manifest SHA-256
in `artifact_ref`; a review or acceptance of an earlier package version does
not close a task pinned to a newer one.

## One fix round, then the owner

The owner's taste is never put into a loop. After a FAIL there is at most one
fix round and one fresh review. The result then goes to the owner with any
remaining findings, whatever the verdict.

## Worked example: the checks pass and the review fails

Quality 1 of a writing app's intent says the manuscript receives the most
visual attention in every state. Quality 2 says passage actions appear beside
the selection. The build passes its unit tests and every button works. The
synthesis reports:

```text
Assignment: synthesis of one design result and one mechanical result
Browser: agent-browser, desktop at 1280 by 800
Verdict: FAIL

Quality 1, the manuscript receives the most attention: FAIL
  The header shows five filled buttons of equal size and colour: Rewrite,
  Sources, Comment, Export and Share (review-01.png). The manuscript is a
  stack of bordered form fields labelled "Title", "Section 1" and "Section 2",
  under a status panel with word count and generation status. The fields and
  the panel draw the eye before the text does. The package frame
  editor-1280x800 shows one primary action, an overflow menu and continuous
  text.
Quality 2, passage actions beside the selection: FAIL
  Selecting a passage shows nothing beside it. The writer has to move to the
  header buttons to act on it (review-02.png).
Mechanical result (B): the header is a decision point with five visible
  options, over the limit of four, and three of them compete with the
  manuscript. Keyboard focus passes five header buttons before it reaches the
  text. A customer record form could use the editing screen unchanged.
Agreement: A and B both found that the header competes with the manuscript.
Fix round: rebuild the header and the editing surface from the package
  frames. Do not add controls.
```

Credit: the isolated dual assessment and the four-option decision-point check
are adapted from github.com/pbakaus/impeccable (Apache-2.0 licence).
