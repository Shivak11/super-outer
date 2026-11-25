# Engines for a closed decision

The details below were checked against the live docs on 22 October 2026. They
change, so read the pages named in SKILL.md step 1 again in every run and
trust them over this file.

## Contents

- Which engine
- Question shapes
- Estimating cost and saving
- Fallbacks
- Private input
- A worked example

## Which engine

| Signal in the project | Outcome |
| --- | --- |
| Calls already go through OpenRouter or TypeSafe, several judgments are asked of the same input, confidences matter | TypeSafe Jev |
| Calls already use the OpenAI SDK, answers feed other OpenAI features, or decisions depend on each other in steps | OpenAI Decisions API |
| Calls already use the Anthropic SDK, or private input already goes to Anthropic | Claude structured output on `claude-haiku-5-5` |
| The output is free text, the input is private with no allowed destination, or a gate answer is no | Keep as is |

When no provider is in use yet, recommend the engine with the fewest new
accounts and keys for the project, and say so.

## Question shapes

Write the shape in the engine's own terms, as its live docs describe it.

- **TypeSafe Jev.** On 22 October 2026 the primitives were Choice (one option
  from a set), Noul (probability of yes) and Score (position on described,
  ordered levels). Independent questions over the same state go in one
  request. Include a no-match option when nothing may fit. Confirm the
  endpoint and request body on the API page; Super-outer's own Jev calls go
  through OpenRouter.
- **OpenAI Decisions API.** On 22 October 2026 the question types were
  `predicate`, `choice` and `score`, each with a `name` and `instructions`,
  sent with shared `input` to a dedicated endpoint. Add an `other` choice when
  the categories may not cover every input. Read the current model and price
  on the guide; do not copy them from here.
- **Claude structured output.** From the `claude-api` skill on 22 October
  2026: `output_config: {format: {type: "json_schema", schema}}` with the
  answer field as an `enum`, or a tool with `strict: true` and
  `tool_choice: {type: "auto"}`. Forced `tool_choice` is rejected on several
  current models, so never propose it. Claude Haiku 5.5 runs adaptive thinking
  by default, so propose `output_config.effort: "low"` for a closed decision
  and count thinking in the output tokens.

For a judge or grader, keep the pass threshold in code and ask the engine
only for the probability or score. For a ranking, ask for one score per item
and sort in code.

## Estimating cost and saving

1. Tokens per call: system prompt plus the typical input plus the output. For
   Claude, add thinking tokens. Count from the code; label it estimated.
2. Calls per period: read it from the trigger, such as per request, per item
   in a nightly batch or per case in a release eval. Say what you assumed.
3. Price per token for today's call and for the proposed engine, from the
   pages read in this run. If a price was not read, give token counts only.
4. Saving is today's cost minus the proposed cost for the same volume. Note
   latency when the call blocks a person.

## Fallbacks

Every finding names one. Common choices are keeping the current call for
answers below a confidence or probability threshold, sending them to a person,
or using a safe default such as `other`. A finding with no workable fallback
and a costly wrong answer fails gate 3.

## Private input

Health, finance, HR, identity documents, private messages and anything a user
has not agreed to share with another provider count as private. For such
input, reject Jev and the Decisions API. Recommend the Claude option only
when the same input already goes to Anthropic; otherwise keep as is. Never
copy private text into the report; describe it instead.

## Prompt caching note

Add this note to a Claude finding when the call repeats a large unchanged
prefix, such as a long policy. Read the minimum cacheable length for the
model in the `claude-api` skill (512 tokens for Claude Haiku 5.5 on
22 October 2026) and mark the prefix with `cache_control`. Caching is never
a finding by itself; other token savings belong to the cost review.

## A worked example

`ticket-router.ts:12` sends every ticket, about 40,000 a day, to a chat model
with a prompt that ends "answer only with one word: billing, technical,
shipping or other", and code compares the reply with a list.

- Gate: closed output yes, volume yes, cheap mistakes yes (other goes to a
  general queue), allowed to leave yes (order questions, no personal data).
- Outcome: OpenAI Decisions API, because the project already uses the OpenAI
  SDK.
- Shape: one `choice` question named `department` over billing, technical,
  shipping and other, each with a one-line description.
- Fallback: confidence below the threshold chosen from labelled tickets goes
  to the general queue.
