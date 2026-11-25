# Sources behind the engineering approach

These are the sources behind the three lines of the
[engineering approach](engineering-approach.md). They were read on
14 September 2026 unless a row says otherwise. The rows cite official Anthropic
and OpenAI material, two independent studies marked as such, and two workspace
records. Each row gives one rule and the source it rests on. Quotations are
exact.

## See: what the agent can run and see before it builds

| Rule | Source | Date |
|---|---|---|
| Agree the testable criteria before implementation, and give the evaluator the running app in the user's medium. The evaluator "negotiates a sprint contract" and uses Playwright to click through the app. | Anthropic, Harness design for long-running application development (Prithvi Rajasekaran) | 2026-03-24 |
| Separate the check from the builder. "Separating generation from evaluation proves essential", because "tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work." | Same post | 2026-03-24 |
| The check is worth its cost when the medium matters. Solo agent: 20 minutes and $9 for a game that did not respond to keys; full harness: 6 hours and $200 for a playable one. | Same post | 2026-03-24 |
| Write the feature list first with each feature "initially marked as 'failing'", and verify end to end with browser automation rather than unit tests alone. | Anthropic, Effective harnesses for long-running agents (Justin Young) | 2025-11-26 |
| Expect these failures without a harness: one-shot attempts that exhaust context, premature "complete", features marked done "without proper testing", environments left broken. | Same post | 2025-11-26 |
| Record the assumption each check encodes. "Harnesses encode assumptions about what Claude can't do on its own", and those assumptions go stale as models improve. | Anthropic, Scaling Managed Agents | 2026-04-08 |
| Environments, intent and feedback loops are the three parts of a harness. | OpenAI, Harness engineering (Ryan Lopopolo); page returned HTTP 403 on 14 September 2026, cited from the workspace ledger's checked copy | 2026-02-11 |
| Name the files the builder may not edit. Independent: o3 modified tests or scoring in 30.4% of RE-Bench runs. | METR, Recent reward hacking (independent) | 2025-06-05 |
| A hidden preview pane and a headless shell under a virtual time budget run almost no animation frames, so they can render a state and prove nothing about input or motion. | Workspace evidence: exercise 1.1 of the Writing for AI course, first Phaser build passed every headless capture and failed its first real drag | 2026-09-04 |

## Stop: what continues the work and what ends it

| Rule | Source | Date |
|---|---|---|
| A loop is "agents repeating cycles of work until a stop condition is met." Four kinds: turn-based, goal-based, time-based, proactive. | Anthropic, Loop engineering: getting started with loops (Delba de Oliveira, Michael Segner) | 2026-06-30 |
| "Define clear success and stop criteria." Set token boundaries. Pilot workflows on small slices. | Same post | 2026-06-30 |
| Use a fresh judge. "A reviewer with fresh context is less biased and not influenced by the main agent's reasoning." | Same post | 2026-06-30 |
| The `/goal` evaluator reads the conversation only and "doesn't run commands or read files independently", so the condition must name a command whose output appears in the transcript, and should carry a clause such as "or stop after 20 turns". | Claude Code documentation, Keep Claude working toward a goal | read 2026-09-14 |
| Loop only where "we have clear evaluation criteria, and when iterative refinement provides measurable value." Add complexity "only when it demonstrably improves outcomes." | Anthropic, Building effective agents | 2024-12-19 |
| Every run needs an exit: "tool calls, a certain structured output, errors, or reaching a maximum number of turns." | OpenAI, A practical guide to building agents (PDF) | 2025 |
| Hand control to a person on two triggers: "exceeding failure thresholds" and "high-risk actions". | Same guide | 2025 |
| A reviewed loop is the safe default: "the system proposes the change set and a developer approves the diff before merge." | OpenAI Cookbook, Build an agent improvement loop with traces, evals and Codex | read 2026-09-14 |
| Two long Codex goals ran with no token budget and ended blocked, at 42,563,440 and 1,661,079 tokens. | Workspace audit of 13 September 2026 | 2026-09-13 |

## Shape: how many agents, and who checks whom

| Rule | Source | Date |
|---|---|---|
| The named shapes: prompt chaining, routing, parallelization (sectioning and voting), orchestrator-workers, evaluator-optimizer. Workflows for predictability; agents when the steps cannot be predicted. | Anthropic, Building effective agents | 2024-12-19 |
| Many agents are worth their cost on breadth-first work with independent directions. "Most coding tasks involve fewer truly parallelizable tasks than research." Multi-agent systems use about 15 times the tokens of a chat. | Anthropic, How we built our multi-agent research system | 2025-06-13 |
| Grade the end state, not every step, and use a judge against a rubric. | Same post | 2025-06-13 |
| A sub-agent returns "only a condensed, distilled summary of its work" so the coordinator's context stays clean. | Anthropic, Effective context engineering for AI agents | 2025-09-29 |
| "Grade what the agent produced, not the path it took." Code graders are cheap and brittle; model graders need calibration; a 0% pass rate "is most often a signal of a broken task." | Anthropic, Demystifying evals for AI agents | 2026-01-09 |
| A workflow script holds the plan. "No mid-run user input", so sign-off goes between runs. Up to 16 concurrent agents, 1,000 per run, `medium` guideline under 15. The quality pattern is independent agents that "adversarially review each other's findings before they're reported." | Claude Code documentation, Orchestrate subagents at scale with dynamic workflows | read 2026-09-14 |
| "Our general recommendation is to maximize a single agent's capabilities first." Two multi-agent shapes: manager (agents as tools) and decentralized (handoffs). "Multi-agent systems can be modeled as graphs, with agents represented as nodes." | OpenAI, A practical guide to building agents (PDF) | 2025 |
| Orchestrate by an LLM for open-ended work, by code for predictable cost and speed; run independent tasks in parallel; add evaluator feedback loops. | OpenAI Agents SDK documentation, Orchestrating multiple agents | read 2026-09-14 |
| Do not give the judge the builder's context. One speaker would be "very hesitant", because the model convinces itself the work is fine and that passes to the judge. The talk does not say the team stopped or went back. | Anthropic applied AI, Build Agents That Run for Hours, AI Engineer Europe, from 1:00:05; transcript checked 13 and 14 September 2026 | 2026-05-18 |
| Independent: every multi-agent variant did 39% to 70% worse on sequential planning. | Google Research, Towards a science of scaling agent systems (independent) | 2026-01-28 |

## What the names are

"Harness engineering" was named by Mitchell Hashimoto on 5 February 2026 and used as a title by OpenAI on 11 February 2026. "Loop engineering" is Addy Osmani's title of 7 June 2026, and Anthropic's guide of 30 June 2026. "Graph engineering" is not a first-party term: it spread from joke posts on X on 18 July 2026, and the feature it points at is Claude Code's dynamic workflows, released on 28 May 2026. All three names describe mechanisms that predate them.
