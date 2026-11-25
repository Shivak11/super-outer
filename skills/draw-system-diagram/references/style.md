# The house style

## Contents
- Canvas and layout
- Colours by kind of part
- Shapes and text
- Arrows
- Legend, title and subtitle
- The one-problem diagram
- SVG snippets

These rules cover every kind. The architecture layout, legend and one-problem sections apply to those kinds; a pipeline diagram follows `pipeline.md` for its layout and has no legend.

When the repository has its own design tokens or brand colours, map each kind of part below to one of those colours and keep every other rule. Write the mapping into the repository's diagram note (see `keeping-it-true.md`).

## Canvas and layout

- Hand-written SVG, `viewBox="0 0 1440 H"`, with `width` and `height` equal to the view box. Keep the width at 1440 so every diagram in the repository shows at the same scale; make it taller when more rows are needed.
- The first element after `<defs>` is `<rect width="1440" height="H" fill="#FFFFFF"/>`. A white canvas reads the same in GitHub's light and dark themes.
- Set `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"` once on the `<svg>`. Add `role="img"`, a `<title>` and a `<desc>` of one or two sentences that say what the picture shows.
- Set `data-diagram="pipeline"` or `data-diagram="one-problem"` on the `<svg>` for those kinds. An SVG without it is an architecture diagram.
- Write each arrow after every box it crosses, so no box fill is painted over it.
- Top left: the title, and one subtitle line. Top right: the legend.
- Leave out a group the repository has nothing for, such as release and checks in a repository with no deploy or test setup.
- Architecture main row, left to right: the people and the clients they use, then the system itself, then the outside services it calls. Second row: storage, release and checks, and the next phase. Bottom: one real request traced from start to finish.
- Leave at least 40 units between groups. Arrow labels sit in those gaps and never cross a border.

## Colours by kind of part

Each kind of part has one colour, used for its group border, its title and the arrows it sends.

| Kind of part | Border and arrows | Fill | Titles |
|---|---|---|---|
| People and the clients they use | `#1971C2` | `#E7F5FF` | `#1864AB` |
| The people's own data held elsewhere | `#C2255C` | `#FFF0F6` | `#A61E4D` |
| The system being drawn (its servers, workers, functions) | `#E8590C` | `#FFF4E6` | `#D9480F` |
| AI models and other outside services it calls | `#0B8A5F` | `#EBFBEE` | `#087F5B` |
| Storage (databases, files, queues) | `#6741D9` | `#F3F0FF` | `#5F3DC4` |
| Release and checks | `#0C8599` | `#E3FAFC` | `#0B7285` |
| Next phase (always dashed) | `#868E96` | `#F8F9FA` | `#495057` |
| One-request example and the bottom strip | `#4263EB` | `#EDF2FF` | `#364FC7` |

When one group shows levels that rise in cost or care, such as model tiers, use four greens from light to dark: `#D3F9D8`, `#B2F2BB`, `#8CE99A`, `#69DB7C`. Body text is `#344054`, strong text is `#1F2937` and the title is `#13294B`.

AI models and other outside services share green. When two of them need telling apart, say which is which in each box's title line ("Anthropic model", "Help-centre API"); do not borrow another kind's colour, because one colour never stands for two kinds of part in one picture.

## Shapes and text

- Group: `rx="16"`, border width 2.5, group title at 25 and weight 800.
- Box inside a group: white fill, `rx="10"`, border width 2, title at 21 and weight 700, then at most three lines of body text at 16.
- SVG text does not wrap. Break each line by hand: about 28 characters fit a 270-wide box at 16, and about 22 fit a 270-wide title at 21. `scripts/check-diagram.mjs` measures every line against its box.
- No text below 14.
- Stores are cylinders. A part that is planned, or built and switched off, has `stroke-dasharray="8 6"` on its border.
- A person's request can sit in a speech bubble inside the people group, quoted exactly as they would type it.
- Words: plain statements of what each part does, in the names the project itself uses. One name per part, the same on every diagram. No emoji, no outside fonts, images or scripts.

## Arrows

- Width 3, in the colour of the part that acts, with an arrowhead marker of that colour.
- Straight horizontal and vertical segments only: `M x y H x V y`.
- Every arrow has a label at 14, weight 700, in the arrow's colour, that says what moves or what is done, such as "asks", "replies", "reads", "writes" or "deploys".
- A two-way exchange is two arrows, each with its own label. The one exception is a part that reads and writes one store: one short arrow with a head at each end, labelled "reads and writes".

## Legend, title and subtitle

- Title at 42, weight 800, `#13294B`: the system's own name.
- Subtitle at 20, `#344054`: what the picture shows and the release or date it shows, for example "Live release 4f2c9e1, 3 March 2026".
- Legend in a box with fill `#F8FAFC` and border `#CBD5E1`, one swatch per line, text at 17: "Live" with a solid swatch, and "Built and switched off, or planned" with a dashed swatch. A one-problem diagram adds "Tried and dropped".

## The one-problem diagram

A one-problem diagram explains one change that took several attempts. It uses the same canvas, colours and legend, and adds two things.

- **Tried and dropped.** An approach that was built or planned and then replaced is a box with a solid `#ADB5BD` border and `#F1F3F5` fill, inside a group with a solid `#868E96` border and `#F8F9FA` fill. It is never dashed, because dashed means it may still happen. Each box says in one line what it was and why it went.
- **Measured and still open.** The bottom strip, in the example colours, has two rows. "Measured" gives the numbers with their date and conditions. "Still open" names what is not yet solved. A number with no measurement behind it does not go in either row.

Its people group can show what the person saw before the change ("Every reply took about 16 s").

## SVG snippets

Arrowhead marker, one per colour, inside `<defs>`:

```xml
<marker id="a-orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#E8590C"/></marker>
```

Labelled arrow:

```xml
<path d="M960 300H1040V240H1080" fill="none" stroke="#E8590C" stroke-width="3" marker-end="url(#a-orange)"/>
<text x="972" y="290" font-size="14" font-weight="700" fill="#E8590C">asks</text>
```

Cylinder for a store, 110 wide:

```xml
<path d="M330 790c0-12 22-20 50-20s50 8 50 20v64c0 12-22 20-50 20s-50-8-50-20z" fill="#FFFFFF" stroke="#6741D9" stroke-width="2.5"/>
<path d="M330 790c0 12 22 20 50 20s50-8 50-20" fill="none" stroke="#6741D9" stroke-width="2.5"/>
<text x="380" y="846" font-size="20" font-weight="800" fill="#5F3DC4" text-anchor="middle">DB</text>
```

Planned part:

```xml
<rect x="1060" y="600" width="350" height="70" rx="10" fill="#FFFFFF" stroke="#0B8A5F" stroke-width="2" stroke-dasharray="8 6"/>
```

`assets/template-system.svg` puts all of this together and passes the checker.
