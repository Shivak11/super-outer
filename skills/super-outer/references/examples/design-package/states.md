# States: manuscript editor, package version 1

Each state says what the writer sees, what they can do, and where it is shown:
a frame, the prototype, or this specification only. A state shown in the
prototype opens directly at `prototype.html?state=<id>`; add `&controls=0` to
hide the prototype controls. The last three entries describe conditions that
apply to every state.

## editor

Shown in `frames/editor-1280x800.png` and at `?state=editor`. The header shows
the document name, the save status, Share and the More menu. The manuscript is
one column, at most 660 pixels wide, of 19 pixel serif text. A paragraph handle
appears in the left margin beside the paragraph under the pointer or the caret,
and opens Move up and Move down. The tab order is Share, More, the manuscript,
then the paragraph handle.

## passage-selected

Shown in `frames/passage-selected-390x844.png` and at
`?state=passage-selected`. Selecting text with the pointer, or with Shift and
the arrow keys, shows the passage toolbar beside the first line of the
selection in the right margin. When the margin is too narrow, the toolbar
appears above the selection. On narrow screens it docks to the bottom edge. The toolbar
holds a request field with Ask, and Sources. Tab from the manuscript moves to
the request field. Escape hides the toolbar and leaves the caret at the end of
the passage.

## sources-loading

Shown at `?state=sources-loading`, which holds the loading state. Sources opens
the panel beside the text, the manuscript moves left, and the passage stays
marked. Skeleton lines fill the results area until the excerpts arrive. The
writer can keep typing in the manuscript while the results load.

## sources-open

Shown in `frames/passage-sources-1280x800.png` and at `?state=sources-open`.
The panel shows the passage, a request field, the chosen sources as toggles,
and the matching excerpts, each with Insert quote. Insert quote adds the
excerpt below the passage's paragraph and offers Undo. Selecting another
passage while the panel is open moves the panel to that passage. The close
button or Escape closes the panel, returns focus to the manuscript and selects
the passage again.

## sources-empty

Shown at `?state=sources-empty`. With no source chosen, the results area says
"Choose at least one source to search."

## sources-error

Shown at `?state=sources-error`. The results area says "Your sources could not
be searched. Nothing in the manuscript has changed." and offers Try again.

## suggestion

Shown at `?state=suggestion`. After Ask, the panel repeats the request, shows
skeleton lines, then shows the proposed text with Replace passage and Keep
original. Replace passage changes the manuscript and offers Undo. When no
change is found, the panel says so and asks for a different request.

## returned

Shown at `?state=returned`. When the writer comes back, the passage is still
marked and a "Suggestion ready" marker appears beside it. Choosing the marker
opens the panel with the finished suggestion. In the product, generation
continues on the server while the writer is away.

## narrow

Applies at widths up to 760 pixels and is shown in
`frames/passage-selected-390x844.png`. The paragraph handle is hidden, which is
an open question in the intent. The sources panel opens as a sheet over the
lower 62 per cent of the screen, and the page scrolls so that the passage is
visible above the sheet. Nothing scrolls sideways.

## dark-theme

Prototype only, through the system colour scheme. Every colour token has a dark
value. Version 1 has no dark frame.

## reduced-motion

Prototype only, through the system reduced-motion setting. The manuscript moves
without a transition and the skeleton lines do not shimmer.

## Implementation notes

- `editor-1280x800.png`: the header is 56 pixels high and stays at the top
  while the page scrolls. Share is the only filled button on the screen.
- `passage-sources-1280x800.png`: the panel is 400 pixels wide and fixed 16
  pixels below the header. The manuscript's left margin is recalculated so that
  the column, a 48 pixel gap and the panel are centred together. The passage
  mark uses the CSS Custom Highlight API, so the manuscript's text is never
  wrapped in extra elements.
- `passage-selected-390x844.png`: below 761 pixels the toolbar is fixed to the
  bottom edge, and the sources sheet is at most 62 per cent of the screen high.

## How the frames were made

All three frames were rendered with agent-browser on 7 October 2026 at a
device pixel ratio of 1, with the light colour scheme and `?controls=0`.

- `editor-1280x800.png`: viewport 1280 by 800; a click in the second paragraph
  placed the caret.
- `passage-sources-1280x800.png`: viewport 1280 by 800; a script selected
  "Boats that once left at any state of the tide now wait for the water to
  rise" through the page's selection, the toolbar appeared, a click on Sources
  opened the panel, and the frame was taken after the excerpts replaced the
  skeleton.
- `passage-selected-390x844.png`: viewport 390 by 844; the same selection,
  with the toolbar docked to the bottom edge.
