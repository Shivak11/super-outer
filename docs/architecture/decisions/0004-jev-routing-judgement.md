# Decision: Jev decides the design path when a person switches it on

Status: accepted
Date: 2026-10-07
Decider and approval evidence: Shiva Kakkar, the owner, on 7 October 2026. The owner decided that Jev becomes part of Super-outer through OpenRouter, that people bring their own key, that Jev is not limited to listed folders and that Super-outer Experimental retires. The owner then answered four open questions in the design note: only a key placed for Super-outer switches Jev on; a private record of readings and the first 120 typed characters is kept on the owner's computer for 30 days; four candidate domains are counted; the engineering approach stage moves into Super-outer.
Related records: the internal design note and coding-agent record are not part of the public tree; this decision amends the "no outbound call" reading of `AGENTS.md` and the research rule in `skills/super-outer/SKILL.md`.

## Context and decision drivers

The prompt hook routes each request with word lists. During the 5.7.0 build the word lists missed plainly worded requests for new screens and sent routine work down the design path. A labelled study of 420 written requests found that TypeSafe's decision model Jev, `typesafe/jev-1.13`, chose the design path correctly on 79 of 80 held-out requests, against 64 for the merged 5.7.0 word lists. One live run of the shipped question set on 7 October 2026 gave 118 of 120 on three held-out sets, against 84, and 40 of 40 against 20 on the set written for 5.8.0. Jev is an outside service, so using it sends the typed request to OpenRouter and TypeSafe, which the repository's rules had never allowed before.

## Decision and alternatives

- Jev's five yes-or-no answers, combined in code as the study froze them, decide whether the route names the design path. A routine rebuild that asks for no screen keeps the 5.7.0 answer, because Jev reads "rebuild" literally.
- A "yes" also brings the product UI specialist, the new-feature change shape and a FOCUSED floor. A "no" removes only the line. Jev never lowers depth or the question allowance and never selects or removes a library.
- Jev may add lines that ask for more care: a likely false library match, a protected boundary the word lists did not route as CRITICAL, and a depth two steps higher.
- Only a key placed for Super-outer (`SUPER_OUTER_OPENROUTER_KEY`, or `~/.config/super-outer/jev.env` readable only by its owner) switches Jev on. `SUPER_OUTER_JEV=off` switches it off without a release.
- Only the typed words are sent, at most 1,500 characters, after host blocks are removed and a secret filter has passed them. The call has one attempt, a 2.5-second limit and no redirects. Any failure gives the 5.7.0 route.
- Alternatives considered and set aside: limiting Jev to listed folders (rejected by the owner); reading any `OPENROUTER_API_KEY` (rejected by the owner, because a key kept for another tool is not consent to send prompts); letting Jev's maintenance reading change the route (it would have removed the activation question from two labelled redesigns); letting Jev choose libraries (not shown to be better).

## Consequences and reasons to revisit

- Each prompt in a session with Jev on waits about one second longer and costs about a hundredth of a cent.
- Text pasted into a prompt can push Jev's reading. The effect is limited to the design line and what a "yes" brings, which only add care.
- OpenRouter stores no prompt text by default and keeps request metadata. TypeSafe does not train on input and states no retention period. A change to either policy, or to the model behind `typesafe/jev-1.13`, is a reason to revisit.
- Codex has no Super-outer prompt hook registered, so it does not use Jev.
- Revisit when a labelled study shows Jev better at choosing libraries, when the record shows a candidate domain coming up often enough to need its own checklist, or when a reworded question set passes a newly frozen held-out set.

## Evidence

The study used synthetic sentences only. The labelled sentences and recorded Jev answers ship as test fixtures in `tests/fixtures/routing/` and `tests/fixtures/jev/`. The model comparison of 12 October 2026 is in [`evals/reports/`](../../../evals/reports/README.md). The original study folder and the coding-agent record are internal and are not published.
