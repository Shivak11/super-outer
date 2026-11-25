# Parallel agents

Parallel agents save time only when their work is independent. These are
Super-outer's orchestration rules for builders, design variants and judges. One
orchestrator owns the plan, the shared files and every commit.

## Agents by depth

| Depth | Agents | Models |
|---|---|---|
| `QUICK` | None | |
| `FOCUSED` | Up to 2 scouts | Sonnet |
| `FULL` | Scouts, up to 3 builders, sweep reviewers | Scouts on Sonnet, builders inherit, reviewers on Sonnet or Opus by risk |
| `CRITICAL` | `FULL` plus the independent verifier | Opus |

- At most 6 agents per task.
- Verify every report from disk. A report is not proof.
- Agents never ask the owner anything. Each agent returns its questions to the
  router, which is the only interviewer and asks them in one batch.
- Sweep reviewers use the one `dimension-reviewer` role with a dimension parameter.
- Briefs and reports use the [internal register](internal-register.md). The
  orchestrator translates results before the owner sees them.

## When parallel agents help

- Units that are independent, where no unit reads another unit's unfinished
  work.
- Design variants, when two or three alternatives must be compared before the
  owner decides. Each variant gets its own prototype folder or branch.
- Builders on disjoint files, after the design package and briefs exist.

## When one builder and one judge are enough

Use one builder and one fresh judge when the change is one connected unit, when
files share a contract that is still being decided, when the plan is not yet
committed, or when the units would need each other's output. Splitting such
work produces collisions and conflicting guesses.

## Orchestrator duties

1. Create a dedicated worktree with `--no-track`, for example
   `git worktree add --no-track -b <branch> <path> origin/main`, so that a bare
   `git push` cannot target `main`.
2. Commit a plan file before any agent starts. It is the specification that
   every agent reads.
3. Before writing, run `git worktree list --porcelain` and `git status --short`
   in each sibling worktree, and compare the changed paths with the planned
   files.
4. Give each agent an exhaustive list of the files it owns, with no overlap
   between agents.
5. Keep the shared files for yourself: schemas, manifests, contracts,
   integration tests, staging and commits.
6. Collision protocol: each agent records whether each owned file exists, and
   its modification time, before its first write, and checks again before each
   later write. When a file changed without that agent's write, the agent
   copies the changed version and its `git diff` to a snapshot folder at
   detection, stops, and reports.
   Each builder keeps an append-only edit log in its scratch folder: the time,
   the file, the change and the reason. A long-running builder can lose the
   memory of its own earlier edits, and they then look like another writer's.
   Before reporting a second writer, the builder compares the unexpected
   change with its log and with `git diff` on its files. The orchestrator
   settles authorship by searching every agent's transcript for writes to the
   path.
7. An amendment sent while agents are working takes effect only after the agent
   acknowledges it. Before putting an action to the owner as a decision, send
   every running agent whose brief includes that action an amendment to pause
   it, and wait for each acknowledgement. Only then tell the owner the action
   is on hold. Otherwise an agent working from its original brief can perform
   the action while the owner is still deciding.
8. Verify each unit from disk by reading the files and running the checks
   yourself. An agent's report is not proof.
9. When a written ownership contract (a committed plan, an orchestrator's
   brief or this division of files) does not give the agent the approach
   record's path, the agent puts the approach record in its reply instead of
   writing the file, and the orchestrator decides where it is kept.
10. Commit each verified unit at once, after auditing the staged paths against
   the full `git status`.
11. Judges see only the output and the rules: the plan, the intent, the package
    and the changed files. They never see builder notes.

## Loop limits

- At most three fresh rereads of the same output.
- At most one or two fix rounds per failing check.
- No recursion: an agent does not start agents of its own.
- Show the owner readable output early, such as the first rendered slice,
  before further rounds of refinement.

## Host notes

- **Claude Code:** subagents are role files in the plugin's agents folder,
  started with the Agent tool. Give each one its brief in full, because a fresh
  subagent sees nothing of the conversation.
- **Codex:** subagent roles are TOML files under `.codex/agents/`. Where the
  host requires the user's permission before spawning, spawn only after the
  user grants it. Without permission, run the units one after another and say
  so in the report.
- **Cursor:** Super-outer runs through its hook bridge. When Cursor runs
  several agents at once, give each agent its own worktree and file list under
  the same rules, and check Cursor's current documentation for how agents are
  started.

## Stop conditions

Stop and report when:

- a collision is detected;
- the evidence contradicts the committed plan;
- a unit still fails verification after its fix rounds;
- a loop limit is reached;
- a builder reports a conflict that needs a product or design decision.

## What to report

Report each unit's files and what changed, the checks you ran from disk with
their results, the commits made, any collisions with their snapshots, each
builder's deviation list, and every claim that remains unproved.
