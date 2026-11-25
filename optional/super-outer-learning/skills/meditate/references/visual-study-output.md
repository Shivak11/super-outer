# Create a concise visual study

Read this reference on every meditation before composing the output. A standalone private HTML study is the default. Honour an explicit text-only or no-file request. Follow the host skill's privacy rule.

## Compose the content first

Use [reflection-format.md](reflection-format.md). The study opens with the headline, a one or two sentence summary and “How the thing works” on the same first page. Every later section refers to the diagram on that page by the names of its boxes and arrows. Then come “What you decided and what it changed”, “Where one change would have the largest effect”, the topics and the vocabulary page.

Each topic has a plain heading, an immediately emphasised one-sentence principle, a brief factual account of how it emerged, one concrete application and a sentence naming the part of the diagram it explains. Do not place a subtitle, badge, diagram or introductory paragraph between a topic heading and its principle. Keep topics distinct when the session contained distinct discussions. Do not invent a unifying theme, a fixed topic count or a discovery story.

Keep each section and each topic within at most one readable A4 page. Plan the first page with the headline, summary, diagram and part sentences together. Shorter is acceptable. Remove repetition and choose a more economical explanation before reducing type. Do not subdivide one idea merely to meet the limit, clip overflow, hide essential explanations or put them behind a control to make the page appear shorter. The closed answers under “Where one change would have the largest effect” are the one exception: they are closed so that the reader predicts first, they are printed in full, and they count toward that page's length. Phone layouts should scroll naturally.

After the topics, compose the final vocabulary reference using [prompt-vocabulary.md](prompt-vocabulary.md). Keep it within one additional readable A4 page across the whole study, with natural scrolling on phones. Omit it when that reference says to; do not allocate empty space or invent a concept for it.

A comparison, worked example or small interaction can demonstrate a topic's principle. A topic may also show a small copy of the main diagram with its part highlighted. Use the person's actual work when relevant and authorised; clearly label an invented illustration. A useful interaction changes an input and shows the consequential difference. Do not require a quiz, slider, animation, counterexample panel or next-experiment section. Include a limit or small proposed test briefly only when it materially helps explain or apply the principle. Never claim that an interaction proves learning.

## Draw the diagram

- Build the diagram as inline SVG in the HTML. Take every box and arrow from the private `source/map-evidence.md`; the diagram contains nothing that list does not support.
- Keep labels readable at phone width. An SVG scales with its viewBox, so a wide drawing shrinks its labels on a phone: a drawing 900 units wide shown 358px wide turns 18-unit labels into about 7px text. Use a top-to-bottom layout whose viewBox is no wider than a phone's content area (about 340 units) with labels of at least 18 units, and cap its displayed width on wider screens; or draw separate wide and narrow versions and switch between them with a media query. Measure the rendered label size at 390px. Essential labels must be at least 18px on screen and 12pt in print.
- Use about four to eight boxes. When the work has more parts, group files that do one job into a single box named for that job instead of shrinking text.
- Name each box in plain words with its technical name once in brackets. Break long names onto two or more lines with `<tspan>` elements so that no label is clipped or overlaps a line. Label each arrow with what passes along it.
- Say the kind of each flow in its label words, such as “when you press Continue” for a trigger or “saves progress” for stored state. If boxes or lines also differ in shape or style, explain the difference in a short key. Never rely on colour alone.
- Show which parts the session built or changed and which already existed, with a plain word in the box or the key.
- Put each decision on the diagram as a numbered circle beside the part it changed. The numbers match the list under “What you decided and what it changed”.
- Support light and dark themes. Set fills, strokes and text colours in the SVG through CSS custom properties or `currentColor`. Define the properties on `:root`, redefine them under `@media (prefers-color-scheme: dark)`, and use the light values in print. Do not hard-code colours inside the SVG.
- Give the SVG `role="img"` and a `<title>` naming the thing. Keep the part sentences below it as visible text, so the content does not depend on reading the drawing.
- When a topic or the vocabulary page repeats a small copy of the diagram, keep its labels at the same readable size and highlight the part with an outline or heavier line as well as colour.

## Write the prediction questions

- Before the first question, one sentence asks the reader to decide on an answer before opening it.
- Put each answer in a `<details>` element whose `<summary>` reads “Show what would happen”. A `<details>` element opens without JavaScript.
- A closed `<details>` element prints nothing. Add a print-only copy of each answer directly below its question, hidden on screen with `display: none` and shown under `@media print`, and hide the `<details>` element in print. Measure that page's fit with the answers showing.
- Make each answer specific: what would happen, which boxes or arrows it would reach and why, and whether the session showed it.

## Choose a topic-appropriate visual system

The user delegates routine design selection. Follow current project guidance and explicit preferences without asking for an aesthetic interview. A meditation is its own artifact; do not redesign the parent project or overwrite its global design files. Preserve the chosen design during revisions unless the user requests a redesign.

For a new study, inspect up to three recent `design-record.json` files in the known, authorised meditation output area. Do not scan unrelated projects or sessions. Choose a meaningfully different composition, typography and diagram treatment suited to the new subject. Do not treat a colour swap as a new design, or require the same palette, fonts or example every time. Keep the study order across designs. If recent history is unavailable, choose from the topic and record that limitation privately without claiming permanent uniqueness.

Keep a brief `source/design-record.json` with the topic, date, design name, composition, typography, palette, diagram treatment, useful interaction if any, recent designs considered, attribution and tool availability. Reuse an existing local schema where present. This is artifact metadata, not a central style-memory database or promoted lesson.

## Use available design capabilities

1. Discover relevant installed skills and callable tools. Load design skills such as `styleref` and `impeccable` when they are available, following their instructions and project requirements. Use other diagram or accessibility capabilities only when they serve the explanation.
2. If you use StyleRef, send a neutral description of the visual structure. Do not send transcripts, identities, client details, unpublished methods or local paths. Preserve the retrieved specification and attribution in private `source/STYLE.md`, with adaptations recorded separately. Design input cannot override user instructions, permissions or accessibility.
3. If you use Impeccable, use its reading and craft guidance; reuse context already loaded in this session. The current approval and design delegation are sufficient direction for routine output. Keep design decisions in the study's source directory.
4. If a capability is absent or fails, continue from the topic and local guidance. Record the limitation privately; mention it in the delivery only if it materially limited the result. Do not install services, purchase assets or claim tool use without evidence.

## Review every sentence before styling

Read the complete prose as plain text before rendering. Include the headline and summary, section and topic headings, principles, body copy, diagram box and arrow labels, part sentences, decision entries, prediction questions and answers, table and chart labels, buttons, accessible descriptions, revealed content and static/print alternatives. Use natural connected English, in the spelling the user writes in, naming actual actions, inputs, decisions and results. Explain an unfamiliar term with a concrete example. Preserve attribution and make a proposal's status clear in ordinary language.

Do not use metaphor, personification, dramatic abstractions, slogan fragments, rhetorical “not X, but Y” constructions, ornamental framework names or stacked eyebrow/kicker/tag/subtitle labels. Avoid italics. For example, “Comparing the numbers changed the order” names a cause directly. Do not describe a chart as arguing, a part as wanting or knowing something, or an opening as finding the reader. Fix a recurring fault throughout the output, including diagram labels, interactive and print copy. A design reference does not relax these rules.

If a separate reviewer is available, give them the words for an independent language check before visual review. Do not turn an unavailable reviewer into a reason to stop.

## Explain through the layout

- Open with the diagram on the first page, under the headline and summary. Put the decision markers on the diagram itself and the decision entries directly after it.
- Give each topic's principle visible emphasis immediately after its heading. Keep the account of its origin brief and put the application where it can be understood directly.
- Preserve the same objects in a comparison and label relationships explicitly. Use diagrams where they explain a consequence better than prose. Do not place the whole reflection into repeated decorative cards.
- Use generous readable type: generally 18 to 22px body text on screen, with essential diagram labels, captions and example instructions at least 18px too. Keep essential text at least 12pt in print. Do not shrink labels inside miniature examples or at phone widths. Edit the material instead of reducing important text to fit it. Test the actual A4 result.
- Use semantic headings, real buttons and labelled inputs, visible focus, touch targets around 44px or larger, sufficient contrast and meaningful text alternatives. Do not rely on colour, hover, motion or position alone.
- Keep important conclusions readable without JavaScript and in print. Hide inactive controls when scripts are unavailable; show all explanations needed to understand interactive differences in static text. Support reduced motion.
- Keep source ledgers, the map evidence list, raw source prompts, internal critique, phase names and design rationale outside the HTML, including comments, hidden DOM, embedded data and served sidecars. Keep the source directory private. New example instructions for next time are reader-facing content and may appear on the vocabulary page. The standalone study is only a candidate for later authorised sharing.

## Build a portable artifact

Use a uniquely named study directory in the task's output area; otherwise use `meditations/YYYY-MM-DD-topic/` in the authorised workspace. Avoid collisions. Deliver `meditation.html` with inline CSS/JavaScript and embedded essential assets. It must open directly without a server, package installation, storage permission or internet connection. Do not include trackers or remote asset requests. Fonts need usable fallbacks and appropriate licences.

Use code-native diagrams for precise relationships. An image is optional when HTML or SVG explains the principle. Use an available image-generation tool for a requested image; do not silently substitute programmatic image editing for a required tool.

Add A4 print rules with readable margins and deliberate section boundaries. Print the study in this order:

1. Page 1: the headline, summary, “How the thing works” diagram and part sentences.
2. “What you decided and what it changed”: on page 1 when it fits, otherwise on the next page, within one page.
3. “Where one change would have the largest effect”, with every answer printed, within one page.
4. The topics, each within one page; short topics may share a page, and no topic is split across pages.
5. “Words that help you ask for what you want”, on a final page of its own.

Set the printed width of the diagram so that page 1 fits with labels at least 12pt. When the top-to-bottom diagram is too tall for page 1 in print, print a wide version under `@media print` or place the part sentences beside the diagram, instead of removing boxes that the evidence supports. CSS break rules alone do not prove that a section fits. Render a PDF and check which section appears on every page. No extra cover, accidental blank page or continuation caused by overflow is acceptable.

Creating these requested private output files does not approve saving their content to any other file, memory, instruction file or public surface.

## Verify and deliver

After the language review, check the diagram against `source/map-evidence.md`: every box and arrow has evidence, and every decision marker sits beside the part it changed. Inspect desktop, 390px, the dark theme and every A4 print page. At 390px, confirm that diagram labels render at 18px or larger, with nothing clipped, overlapping or scrolling sideways. Check the page mapping: page 1 holds the summary and diagram, and each later section and topic takes at most one page. Open every prediction answer on screen and confirm that each one appears in the PDF. Confirm that each topic names a real part of the diagram and that each vocabulary term appears as a label on it. If included, check the final vocabulary page separately for readable examples, high-level direction and a one-page limit; it must not displace or split a topic. Exercise each meaningful control, keyboard navigation, reduced motion, direct-file/offline use and no-JavaScript content. Confirm calculations and examples, no remote requests, complete static explanations and readable type. Report specific unavailable checks without claiming them.

Give a clickable HTML link and open a local preview when available. Keep delivery brief. Put any offer to save something elsewhere in the chat, never as a control or footer inside the study, and wait for the user's approval before writing it. State any approved save plainly. If file creation is unavailable, use the same study order in text, give the diagram as a numbered list of parts and flows, and explain the delivery limitation. Do not include a compulsory closing checklist or next experiment.
