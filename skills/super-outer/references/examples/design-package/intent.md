# Product intent: manuscript editor

Version: 1 (7 October 2026)

## Where this record started

The owner's request of 7 October 2026 named three surfaces: the editor, the
actions on a selected passage, and the sources shown beside it. All three are
covered below. The repository held no journey contract, decision table or
design system for this surface, so the record is written fresh and the
prototype uses a neutral token set.

## The user

A writer working on a long manuscript, such as a report, an article or a book
chapter, who collects notes, interviews and records as sources while writing.

## The work they are completing

Turning a draft into a finished manuscript whose claims are supported by their
own sources.

## The main object

The manuscript.

## The recurring interaction

The writer works directly on the manuscript. Selecting a passage lets them say
what they want done with it, inspect relevant material from the sources they
choose beside the passage, and decide how the passage changes. Research and
generation continue when the writer leaves, and their results are shown beside
the passage when the writer returns.

## Qualities that must stay true

1. The manuscript receives the most visual attention in every state, including
   while the sources panel is open.
2. Passage actions appear beside the selection. The writer never has to move to
   the header to act on a passage.
3. Evidence opens beside the passage it relates to, and the passage stays
   visible and marked while the evidence is open.
4. Nothing changes the manuscript until the writer chooses, and every change
   made from a suggestion or a source can be undone.
5. Research and generation keep running when the writer leaves, and their
   results are shown beside the passage when the writer returns.
6. Every action above can be completed from the keyboard.

## Consequences for hierarchy

- **Most attention:** the manuscript text, in one column of serif text at
  reading size, with no boxes or field labels around it.
- **Where actions appear:** passage actions in a small toolbar beside the
  selection, one document-level primary action in the header, and everything
  else in one overflow menu.
- **What stays compact:** the header, which is one line; the paragraph
  controls, which are one handle in the left margin for the paragraph under the
  pointer or the caret; and the save status, which is one word.
- **Where supporting material opens:** in a panel beside the text on desktop,
  with the manuscript moving left to make room, and in a sheet below the
  passage on narrow screens.

## Owner decisions

| Date | Decision | Decider |
|---|---|---|
| 2026-10-07 | The manuscript receives the most visual attention in every state. | owner |
| 2026-10-07 | Passage actions appear beside the selection, never in the header. | owner |
| 2026-10-07 | Nothing changes the manuscript until the writer chooses, and every change can be undone. | owner |
| 2026-10-07 | Research and generation continue while the writer is away, and their results are shown beside the passage on return. | owner |

## Designer recommendations

- The header holds one primary action and one overflow menu.
- On desktop, opening sources moves the manuscript left so that the panel never
  covers the text.
- On narrow screens, passage actions dock to the bottom edge and sources open
  in a sheet below the passage, because a toolbar floating beside the selection
  would cover the phone's own selection controls.

## Working assumptions

- Share is the most frequent document-level action, so it is the header's
  primary action. The owner has not confirmed this.
- Field notes and interviews are searched by default, and the writer turns on
  board records when needed. The owner has not confirmed this.

## Rejected directions

- **Five equally prominent header buttons** (Rewrite, Sources, Comment, Export
  and Share). They compete with the manuscript for attention and move passage
  actions away from the passage.
- **A slide or editing surface built from large status panels and labelled
  form fields.** It turns writing into data entry and gives the panels more
  attention than the text.

## Open questions

- How should a writer move paragraphs on a phone? Version 1 hides the paragraph
  handle on narrow screens. This blocks only paragraph moves on phones.
- Should a finished suggestion notify the writer while they work elsewhere in
  the manuscript? This blocks only the notification work.
