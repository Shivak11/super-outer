# Recorded eval results

These files are the recorded results of three eval runs. Each file name gives
the date of the run and the Super-outer version that the run tested. The runs
took place in the author's development repository before the public release.
The cases have changed since then. A rerun today tests the current text.

Full transcripts were not kept. The files hold scores, pass rates, turn counts,
costs and the names of failed graders. Case names are unchanged.

## How a behaviour run works

`claude plugin eval` runs each case in `evals/behaviour/` twice per arm. One
arm has Super-outer installed. The other arm, the baseline, has no plugin.
Graders score each run between 0 and 1. A case passes a run only when every
grader passes. `delta` is the score with Super-outer minus the score without
it. The routing model was switched off (`SUPER_OUTER_JEV=off`) for every run.

To run the suite yourself:

```sh
claude plugin eval . --no-publish --trust-plugin --ablation with-without
```

A full run uses your own Claude account and costs money. The October runs cost
between 0.65 and 6.27 US dollars per pass. The November runs cost 15.47 US
dollars in total.

## The files

| File | Date | Version | What it measured |
|---|---|---|---|
| [2026-10-12-v5.10.0-behaviour.json](2026-10-12-v5.10.0-behaviour.json) | 12 Oct 2026 | 5.10.0 | Behaviour cases, with and without Super-outer. Pass 2 covers seven cases with a Sonnet judge. Pass 5 covers six new-product cases. |
| [2026-10-12-v5.10.0-routing-model-bakeoff.json](2026-10-12-v5.10.0-routing-model-bakeoff.json) | 12 Oct 2026 | 5.10.0 | Three decision models on 160 written requests, one call per request. |
| [2026-10-12-v5.10.0-routing-model-bakeoff.txt](2026-10-12-v5.10.0-routing-model-bakeoff.txt) | 12 Oct 2026 | 5.10.0 | The summary lines of the same run. |
| [2026-11-18-v6.6.0-journey-map.json](2026-11-18-v6.6.0-journey-map.json) | 18 Nov 2026 | 6.6.0 | Six cases tagged `journey-map`, first run and re-runs, Claude Code 2.1.325. |

## Headline numbers

**Behaviour, 12 October 2026, version 5.10.0, pass 2 (seven cases).** The
mean score was 0.82 with Super-outer and 0.57 without it.

| Case | With | Without |
|---|---|---|
| bugfix-without-brief-asks-nothing | 1.00 | 1.00 |
| existing-brief-new-subsystem | 0.50 | 0.50 |
| explains-consequence-first | 0.50 | 0.75 |
| new-feature-asks-safe-activation | 1.00 | 0.00 |
| ordinary-fix-no-approval | 1.00 | 0.50 |
| quick-question-stays-quiet | 1.00 | 1.00 |
| screen-change-confirms-assumptions | 0.75 | 0.25 |

**Journey map, 18 November 2026, version 6.6.0, first run (five cases).** The
mean score was 0.79 with Super-outer and 0.55 without it.

| Case | With | Without |
|---|---|---|
| journey-interview-goes-phase-by-phase | 0.60 | 0.60 |
| new-device-mid-build-updates-the-map | 1.00 | 1.00 |
| new-product-maps-every-phase | 0.67 | 0.42 |
| plain-request-opens-sign-in-and-deletion | 0.67 | 0.00 |
| second-person-gets-a-journey | 1.00 | 0.75 |

The re-runs in the same file test single cases after review fixes. They are
listed in the file with their own scores.

**Routing model bake-off, 12 October 2026, version 5.10.0.** Each model read
120 held-out design requests and 40 new-work requests.

| Model | Design path right | New work caught alone | Median time |
|---|---|---|---|
| typesafe/jev-1.13 | 118 of 120 | 18 of 20 | 510 ms |
| openai/gpt-6-luna-decisions | 117 of 120 | 12 of 20 | 350 ms |
| microsoft/microsoft-decision-1 | 108 of 120 | 15 of 20 | 671 ms |

No model wrongly flagged any of the 20 fixes as new work. The design-path
count treats a request routed `SMALL_SAFE` as right, because the hook does not
ask the model about such a request. One such request is in the 120. The
requests are written test sentences. They also ship in `tests/fixtures/jev/`
and `tests/fixtures/routing/`.

## Offline check

`npm run eval:check` confirms that every case, grader, skill eval and result
file loads. It runs no model.
