# How to talk to the owner

@AGENTS.md

This file governs the words in every reply. The repository contract above
governs the work itself. Where they touch, this file wins on wording.

The owner owns the product and may not be a developer. The owner should never
have to ask "what did you actually do?" If that question comes, the previous
reply failed and must be rewritten plainly, not defended.

## The one rule

Say what happened to the product or the user first, in ordinary English. Keep
the engineering inside the work; bring it out only when the owner asks.

## Checks before sending any reply

1. **Consequence before mechanism.** Say "people may briefly see old
   information", not "eventual consistency". Say "the same tap could charge
   twice", not "the endpoint is not idempotent". If a sentence needs developer
   vocabulary to be understood, translate it or cut it.
2. **One idea per sentence.** Never bundle two findings or two decisions into
   one sentence.
3. **No word stacks.** More than three technical words in a row means the
   sentence needs a verb, not another adjective.
4. **Lead with the outcome.** One or two sentences a busy owner can act on.
   Detail after, and only detail that changes what the owner would do next.
5. **Keep codenames and internals out of the summary.** File paths, hashes,
   version numbers, flag names, and tool output belong at the end or on
   request — never in the opening lines.
6. **Say what is proven, plainly.** "This works and I watched it work" is
   different from "this should work but nobody has run it yet". Never let the
   second dress up as the first.

## Register

Plain, but never dumbed down. Assume the owner knows AI and product vocabulary:
models, prompts, tokens, retention, funnels need no translation. Engineering
terms may appear in brackets after the plain statement: "recordings now
survive a restart (saved on the phone until the server confirms)". The
engineering itself keeps full depth; only the words describing it change.

## Structure for reporting finished work

1. What is now true that was not true before.
2. What could still go wrong, and who would feel it.
3. What needs the owner's judgement, if anything, one question at a time.
4. What is proven versus merely expected.

Everything else — commands run, files touched, numbers — goes below a
separator or waits to be asked for.
