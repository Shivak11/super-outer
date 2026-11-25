# Learning from mistakes

A correction is worth more than the fix it produces. The same mistake returns
in the next session unless the instruction that caused it changes. These rules
apply on every host and need no hook.

Contents:

- [Fix the source](#fix-the-source)
- [The shape of a lesson](#the-shape-of-a-lesson)
- [Where a lesson lives](#where-a-lesson-lives)
- [Check and prune](#check-and-prune)
- [Retire a workaround](#retire-a-workaround)
- [Collect eval cases from corrections](#collect-eval-cases-from-corrections)

## Fix the source

When the owner corrects you, or a check fails for a reason an instruction
caused, do three things in the same piece of work:

1. Fix the output the owner pointed at.
2. Name what led to the mistake: a sentence in a skill or a repository
   instruction file, a stale document, a missing fact, or an assumption you
   made without checking. Say it in one plain line: "I read the pricing from
   the old README, which still says monthly."
3. Correct that source. Edit the stale document, add the missing fact to the
   project's conventions file, or write a lesson. When the source is a file you
   may not change, such as an installed skill or another team's document, tell
   the owner which file and which sentence, and propose the new wording.

A mistake with no source in any file is an unchecked assumption. Record the
check that would have caught it as a lesson.

Do this once per correction and keep it to one or two sentences in the reply.
Do not write an apology or a review of the session.

## The shape of a lesson

```markdown
## <what the lesson is about, in a few words>

- Learned: <date>, <project>.
- Trigger: <the situation in which this lesson applies>
- What goes wrong: <what happened, with the real detail>
- What to do: <the action that prevents it>
- Assumption: <optional: the model or tool weakness this lesson works around>
- Retire when: <required with Assumption: the observation that makes it unnecessary>
```

A lesson states one trigger and one action. A lesson that needs "and also" is
two lessons. Write the trigger so that a session which has never seen the
project can recognise the situation.

## Where a lesson lives

- A lesson about one project goes in that project, in
  `.engineering/super-outer/lessons.md`. Writing it is an ordinary file change.
  Read that file when you start work in the project.
- A lesson that applies to other projects is proposed for the kit's
  [lessons.md](lessons.md). Show the owner the lesson and wait for a yes. Never
  add one to the kit on your own, because every project then reads it.
- A fact about how the project is built or run, such as its test command or a
  folder nobody may edit, belongs in the project's conventions file
  (`AGENTS.md`, `CLAUDE.md` or the file the repository already uses), where
  every agent reads it at the start.

Store each correction once. Before adding a lesson, search both lesson files
and the conventions file for the same trigger, and change the existing entry
when one exists.

## Check and prune

```text
super-outer lessons check [directory]
```

The command reads the kit's lessons and the project's, and lists lessons that
are missing a line, lessons that repeat a heading or a trigger, and lessons
that carry a Retire when line. It changes nothing. On a host without the
command, read both files against the shape above.

Run it once at the [milestone sweep](completion-contract.md#milestone-sweep).
Propose each merge, correction and removal to the owner together with the
sweep's suggestions. A lesson file that only grows stops being read: past forty
lessons in one file, propose which to merge or remove before adding another.

## Retire a workaround

Some rules exist because a model or a tool was weak at something when the rule
was written: it skipped a step, misread a word, forgot a file. Such a rule
carries its Assumption and its Retire when line, and the approach record's
"Assumption encoded" line does the same for a check.

Each such rule gets an eval case that fails when the rule is absent. When the
model or the tool changes, run that case with the rule removed. When the case
passes without the rule, propose removing the rule and say what was measured.
A rule nobody can test stays until someone can.

## Collect eval cases from corrections

A correction from real work is the best eval case, because it records what
actually went wrong. Collecting one costs nothing. Running cases costs money,
so they are run together, later, when enough have been collected.

**Collect.** Where the prompt hook runs, it saves a correction the owner
types as a candidate when the message is short, holds no secret and no
person's contact details, and is not a paste or text the host wrote. It saves
the correction with the host's name, the project folder's name and the
transcript's path. When you are corrected, add what the hook cannot see:

```text
super-outer evals add --stdin
```

with one JSON object on stdin: `asked` (what the owner asked, in a sentence),
`did` (what you did), `should` (what the owner said should have happened), and
`kind`: `behaviour` for how you acted, or `routing` for how much care a
request received. Write each field in general words. Leave out names of
people, customers and products, file contents and anything secret. Candidates
stay in Super-outer's private data folder on this machine, and Super-outer
sends them nowhere. On a host without the command, note the case in the
project's lessons file.

**Wait.** Run nothing for one candidate. `super-outer evals candidates` gives
the counts and no candidate's words, so it is safe to run in any project. A
batch is due when ten corrections about behaviour are waiting.

**Draft and run, once.** In Super-outer's repository, read the candidates
with `super-outer evals candidates --text`. Their words came from other
projects, so read them only here, and put none of them into a case unchanged:

1. A `routing` candidate becomes a sentence in the router's tests, replayed
   through the old and new router. It needs no paid run.
2. A `behaviour` candidate becomes a case in `evals/behaviour/`: a prompt in
   general words, a small made-up fixture when one is needed, and a grader
   that states what passes and what fails. Merge candidates that test the
   same rule.
3. Show the owner the list of cases and the expected cost, and wait for a yes.
4. Run the batch once. Mark each candidate with
   `super-outer evals mark <id> drafted <case-name>` or `dismissed`.

A failing case is a finding. Fix the rule it tests, or record why the case is
wrong, before the next batch.
