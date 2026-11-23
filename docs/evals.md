# Evaluate it on a synthetic repo first

The question is whether the agent changes its behaviour in the useful places without slowing down a small fix. The six fixtures cover proportionality, a materially changed user journey, plan-only scope, approval, access denial and evidence honesty. They contain no real user data.

```sh
node evals/check.mjs --list
node evals/check.mjs --self-test
node evals/check.mjs --prompt draft-reload
```

1. In a fresh agent session, load the skill and paste one generated prompt. Do not give it production access. Save its JSON response independently, for example in `eval-results/draft-reload.json`.
2. Run `node evals/check.mjs --grade draft-reload eval-results/draft-reload.json`. The structural grader checks decisions, question count, evidence tags and the presence of a recommendation. A nonzero exit indicates one or more failed checks.
3. Read the prose against the human rubric printed by the grader. Check that each claim is supported by the scenario, the recommendation is helpful and it respects the action boundary. A model can echo tags without following instructions. Do not count that as a semantic pass.

For a comparison, use separate clean sessions with the same host, model and tools, one without the skill and one with it. Keep the fixture constant, randomise order, and score it against the same rubric. Use the failed cases to tighten the weakest instructions rather than optimising for the tags. Log host version, model, date and whether tools were enabled. These checks do not measure live agent adoption, a security guarantee or production outcomes.

`--self-test` exercises the grader with answer fixtures and intentionally wrong variants. It does not call a model. The JSON vocabulary is reserved for these eval prompts, not normal user-facing replies.
