# Worked examples of the engineering approach

These four tasks cover every row of the gate table in the
[engineering approach](engineering-approach.md) except `SMALL_SAFE`, which
writes nothing. Each shows the three lines as they would be written, and nothing
else.

## A phone game rebuilt (FULL, runnable)

Task: redesign how exercise 1.1 of the Writing for AI course plays. The repository is a Next.js scaffold with the exercise as one HTML file that loads Phaser from a CDN. The inventory finds no test script, no committed browser check, a pure `simulate()` function inside the game, a local-only `window.__wfa` hook, a rubric at `docs/2026-09-03-game-design-rubric.md`, the session model at `content/model/session-1-1.json`, and playwright-core installed in a sibling project with Chromium 1228 in the Playwright cache.

Objective: a player on a phone finds, on the first screen, which step decides when the claim is paid.

See: the medium is a phone browser with a real finger. Nothing in the repository sees that today; the 4 September run that did was never committed. First job: a playwright-core script that drives the cached Chromium with real taps and drags at 390x844, 375x667 and 1280x800 and plays to the result screen, committed, run on the current version first. Protected files: the rubric, the session model, the play file, the check. Assumption encoded: the model calls a drag done when the pointer never hit the target.

Stop: machine, the check and the strategy sweep, with `or stop after 20 turns` and a token boundary; the machine loops on word counts, first words, tap targets, console errors and the no-dominant-strategy sweep. User, the owner plays it on their phone. Passing the rubric is where the machine stops; three versions passed 8 of 8 and two were rejected on sight.

Shape: one unit. One builder, one judge that sees the screenshots and one rubric line each. Two boards are built at the same time only if the owner asks to choose between variants. The owner sits between the build and the phone play.

## A backend timeout fix (QUICK, runnable)

Task: raise the timeout on the news refresh call and stop the retry storm. The inventory finds `npm test`, `npm run lint`, a Jest suite, CI on push, no browser tooling.

Objective: a refresh that takes longer than ten seconds fails once, plainly, and does not retry itself into a queue.

See: the existing suite and a new test that fails on the current retry behaviour. Protected files: the test directory. Assumption encoded: none new.

Stop: machine, `npm test` exits 0 with the new test present, or stop after 10 turns. User: none needed beyond reading the diff; nothing is visible.

Shape: one builder plus the usual verifier. Nothing runs in parallel.

## Twenty-two courses in a series (FULL, runnable, many units)

Task: finish the remaining courses of the Young Professional series through atom-creator. The inventory finds the pipeline's six audit stages, the C1 to C60 structural checks, the course JSON schema, and no browser tooling.

Objective: each course passes the structural checks and reads as one story to the auditor.

See: the structural validator and the schema, run per course. Protected files: the checks, the schema, the audit rubrics. Assumption encoded: the validator catches structure and not story.

Stop: machine, per course, the validator exits 0 and the audit returns no blocking finding, or stop after 8 turns per course; a token boundary per course. User: the owner reads one course from each batch of five.

Shape: twenty-two independent units, so one builder per course at the same time, one judge per rubric line per course seeing only that course and that line, a second agent that tries to disprove each blocking finding, and one merge into a ranked list. The owner sits after the run, never inside it. This is the one shape here that justifies a workflow, and it runs on a slice of three courses first.

## A programme outline for a client (not runnable)

Task: write the one-day programme outline for a public sector board. The inventory finds three Markdown files, a source ledger and no code.

Objective: the outline can be forwarded in an HR nomination email and entered as a budget line without revealing the method.

See: two mechanical checks exist, the dash and banned-idiom scan and the check of every quoted figure against the source ledger. Nothing else runs. Stop: the owner's read. Shape: one builder. No loop, no extra agents.
