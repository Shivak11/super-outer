# The pipeline diagram

A pipeline diagram explains how inputs become outputs: what is prepared, what each step does to the data, where a decision is made, how the result is checked and what comes out. It answers "how does it work" for one process. Hosting, releases and the next phase belong in the architecture diagram.

`assets/template-pipeline.svg` shows every rule below and passes the checker.

## Contents
- What goes in
- Stages and who performs them
- Data on the arrows
- Preparation and per-request work
- Joint and independent processing
- Branches, decisions and uncertainty
- What stays out
- Layout
- Facts
- Drawing both diagrams

## What goes in

Show only the stages a reader needs to follow the process the person asked about. A step that only moves data from one place to another, such as a retry or a log line, is not a stage. When two consecutive steps have the same performer and the reader gains nothing from the split, draw them as one stage.

Read the stages from the current source: the code that runs, or for a process outside software, the process document that governs it. Draw what runs today. A change that is proposed, cancelled or still in review is not in the picture. Draw it dashed only when the person asks to see it, and then add a line in the picture that names it as proposed.

## Stages and who performs them

Each stage is a box. Its title says what the stage does to the data ("Read each receipt", "Validate"). The line under the title names who performs it, in the performer's colour:

| Performer | Line under the title | Border and line colour |
|---|---|---|
| A script or the product's own code | `Script`, or the tool when it matters to the reader ("Script with Pillow") | `#E8590C` |
| An AI model | `Model:` and the model the source names | `#0B8A5F` |
| A person | their role ("Finance team") | `#1971C2` |
| An outside service that is not a model | the service's name | `#0C8599` |

Inputs, stored data and results are boxes too, with a line under the title saying where they come from or where they are kept ("Saved as ARTICLE_INDEX"). In a pipeline, stored data is a box in the storage purple `#6741D9`, not the cylinder of the architecture diagram, because the reader follows what the data is, not where it sits. Final results use the example indigo `#4263EB`, or the person blue when the result goes to a person.

A step that runs but changes nothing in the live release, such as a check whose result is ignored while a switch is off, is still drawn, because it runs. Say in its body or in the band's closing line what its result changes today. A value that decides nothing today, such as a threshold behind a switched-off feature, stays out of the picture and the facts block.

## Data on the arrows

Every arrow is labelled with the data it carries ("photos", "rule list", "answer"), not with a verb. A reader should be able to read the arrows alone and know what entered and left each stage. When a stage receives data from an earlier band, draw that arrow too; the link from preparation to use is often the point of the picture.

## Preparation and per-request work

Group stages into bands by when they run, and say it in the band title:

- work done once and reused by many requests: "Prepared once a night and reused for every claim";
- work repeated for every request or run: "Done for each claim", or "Prepared when each run starts" when preparation repeats every run;
- work that waits for a person or a later event: "Waits until a support agent opens /review".

Take the timing from the code, not from the design notes. When the code rebuilds something on every run, the band says so, even if a plan to cache it exists.

## Joint and independent processing

Say whether a step sees its inputs together or one at a time, because it changes what the step can notice. Write it in the stage's body ("One request per photo", "All receipts and the rules in one request") and repeat it once in a closing line in the band when it is the main thing the reader should understand.

## Branches, decisions and uncertainty

- Draw parallel branches only when the steps really run side by side or independently. Stack them in one column and let them meet at the stage that combines them.
- A decision is a stage with one labelled arrow for each outcome ("passes", "unsure").
- Show an uncertain outcome only when the process produces one, and name where it goes.
- A model's confidence is its own estimate. Never present it as measured accuracy, and never say that more inputs bring higher confidence: an extra photo can also add a contradiction. When an accuracy figure has been measured, give it with its date and the set it was measured on. The checker rejects text that equates confidence with accuracy.

## What stays out

A pipeline diagram has no hosting, no release and checks, no next-phase group, no Live or planned legend and no traced request strip, unless the person asks for one of them. Leave out implementation detail that does not change how the reader understands the process: function names, retry counts, queue names and file formats, unless the format is the data being explained.

## Layout

The canvas, colours, fonts, box shapes, arrow style and text sizes are the ones in `style.md`. The title names the process ("How Example Expenses checks a claim"), and the subtitle says where it starts and ends ("From the finance policy and one submitted claim to a decision"). A release or date goes in the subtitle only when the picture describes one release that the reader needs to know. Leave at least 10 units between an arrow label and the nearest border; the checker allows 4, which can look cramped at 2x. Keep arrows clear of band titles and other loose text; the checker reports an arrow that crosses a line of text. Bands run top to bottom in the order they happen, and stages run left to right inside a band. When a band has more stages than fit across at readable widths, usually more than six, continue below in the same band: the last stage of the first row sends its arrow down, and the second row reads right to left back under it. Arrows that cross from one band to the next go in the gap between bands, and are written in the file after both bands so no band fill covers them; the checker reports an arrow drawn under a box. Set `data-diagram="pipeline"` on the `<svg>` element, so the checker leaves out the architecture checks.

## Facts

Use `<metadata id="diagram-facts">` with the values the picture states and the source also states: the model, the schedule of the preparation band, the number of inputs, whether a step reads inputs together, a threshold that sends a result to a person. The test in `keeping-it-true.md` works the same way.

## Drawing both diagrams

When the person asks for both, draw the architecture diagram and the pipeline diagram as two files, such as `system-diagram.svg` and `ai-pipeline.svg`. Use the same name for every part that appears in both, the same colour for each kind of part, and the same values in both facts blocks. Run the checker on the two files together with `--one-system`, which reports a fact that the two blocks state differently. One test file can check both facts blocks. Show the architecture diagram at the top of the README and link the pipeline diagram under it.
