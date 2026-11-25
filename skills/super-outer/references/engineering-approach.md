# Engineering approach

This stage decides how a build will be engineered before it starts: what the
agent can see and run first, what stops the work, and how many agents build and
check it. The rest of Super-outer's review decides what to build and what must
be proved. The stage writes its four lines to an approach record in the
repository, says them in the reply in plain English, and then the same session
continues into the work.

Contents:

- [Before writing anything](#before-writing-anything)
- [The four lines](#the-four-lines)
- [Gate and size](#gate-and-size)
- [What to write, and where](#what-to-write-and-where)
- [See](#see)
- [Stop](#stop)
- [Shape](#shape)
- [Inventory](#inventory)
- [What this stage never does](#what-this-stage-never-does)

The stage runs after the route and the anticipation and before any
implementation, in three cases:

- Super-outer's route line names it, which happens for routes at `FOCUSED`,
  `FULL` and `CRITICAL`.
- No route line arrived, as on a host without Super-outer's prompt hook, and
  Super-outer's own routing gives one of those three depths.
- The user asks for it, at any depth.

The gate below sizes the stage in each case, so it also has rows for
`SMALL_SAFE` and `QUICK`. The reply shows the stage under the heading
"Engineering approach". On a chat question or non-engineering work the stage
does nothing and is not mentioned.

The stage never produces a staged plan or prompts to paste. On 14 September
2026 a planner that produced those was rejected within minutes. The output of
this stage is smaller than the work it describes.

## Before writing anything

1. **Read the route.** If the prompt carried Super-outer's route line ("Super-outer routed this request as ..."),
   take the depth from it. If no route line arrived, take the depth from
   `super-outer route --stdin` when the command is available, and otherwise
   judge it on the depth scale in [SKILL.md](../SKILL.md): `SMALL_SAFE`,
   `QUICK`, `FOCUSED`, `FULL`, `CRITICAL`. Say which you did.
2. **Run the inventory** on the repository the task concerns:

   ```bash
   super-outer inventory <directory>
   ```

   The command is read-only. It lists the test, lint and build commands, the
   browser and device tooling, the rubric-like files, the proof obligations and
   the candidate protected files, and its summary ends with `runnable: true` or
   `runnable: false`. Read its output. Do not guess what the repository can
   check. On a host without the command, judge the same facts by reading the
   repository, and say that you did.
3. **Apply the gate** from the table below. When the stage is skipped, say so in
   one line and continue with the task.

## The four lines

Each line answers one question. Write the answer as a sentence a machine can act
on and the user can check. The dated sources behind each rule are in
[engineering-approach-sources.md](engineering-approach-sources.md), and worked
answers are in [engineering-approach-examples.md](engineering-approach-examples.md).

### 1. See

Question: what can the agent run and see before it builds, in the medium the
user will use?

- Name the medium: phone browser, desktop browser, device, simulator, API,
  terminal, printed page.
- Name what already exists from the inventory, and name the gap between that and
  the medium. A headless capture that runs no animation frames and takes no real
  pointer input does not see a game; a unit test does not see a screen.
- If there is a gap, the first job of the build is to close it: write the check,
  run it on the current version, and expect it to fail on the old behaviour
  where that is feasible. Only after that does the build begin.
- Name the files the builder may not edit while it works: tests, rubrics,
  fixtures, approved records, the check itself. Among them, name the boundary
  tests: the few that state the product's promises from outside, which a
  rewrite must still pass unchanged
  ([proof](proof-and-recorded-inputs.md#tests-that-outlive-the-code)).
- Name the readiness gaps the inventory lists, such as no single test command
  or no conventions file. A gap that stops the agent checking this task is
  closed first. The others are shown once with the milestone suggestions.
- Write the assumption the check encodes ("the model does not notice a drag that never fires"),
  so a later session can retire the check when the assumption stops being true.

### 2. Stop

Question: what continues the work without the user, and what ends it?

- Write two stop conditions, separately, every time. The machine's stop is a
  command whose output appears in the conversation, with a bounded turn or time
  clause ("or stop after 20 turns") and any user-supplied token boundary. The
  user's stop is the user looking at the result. Do not invent a token limit;
  record "not specified" when none was supplied.
- The judge's tokens count towards the same task boundary as the builder's.
  Include one fix pass and rerunning its checks in the plan. Report measured
  usage when available and an explicit measurement gap otherwise. A second
  discretionary judge requires the user's agreement unless already authorised in
  the task; this does not replace required independent verification or
  authorise extending an exhausted budget. For a user-facing new feature or
  overhaul with a recorded product intent, the rendered review against that
  intent, the [experience review](experience-review.md), is required
  verification, so this agreement rule does not apply to it.
- A loop is allowed only on the machine's stop, and only where the criteria are
  clear and another round measurably improves the result. Word counts, first
  words of feedback lines, tap targets, console errors, a strategy sweep, a type
  check: these loop. Whether a screen reads well, whether a game holds
  attention, whether a sentence is right: these do not loop. Taste never loops.
- On `FOCUSED` and deeper runnable work, run the read-only `edge-cases` skill on
  the plan before building. Its top findings, at most five, go into the plan as
  proposed tests the machine's stop must pass, written as one line: "Breakage
  tests: ...". The owner's approval of the plan approves them. `QUICK`
  routes skip it unless asked.
- Write `Done when`: the results another person can check when the work is
  finished, in the medium where the work is used. A screen has what a person sees
  and can do. A server change has the request and the response. A data change
  has the counts before and after. A tool has the command and its output.
  "Tests pass" is the machine's stop and never the whole of `Done when`. On a
  `QUICK` route state it in one sentence in the reply.
- For a choice that is cheap to reverse, an unattended run proceeds on the
  recommended answer and records it under "Decisions taken"
  ([completion contract](completion-contract.md#decisions-taken-for-the-owner)).
- When the user's stop is the only one, say so and do not propose a loop.
- Passing a rubric is where the machine stops. It is never where the work stops
  when a person will look at the result.

### 3. Shape

Question: how many agents, and who checks whom?

- Count the units that can be worked without reading each other's unfinished
  output. One unit means one builder and one judge, and that is the complete
  answer. Use more agents only for independent units, many items, or many rubric
  lines.
- Say what must run in sequence because each step needs the output of the one
  before it.
- Say how many judges there are and what each one sees: the output and the rule,
  in fresh context, never the builder's notes or reasoning. A judge that reads
  the builder's reasoning inherits the builder's belief that the work is fine.
  When the change ships text that describes behaviour, such as a skill
  description, a README or a file header, ask the judge to compare each of its
  sentences with the code.
- Where the judge's role permits creating evidence, keep runnable attack scripts
  in an authorised scratch folder outside the repository. Mark findings as
  reproduced or inferred, record the command and result, and make no outside
  network request unless explicitly authorised for the review. A strictly
  read-only judge returns commands for the orchestrator to preserve instead.
  After a fix, rerun the unchanged scripts and record results beside the
  original findings. Record a deliberate behaviour change separately rather than
  editing the attack to conceal it; keep private fixtures out of published
  packages.
- Say whether judged failures pass through a second agent whose only job is to
  show that a failure is not real. Use it when there are more than a few judges,
  because judges produce false findings at the same rate as true ones.
- For pages, screens or copy that a person will judge by eye, build and render
  the main working screen first, which is the screen where the user performs the
  recurring action. Never choose the first rendered slice because it is the
  smallest or because it is already approved. When the design path applies, that
  screen comes from the design package described in
  [design-package.md](design-package.md). Place the user's review before
  parallel building or dependent expansion. Approval of a written plan approves
  scope; it does not approve the rendered appearance or wording. Continue
  independent checks while that review is pending, without building unapproved
  dependent sections.
- Say where the user sits: between completed runs, so a bounded run finishes
  with a result the user can inspect.
- When two technical designs are close and only real inputs separate them,
  build both small in a scratch folder and compare them on the owner's real
  inputs before recommending one. Say what was measured. Do this for a choice
  that is expensive to change later, such as a parser, a database or a model,
  and never for taste.
- The orchestration rules for parallel agents, which cover a dedicated worktree,
  one owner per file, collision handling, verification from disk and staging
  audits, are in [parallel-agents.md](parallel-agents.md). The shape line states
  only the shape for this task and does not restate them.
- State the shape in one sentence. Do not build it here.

### 4. Tools

Question: are the project's dependencies current, and which skills, MCP
servers, command-line tools or services would help this build?

- Run the [tool check](tool-check.md), with the task's needs on new work and
  when the task adds something the current packages do not cover. `QUICK` routes and `runnable: false` work skip
  this line and write "skipped" under the record's Tools heading.
- Write its Tools block in the row shape the tool check gives: at most four
  rows, upgrades and deprecated packages first, each with why, effort and
  risk, and what happens on "no", plus the install line where the user runs
  one.
- When a recommended skill targets a newer version than the project pins,
  the upgrade comes first in the same row.
- Keep building while the user decides. Nothing here installs anything.

## Gate and size

| Depth or deliverable | What the stage writes |
|---|---|
| `SMALL_SAFE` | Nothing. One line saying the stage is skipped, then continue. |
| `QUICK`, `runnable: true` | Three short lines. Usually: the existing suite; the test run, then the user; one builder plus the usual verifier. |
| `FOCUSED`, `FULL`, `CRITICAL`, `runnable: true` | The full four lines. The see line names the first job when a gap exists. |
| `runnable: false` (a chapter, outline, proposal, post) | One line naming the mechanical checks that exist, such as dashes, the banned idiom list and quotes against transcripts, and saying that the stop is the user's read and the shape is one builder. No loop, no extra agents. |

The depth comes from the route. The runnable verdict comes from the inventory.
Neither is a judgement call, so neither is a question for the user.

## What to write, and where

Write the approach record to
`.engineering/super-outer/approach-<YYYY-MM-DD>-<slug>.md` in the repository the
task concerns, creating the directory if it does not exist. When a written
ownership contract (a committed build plan, an orchestrator's brief or a
parallel-agents division) does not list that path among the files this session
may create, the contract wins: put the approach record in the reply, say in one
line that it was not written to the repository, and let the orchestrator decide
where it is kept. The record holds:

```markdown
# Approach: <task in one line>

Date: <YYYY-MM-DD>
Depth: <from the route, or judged>
Runnable: <true|false>
Objective: <what the build must make true for the product or its user>

## See
<the line>
Protected files: <list>
Assumption encoded: <one sentence>

## Stop
Machine: <command, turn or time clause, token boundary; or "none, the user's look is the only stop">
User: <what the user looks at>
Done when: <results another person can check>
Breakage tests: <from the edge-cases skill, or "skipped">
Boundary tests: <the tests a rewrite must still pass, or "none yet">

## Decisions taken
<added during the run: each reversible choice made for the owner, and how to reverse it>

## Shape
<the line>

## Tools
<the Tools block from the tool check, or "skipped" on QUICK and runnable: false routes>

## Inventory
<the inventory summary, pasted, or the facts judged by reading the repository>
```

Then say it in the reply under the heading "Engineering approach", in this order
and in plain English: one sentence stating the objective, the four lines, and
the record path. Keep it under 150 words, not counting the Tools block, with no stages, no prompts and no
headings beyond that one and the four names. When Super-outer's review is in
the same reply, its questions and recommendation come first, then this stage,
then the work. Continue into the work in the same session, starting with the
first job named in the see line when there is one.

Read the gate, the inventory and the route before asking anything. A question to
the user is allowed only when the medium is unknown from the repository and the
task, for example whether a page is meant for a phone or a laptop, and it counts
towards Super-outer's question allowance. Never ask the user to choose a tool, a
framework, a test runner or a loop type.

## What this stage never does

- It never produces a staged plan, a numbered pipeline of sessions, or prompts
  to paste.
- It never writes a line the machine cannot act on or the user cannot check.
- It never turns a taste decision into a loop.
- It never adds an agent to a one-unit task beyond one builder and one judge.
