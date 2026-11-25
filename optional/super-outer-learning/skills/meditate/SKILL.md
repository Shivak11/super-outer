---
name: meditate
description: "Reflect on completed work, a session or a recurring preference through a concise visual HTML study of how the built thing works. Open with a diagram of the parts built or changed and what flows between them, place the user's corrections and disagreements on it, ask prediction questions about where one change would have the largest effect, then give short principles and vocabulary that each point to a part of the diagram. Use for ‘meditate on this’, ‘reflect on this session’, ‘what did I learn?’ or examining a preference. The study is private, and nothing from it is saved anywhere else without the user's explicit approval."
argument-hint: "[artifact|session|taste] [subject]"
---

# Meditate

Help the user understand how the thing they built or changed works and which parts their own decisions changed, so that the principles behind it are easier to remember. Produce a private, concise visual HTML study by default. Use natural, connected English, following the spelling the user writes in. Each study contains one diagram of the system, and its other sections refer to that diagram, as described in [references/reflection-format.md](references/reflection-format.md). Read [references/visual-study-output.md](references/visual-study-output.md) before creating the artifact. The final page, “Words that help you ask for what you want”, follows [references/prompt-vocabulary.md](references/prompt-vocabulary.md): it teaches terms that label boxes or arrows on the diagram and help the user specify a result while the AI handles implementation. Follow its opt-out and no-useful-term rules.

The study follows this order:

1. A headline sentence and a one or two sentence summary of the work.
2. “How the thing works”: a diagram of the parts built or changed in the session, what each part does and what flows between them.
3. “What you decided and what it changed”: each correction and disagreement, placed on the part of the diagram it changed, with what happened as a result.
4. “Where one change would have the largest effect”: two or three places on the diagram, each with a question the reader answers before opening the answer.
5. Short topic principles, each naming the part of the diagram it explains.
6. “Words that help you ask for what you want”, where each term labels a box or arrow on the diagram.

The study is private. The request to meditate authorises creating it and its source files. Saving anything from it anywhere else, such as a notes file, a memory, an instruction file or a shared page, needs the user's explicit approval for the content and the destination.

## Establish the context

1. Identify the work or session and inspect the available evidence. Distinguish what happened, what the user said and what you infer. Do not invent a discovery, preference, outcome or psychological explanation.
2. Use preferences the user has stated in the current conversation or in instruction files already loaded for this session. An explicit current preference and an approved example are sufficient direction. Do not ask the user to reconfirm them or choose an aesthetic again. Clarify only a material conflict that current instructions do not resolve.
3. Infer one primary mode: `artifact` for a concrete piece of work, `session` for a period of work, or `taste` for a preference being compared across examples. Ask only if the distinction materially changes the reflection and remains unclear. Keep these labels private.
4. Honour an explicit text-only or no-file request. When files cannot be created, use the same study order in chat, give the diagram as a numbered list of parts and the flows between them, and state that an HTML file could not be created.

## Reason through the five Rs privately

These are internal reasoning steps. They do not prescribe headings, five sections or a long report in the study.

### Review

Reconstruct the actual questions, corrections, observations and decisions. Then build two private lists from the evidence before writing anything for the reader.

**The parts and the flows between them.** List each part the session built or changed, and each existing part they directly depend on: a file, a component, a script, a hook, a command, a prompt, a database table, an audio track or a section of a document. For each part, record what it does and what passes between it and the other parts: its inputs, the event that starts it (a trigger), what it produces (outputs) and anything it saves for later use (stored state). Take every part and connection from a file path, command, tool call or message in the evidence. When the built files are readable, open them to confirm what connects to what. When they are not, work from the transcript and keep to what it shows. Do not add a part or connection that the evidence does not show. Keep this list, with the evidence for each box and arrow, in the study's private `source/map-evidence.md`.

**The decisions.** List each correction the user made and each time they disagreed with a recommendation from the assistant. Include Blind Pick reveals when the evidence contains them. They are notes, shown after the user answers a question, that name the option the assistant would have chosen. They start with the question's short heading, in the form `<heading>: you chose "X". Claude would have picked "Y".`, and they count as disagreements only when the two choices differ. For each decision, record what the assistant proposed or did, what the user said (in their own words where the evidence has them), which part it changed and what happened afterwards. Check that each action is attributed to the person who took it. A correction that changed no part of the diagram belongs in a topic, if anywhere.

When the session built or changed nothing with parts that act on each other, such as a preference discussion or a single short text, draw the process the work followed instead: what went in, the steps, the checks and what came out. Never invent parts to fill a diagram.

Identify the topics that occurred. Keep related learning together rather than creating an artificial common theme or splitting one idea into several named topics. Topics that explain a part of the diagram come first. Keep a topic unrelated to the diagram only when it was a substantial separate discussion.

For `artifact` and `taste` modes, use [references/aliveness-review.md](references/aliveness-review.md) to examine the concrete choices. Use it in `session` mode when an artifact was made or revised. Keep source attribution and evidence labels in private working records.

### Relate

Compare with earlier work in the evidence only when it changes the interpretation. A resemblance across writing, interfaces, teaching or personal preferences is a comparison; it does not establish one cause or identity claim. Use applicable guidance for each kind of work separately. If new evidence conflicts with an earlier conclusion the user supplied, explain the relevant difference in ordinary language. Do not make a claim about a group of people from one person's preference.

### Reinforce

Select principles specific enough to guide a later decision and supported by the session. Distinguish a useful local lesson, a possible lasting lesson and an idea that remains uncertain. Keep these internal classifications out of the reader's headings.

Examine an alternative explanation or situation where each takeaway may fail. Consider a small next experiment where useful. This examination improves the principle; it does not require separate counterexample or experiment panels. Show a qualification once near the claim when it materially affects meaning. State a weakly supported idea as a proposal rather than an established rule.

Choose two or three places on the diagram where one change would affect the most other parts: a dependency between parts, a limit (a size, a count, a time or a cost), or an ordering or timing rule. For each, write the question “If [this] changed, what would happen?” in terms of the actual parts, and its answer: what would happen, which parts it would reach and why. Base the answer on how the parts are connected in the evidence. When the session showed the effect, say when it happened. Otherwise write the answer as a prediction from the connections. Prefer places that the user could change through an instruction over internal details that only the AI would touch.

For preference comparisons, test an explanation the user offers for their preference, as described in the review reference, only when relevant. Do not force every reflection to concern a preference or professional identity.

### Record

The HTML study and its source/design files are the requested output. Do not write to any other file, memory, instruction file, skill or public surface. If a lesson seems worth keeping somewhere else, offer it in the conversation with its exact content and destination, and write it only after the user explicitly approves both. Then verify the saved file and say plainly what was saved and where.

### Resolve

Create and verify the study using the reflection, vocabulary and visual-output references, in the order above. Begin with the headline and a one or two sentence summary, followed on the same page by “How the thing works”. That map page is the first page of the study. Put the decisions on the diagram as numbered markers and explain each under “What you decided and what it changed”. Give each place under “Where one change would have the largest effect” a question whose answer stays closed until the reader opens it. Keep each topic short: its plain heading, the emphasised principle, a brief origin, one application and a sentence naming the part of the diagram it explains.

Each section and each topic must fit within at most one readable A4 page. Edit for length rather than shrinking type or hiding essential content. Preserve natural phone scrolling. Add at most one readable A4 vocabulary page last, following the vocabulary reference, and count it separately from the topics. For text-only output, give the diagram as a numbered list of parts with the flows between them, then the other sections in compact form, including the vocabulary unless the reference rules omit it.

When delivering HTML, return a brief clickable link and, if useful, one sentence about how the thing works. Open a local preview when available. For text-only delivery, return the concise study and applicable vocabulary directly, without promising an HTML file. Mention any approved save in ordinary language. Do not return a checklist or repeat the full study in chat. After the delivery, do not add unrelated reflection questions.

## Keep the study private

- Use only the session's evidence and material the user supplied for observations about the person. Make no diagnosis or unsupported personal inference.
- Keep credentials, secrets, raw transcripts, prompts, the map evidence list and design rationale outside the reader-facing HTML, including comments, hidden content and embedded data.
- Do not publish or share the study, or save anything from it elsewhere, without the user's explicit approval.
