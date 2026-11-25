# The reader's reflection format

The study contains one diagram of the thing the session built or changed. Every later section refers back to the diagram by the names of its boxes and arrows. Use the order below.

## Headline, summary and the map page

Make the main headline a direct sentence summarising what was built, changed or clarified. Follow it with one or two sentences that summarise the work. A bare list of topic names does not provide that summary.

The heading “How the thing works” comes next, on the same page. Its first sentence names the thing in plain words. The diagram shows each part built or changed in the session and each existing part they directly depend on, and it shows what flows between them: inputs, triggers, outputs and stored state. Name each box in plain words with its technical name once in brackets, such as “Card shared by all six books (reusable component)”. Label each arrow with what passes along it, such as “title and progress” or “when you press Continue”. Below the diagram, give one short sentence for each part saying what it does. The headline, summary, diagram and part sentences make the first page.

Draw only what the evidence shows, following the Review step in the main skill. When the work had no parts that act on each other, the diagram shows the process the work followed.

## What you decided and what it changed

Place a numbered marker on the diagram beside the part that each correction or disagreement changed. Under this heading, give each number with what the assistant proposed or did, what the person decided (quoted when the evidence has their words), what changed in that part and what happened as a result. Include Blind Pick reveals where the two choices differed. Attribute each action to the person who took it. This section may share the first page when both fit; otherwise it takes one page at most. When the session had no corrections or disagreements, omit the section.

## Where one change would have the largest effect

Give two or three places on the diagram where one change would affect the most other parts: a dependency, a limit, or an ordering or timing rule. For each, state the place and its rule in one sentence, then ask “If [this] changed, what would happen?” in terms of the actual parts. Keep the answer closed until the reader opens it, so the reader decides on a prediction first. The answer says what would happen, which boxes or arrows it would reach and why, and whether the session showed it or it is a prediction from the connections. Keep the section within one page.

## Topics

For every actual topic, use this order:

1. Name the topic in plain language.
2. Immediately state one clear principle with visual emphasis.
3. Recall in one or two sentences the specific question, observation or correction that produced it.
4. Show one concrete application with its consequence.
5. Name in one sentence the part of the diagram it explains, using that box's or arrow's words.

These are content requirements, not compulsory labels. Do not print “Topic”, “Principle” or “How it emerged” above each element. The actual topic is the heading. Keep each topic shorter than a full page where possible and never longer than one readable A4 page; short topics may share a page. Do not assume three topics, subdivide one idea to meet the limit or force unrelated discussions into a single theme. A topic that explains no part of the diagram stays only when it was a substantial separate discussion; place it after the others and leave out step 5.

Use “you” only when supported by the conversation. If the assistant introduces an application or interpretation, identify it as an illustration or proposal. A weak idea stays provisional. No fixed count of examples, counterexample panels or experiments is required.

## Final vocabulary reference

After all topics, use [prompt-vocabulary.md](prompt-vocabulary.md) to add at most one readable page titled “Words that help you ask for what you want”. Each term labels a box or arrow on the diagram, and the page says where. The page helps the reader direct future work and is counted separately from the topics. Do not invent another session topic to justify it. Honour the reference's omission and text-only rules.

## Neutral illustration

This example is fictional. It demonstrates structure and level of detail, not a default subject or colour scheme. The diagram is described in words here; the study draws it.

# This session, you made the notes script list the notes in numerical order.

You built a short script that reads a folder of numbered notes and prints their names in order. The first version printed note 10 before note 2.

## How the thing works

The notes script has four parts, drawn from top to bottom:

- “Folder of notes (input directory)”, holding `note-1.txt`, `note-2.txt` and `note-10.txt`. An arrow labelled “file names” leads to the next box.
- “Step that finds each note number (regular expression)”. An arrow labelled “note numbers” leads to the next box.
- “Step that puts the notes in order (numeric sort)”. Marker 1 sits beside this box. An arrow labelled “ordered names” leads to the last box.
- “List printed on screen (standard output)”.

## What you decided and what it changed

1. The script first compared the names as text and printed `note-1.txt`, `note-10.txt`, `note-2.txt`. You said, “I want the numbers to go 1, 2, 10.” The ordering step was changed to compare the extracted numbers, and the next run printed `note-1.txt`, `note-2.txt`, `note-10.txt`.

## Where one change would have the largest effect

The step that finds each note number takes the first number in the file name, and the ordering step uses whatever number it receives.

If a file were named `2026-note-3.txt`, what would happen?

The answer, closed until the reader opens it: the first step would take 2026 as the note number, so this note would be printed after all the others. The session did not show this; it follows from the first step taking the first number it finds. Telling the AI which number in the name is the note number would prevent it.

## Sorting numbered notes

**Compare the numbers in file names when you want numerical order.**

In text order, the character `1` in `10` comes before `2`, which is why note 10 came second. If a file name also contains a year, decide which number is the note number before sorting. This topic explains the box “Step that puts the notes in order”.

On the vocabulary page, “numeric sort” would be taught with a sentence saying that it is the name in brackets on that same box.

## A provisional idea in a separate topic

If the same session included a suggestion that has not been tried, such as writing tomorrow's first task before ending the day, keep it as a separate topic after the others and state it as a proposal: **Preparing tomorrow's first task in advance may reduce the time spent deciding where to begin.** Say that it has not been tried, and do not add the topic unless that discussion actually occurred.
