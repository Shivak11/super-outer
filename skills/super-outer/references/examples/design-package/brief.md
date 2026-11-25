# Builder brief: manuscript editor screen

Intent: `skills/super-outer/references/examples/design-package/intent.md`,
version 1

Package: `skills/super-outer/references/examples/design-package/`, version 1,
manifest SHA-256
`6b4583d523d04166f78d669a677d9c19629f8b62e7fcd81889cd8eacf3f549b2`

## Open first

Open `frames/editor-1280x800.png`, `frames/passage-sources-1280x800.png` and
`frames/passage-selected-390x844.png`. Then open `prototype.html` in a browser
and perform the journey: select a passage, ask for a change, replace the
passage and undo it, open sources, insert a quote and undo it, and close the
panel with Escape. Repeat the selection at 390 by 844.

## How this unit supports the recurring interaction

This unit builds the screen where the writer works on the manuscript and acts
on a selected passage without leaving it. Each part either keeps the
manuscript the most prominent element or brings work on a passage to the
passage itself.

## States

Build every state in `states.md`: editor, passage-selected, sources-loading,
sources-open, sources-empty, sources-error, suggestion, returned, narrow,
dark-theme and reduced-motion.

## Components and tokens

- Reuse the product's `Button`, `IconButton`, `Menu` and `TextField` from
  `src/components/`.
- Build these new components as drawn in the frames: the passage toolbar, the
  passage panel and the paragraph handle. Create no other new component.
- Use only the tokens listed in the manifest. Add no new colours, sizes or
  shadows.

## Your files

`src/editor/EditorScreen.tsx`, `src/editor/PassageToolbar.tsx`,
`src/editor/PassagePanel.tsx`, `src/editor/ParagraphHandle.tsx`,
`src/editor/editor.css` and `tests/editor/editor-screen.test.tsx`.

Do not touch `src/components/`, `src/styles/tokens.css`, `src/api/` or any
file not listed above. Another builder owns the search and suggestion
services; call them through the interfaces that already exist in `src/api/`.

## Done when

1. At 1280 by 800 with nothing selected, the header holds one filled button,
   Share, and one icon button, More, and the manuscript column is between 600
   and 680 pixels wide.
2. Selecting a passage with the pointer, or with Shift and the arrow keys,
   shows the passage toolbar beside the first line of the selection, in the
   right margin.
3. With a passage selected, Tab from the manuscript moves focus to the request
   field.
4. Sources opens the panel beside the text. The manuscript column stays fully
   visible and the passage stays marked.
5. While sources load, the results area shows skeleton lines and the
   manuscript still accepts typing.
6. Replace passage and Insert quote change the manuscript only after the
   click, and Undo restores the previous text.
7. Escape closes the open menu first, then the panel, then the passage
   toolbar, and returns focus to the manuscript.
8. After the writer leaves and returns, a finished suggestion is marked beside
   its passage and opens in the panel.
9. At 390 by 844 the toolbar docks to the bottom edge, the sources sheet
   leaves the passage visible above it, and nothing scrolls sideways.
10. With reduced motion nothing animates, and in the dark theme body text has
    a contrast of at least 4.5 to 1.

## Verify with

```text
npm test -- tests/editor
npm run build
agent-browser set viewport 1280 800
agent-browser open http://localhost:5173/editor/demo
agent-browser snapshot -i
agent-browser screenshot review/editor-1280x800.png
agent-browser set viewport 390 844
agent-browser screenshot review/passage-selected-390x844.png
```

## Report

List the changed files, the result of each command, the screenshots, and a
deviation list. Each deviation names the state or frame, what differs, the
reason and who settled it; write "No deviations" when there are none. Check
the manifest hash when you start and again before you report, and stop if it
differs from the one above.
