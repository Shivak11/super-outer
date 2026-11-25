# Plain-English question candidates

Super-outer is an English-to-senior-developer translation layer. Its internal
analysis may be deeply technical; its questions to the owner must be about product
behavior, user consequence, risk tolerance, recovery, cost, or confidence.

Translate before proposing:

- `idempotency` becomes “could the same request cause the action twice?”;
- `eventual consistency` becomes “may people briefly see older information?”;
- `rollback` becomes “can we safely return to the previous version?”;
- `p95 latency` becomes “how long may almost everyone wait?”;
- `CI or release SHA mismatch` becomes “the checked version is not the version
  we would release.”

Specialist names, scores, schemas, hashes, branch mechanics, and tool choices
belong in the evidence layer unless the owner explicitly asks for them.

Specialists propose; the router alone asks.

A candidate is justified only when different answers change desired behavior,
who can be affected, acceptable loss, latency or scale boundaries, privacy,
recovery, rollout, or the strength of proof. First inspect the repository
profile, source, tests, runtime evidence, and authoritative guidance.

Write each candidate as:

- `why`: the ordinary-language consequence;
- `question`: one direct product or risk decision for router consolidation;
- `options`: two or three concrete outcomes, not mechanisms;
- `recommended`: the zero-based index of the safest sensible option. Put its
  trade-off in `why` or the option text.

Before offering an option, verify that the session can execute it under its
current permissions and available tools. Do not search unrelated projects for
credentials, including names-only searches of their secret files, or offer to
load such a secret. Use an already authorised credential for the task when
available. Otherwise offer the service's secure sign-in flow or a command run
in the user's own terminal, and inspect only the non-secret result. Never ask
for a secret to be pasted into chat. State this dependency before presenting
the choice; selecting an option does not bypass host permissions.

Ask “If the dependency is slow, should the user see saved information or a
clear temporary failure?” Do not ask which timeout library or retry algorithm to
use. Ask “Can any data be lost during this move?” Do not ask which migration or
locking primitive to use. Ask “Should this motion feel immediate or
deliberative in this product?” only after local motion evidence is genuinely
missing; do not ask the user to choose an easing function.

Respect the whole-task budgets, which are floors as well as ceilings: QUICK one
to two, FOCUSED one to four, FULL one to seven, and for
CRITICAL one consolidated interview.
Above `SMALL_SAFE`, satisfy the floor with a genuine question or with
one plain line saying no judgement call was needed — never with silence, and
never with a question invented to fill the quota. A specialist never spends a
budget by itself and never addresses a question directly to the user.

## The mechanical audit

`src/question-audit.mjs` codes these rules, and the test suite holds the
lifecycle archetype questions to them. No hook or command runs that code on a
question drafted during a task, so apply the rules yourself before showing a
question, and treat them as rules rather than as a second self-review.

Blocking — the question is dropped and the reason is disclosed:

- **one decision per question.** Two question marks, a semicolon, or "and also"
  joining two asks. A consolidated interview bundles decisions into one call; an
  individual question must not re-bundle them.
- **length caps.** At most 28 words for the question and for the consequence,
  9 for an option label, 20 for an option's consequence.

Advisory — the question is still asked, and the note is for you, not the user:

- **noun clustering.** More than three content words in a row with no function
  word between them. Told to "translate jargon", a model often stacks
  adjectives instead of restructuring — "the async-safe idempotent retry-queue
  reconciliation policy". Prefer a verb. This never blocks, because a heuristic
  that cannot tell an adjective from a noun must not be allowed to delete a good
  question and replace it with an apology.

Rewrite what the advisory flags rather than shipping it. The disclosure is held
to the same caps, so the tool is not exempt from its own rule.
