# Architecture pack: AI agent products and their harness

Researched: 2026-10-15. Revisit by: 2027-04-15 (6 months, a fast-moving area).
Confidence: medium, not `low_confidence`. Most rows rest on official documentation from model providers and framework maintainers, and on engineering posts by those teams from 2024 to 2026. Rows marked "judgement" have no sourced number, and the reason is given in the row. Three areas rest partly on vendor or secondary sources and say so in their rows: live co-editing, defences against poisoned memory, and the 2026 numbering of the OWASP list for LLM applications.

Contents:

- [Kind of system](#kind-of-system)
- [Known designs (designs)](#known-designs-designs)
- [Memory layers](#memory-layers)
- [Known failure moments (failure_moments)](#known-failure-moments-failuremoments)
- [Decide now or later (now_and_later)](#decide-now-or-later-nowandlater)
- [Stack options (stack_options)](#stack-options-stackoptions)
- [Sources](#sources)
- [Owner question candidates (router_question_candidate)](#owner-question-candidates-routerquestioncandidate)
- [Unknowns](#unknowns)
- [Repository evidence](#repository-evidence)

This pack is read by the [story walk](../story-walk.md) and pairs with the [agent library](../archetypes/ai-agent-product.json), which holds the owner's choices. Its sections match the architecture-mode output of the benchmark researcher agent (`super-outer:benchmark-researcher`). Source numbers in square brackets refer to the Sources table. Prices are never recorded here; read the pricing pages listed under stack options at decision time. Sign-in, uploads, payments, backups and regions come from the [web and mobile apps pack](web-and-mobile-apps.md), which this pack builds on.

## Kind of system

These are web products where a person works with an AI agent over days and weeks. The agent runs for minutes at a time, uses tools that change content the person owns, and is used across many sessions. Examples:

- a conversational builder that edits a course activity while the user talks to it;
- a study or support agent that remembers each user;
- a long-running research or coding agent.

Multiplayer games and simulations need their own packs.

The brief facts used here:

- a web app;
- professionals who return over days and weeks;
- an agent that edits structured content the user owns;
- runs that take minutes;
- one non-developer owner who directs the build through AI coding agents;
- a preference for managed services.

The research brief gave no user numbers, budget, region, kinds of sensitive data or acceptable data loss. Rows that depend on those facts say "if the brief says".

## Known designs (`designs`)

Simplest first. Each later design adds parts to the one above it.

1. **One agent loop inside a web request, one managed database and one model through a gateway, with messages saved after each turn.** This is the baseline. It fits runs that end well inside the host's request time limit and work that finishes within one session. On Vercel that limit is 300 seconds by default and 800 seconds at most on paid plans [1].
2. **The baseline plus a durable run.** The agent loop runs as a workflow whose steps are saved as they finish. The run continues after a closed tab, a failed step or a release, and the browser reconnects to the run's stream [8][9][12]. It fits runs that take minutes or wait for a person's approval.
3. **Plus memory beyond the conversation.** This means a short summary of each session, a preference record the user can see, and search over the user's own objects [21][41]. It fits users who come back over days.
4. **Plus versioned content and an activity log.** Every saved change becomes a revision with its author, time and run, and the user can read what changed and go back [37][44]. It fits agents that edit content the user owns.
5. **Plus evals and tracing.** A fixed set of real tasks with pass or fail checks runs before every prompt, tool or model change, and every run is traced [18][36]. It fits any product whose prompts or models change after launch.
6. **Plus live co-editing**, with the agent as one more editor of a shared document. It fits only when several people edit the same object at the same moment [65].
7. **Several agents**: a lead agent hands parts of the work to sub-agents that start with clean contexts. It fits broad tasks that do not fit in one agent's context. It uses about 15 times the tokens of a chat [32].
8. **A self-run durable engine or self-hosted models**, only when the budget or the law rules out managed services [47].

## Memory layers

| Layer | What it holds, for the customer | Where it is stored | How it is looked up | Who maintains it | Sources |
|---|---|---|---|---|---|
| Conversation | The messages and tool calls of the current chat | A messages table in the product's Postgres, keyed by chat. The workflow store is not the place, because Vercel keeps run data only 1, 7 or 30 days after a run ends, depending on plan | Loaded by chat id at each turn. Once the chat is long, older turns are replaced by a summary for the model, while the full chat stays on screen | The app saves after each turn. The model provider or the app writes the summary | [3][14][19] |
| Session state | Where a running job has got to: the step it reached, a pending approval, partial results | The durable workflow's event log, or a LangGraph checkpointer in Postgres | By run id or thread id, stored on the chat | The workflow engine. The app copies the outcome to Postgres when the run ends | [9][14][42] |
| Episodic | What happened in earlier sessions, such as "on Tuesday we rebuilt the scoring of the case activity" | One short summary row per session in Postgres, with the date, the objects touched and open items | By user and date, newest first, or by search over the summaries | A step at the end of each session writes it, outside the user's wait | [34][35][41] |
| Semantic | Facts about the user and their work: role, organisation, and the objects they own | A small profile document per user, plus the product's own tables | The profile is loaded into every run. Objects are found through search and read tools limited to that user's rows | The agent proposes changes through a memory tool or a background step. The user can see and correct them | [21][41][51][61] |
| Procedural and preferences | How the user wants things done, such as "always add an audio reflection", and the product's own instructions | Per-user preference entries in Postgres, shown on a memory page. Product instructions live in versioned prompt files the owner can read | Loaded into the instructions of every run | The user adds, edits and deletes entries. The agent saves an entry only after saying it will. The owner maintains the product instructions | [40][41][57] |

## Known failure moments (`failure_moments`)

The baseline is design 1: the agent loop inside a request, one database, one model, and messages saved after each turn.

| Moment for the customer | What goes wrong with the baseline | Smallest fix | Why | Sources |
|---|---|---|---|---|
| Talks to the agent in one chat for an hour | Every turn resends the whole history. Cost per turn rises, accuracy falls as the input grows, and the request fails at the context limit | Compaction: older turns are replaced by a summary for the model, recent turns stay word for word, and old tool results are cleared first. The full chat stays in the database for display | The model works from a short, current context, and the user still sees everything | [4][19][20][34][56] |
| Leaves midway and comes back three days later | The old chat reloads, but a new chat starts blank. The agent does not know what changed in the objects since. Run data kept only in the workflow store may have expired, after 1, 7 or 30 days depending on plan | Keep messages in Postgres. At the end of each session, write a short summary of what changed and what is open. On return, load the chat, the latest summary and the current state of the objects, and offer to continue | The agent resumes from recorded facts | [3][14][35][41][57] |
| Starts a four-minute run, then the tab closes or the network drops | A new page cannot rejoin a run that lives inside a request. The run also ends at the request time limit (300 seconds by default on Vercel) or when the server stops | Run the agent as a durable workflow and return the run id. The browser reconnects to the run's stream by that id and replays from where it dropped. The result is saved even when no browser is open | The run finishes on the server, and the user sees the result on return | [1][2][8][9][47] |
| Presses Stop because the agent misunderstood the request | Once streams can resume, closing the connection counts as a disconnect, so the agent keeps working and spending | A separate stop action that cancels the run, saves the partial answer and clears the chat's active-run marker. No automatic reconnect after a stop | Stop ends both the work and the cost | [2] |
| Sends a second message while the first run is still working | Two runs change the same object at once, or the second answer ignores the first | One active run per chat, with a fixed rule for new messages. The options are to queue them (the default in LangGraph's managed server), refuse them, or stop the current run and continue with the new message | Only one run changes a chat's objects at a time | [45][46] |
| The model provider has an outage, or a tool times out at step 9 of 14 | The whole run fails and the user starts again. A retried step can repeat a side effect, such as sending an email twice | Make each model call and tool call a step that is retried, three times by default in Vercel's Workflow SDK. On a 429, wait for the provider's retry-after. Pass each step's stable id to outside services as the idempotency key. Tell the agent when a tool fails, so it can choose another path. Route model calls through a gateway that can switch provider | The run resumes from the last finished step, and nothing happens twice | [10][11][13][15][32] |
| A run fails after rewriting six of ten questions | The object is left half changed, in a state neither the user nor the agent intended | Apply each change in one database transaction that also writes the new revision. With Supabase, use one Postgres function written as `security invoker`, so row-level security still applies. If a later step fails, a compensating step restores the previous revision | The object is either fully changed or unchanged | [10][62][63] |
| The agent says "done, all ten questions updated", but only seven changed | Agents sometimes report success without checking, and the user trusts the chat text | Show the change from the saved revision, as a list of what actually changed. A check step compares the result with the request before the agent reports done | The user sees what really happened | [33][35] |
| The agent produces content that does not fit the activity's structure | A malformed object saves, and the editor or the learner's view breaks | Use strict tool schemas and structured output. Validate against the same schema in code before saving, and return a clear error to the agent when validation fails | Only valid objects are saved | [5][23][49] |
| Says "this is not working" with no detail | The agent guesses and makes a second unwanted change, or asks an open question the user cannot answer. The owner cannot find what happened | The agent first gathers what it can itself: its last changes, any errors in the run, and the object's current state. Then it asks one question with two to four choices. The complaint is saved with the run's trace id | The user answers with one tap, and the owner can open the exact run | [38][57][58][59] |
| Says "do it like my Boeing activity" | The agent cannot see other objects. Or a tool written with the database's secret key can read every customer's objects, because that key bypasses row-level security | Search and read tools that run as the signed-in user, so row-level security limits results to objects they own or that were shared with them. Results return names and short summaries, with paging for large objects. The agent says which object it used | The agent finds the right example and cannot read another customer's work | [33][50][51][61] |
| Says "I always want an audio reflection at the end" | The preference is lost when the session ends, or it is saved where the user cannot see or correct it | A preference entry per user, saved after the agent says it will remember. Entries appear on a memory page where each one can be edited or deleted, and they are loaded into every run. Sensitive subjects are not saved by default | The habit carries across sessions, and the user stays in control of it | [21][40][41][57] |
| Pastes a client brief or uploads a file that contains hidden instructions | The model may follow them: it may change other objects, or send data out through a link or a tool | Treat uploads, pasted text and tool results as data, passed as user content and marked as untrusted. After reading them, the agent can use only tools limited to the current object. Nothing leaves the account without approval. Injected samples are part of the eval set | Injected text cannot cause a consequential action | [30][49][53][55] |
| Something the agent read last week keeps changing what it does | Injected or mistaken content written to memory affects every later session | Save memory only from the user's own statements or with the user's confirmation. Record the source and date of each entry, keep memory separate per user, expire unused entries, and let the user delete any entry | A bad entry stays visible and can be removed, and one user's memory never reaches another user | [21][40][54] |
| Wants the activity as it was last Tuesday, or wants to try two versions | An update overwrites the only copy, and undo exists only in the open tab | Every saved change, by the user or the agent, becomes a revision with author, time and run id. Restoring makes a new revision that copies an old one, and a branch copies the object. Each agent turn in the chat links to the revision it produced | Any earlier version can be reached in any later session, and a restore can itself be undone | [37][44][57] |
| Edits question 3 while the agent is rewriting the same activity | The last write wins, so one of the two changes is lost without notice | Each write carries the revision it was based on, and the database refuses the write if the object has changed since. This is the lost-update check that HTTP calls If-Match. The agent re-reads and re-applies its change, and the user sees a notice | No change is lost silently | [64][65] |
| The agent is about to delete a section or replace the whole activity | An agent with broad tools acts without asking, through a misunderstanding or injected text | Sort tools by consequence. Reads run freely. Reversible edits run and are shown. Deleting, replacing, publishing, sharing and sending wait for the user's approval, and the run can wait hours for it without losing its place. Tools reach only the object in hand | Destructive changes happen only with consent | [5][8][30][39][50] |
| One user's run loops for 200 steps, or one user starts hundreds of runs a day | Agents use about four times the tokens of a chat. WorkflowAgent and hand-written loops have no default step limit, and nothing caps a single user | A step limit on every loop. A per-run stop condition that adds up token use. A per-user allowance enforced in the app from recorded usage. Prompt caching of instructions and tool definitions. A gateway budget and the provider's spend limit as the final limit | The worst run and the heaviest user both have a known ceiling | [4][16][22][31][32][53] |
| On the 24th, every user's agent stops | The provider's monthly spend cap has been reached. Its 429 response carries no retry-after, so automatic retries keep failing until the month ends | Alerts as spend approaches the cap. Detect the spend-cap error and show a plain message instead of retrying: `enforced_spend_limit_reached` at Anthropic, or a 402 with `quota_for_entity_exceeded` at Vercel's gateway. Raise the tier before launch | The owner finds out before customers do, and nobody meets an unexplained failure | [16][24] |
| Asks what the AI company keeps from their work | The product cannot answer. By default Anthropic deletes API inputs and outputs within 30 days, or keeps them up to 2 years if they are flagged for policy review. OpenAI keeps abuse-monitoring logs up to 30 days, and stored Responses state for at least 30 days | Choose provider settings on purpose. Turn off provider-side storage where an option exists, and ask for zero data retention if a contract needs it. Avoid stateful provider features (stored files, batches, OpenAI Conversations) for user content. Publish a plain data page that names the providers and their retention | The answer is true and short | [26][27][28] |
| Deletes their account, or asks the agent to forget a project | Deleting the chat leaves memory entries, summaries, revisions, search indexes and traces. OpenAI's help centre tells its own users that deleting a chat does not delete memories saved from it | One deletion routine, keyed by user id, that covers chats, summaries, preference entries, revisions, search indexes and traces. Traces carry the user id so they can be found. The provider's retention window is the outer limit, and the data page states it | Deletion removes everything the product holds | [18][60][66] |
| A prompt edit or a model change makes the agent quietly worse | Nobody notices until users complain, and the owner cannot judge from code | 20 to 50 real tasks drawn from real failures, each with a pass or fail check, run before every prompt, tool or model change. Read a sample of transcripts. For customer-facing work, check that repeated attempts at the same task all pass | Regressions are caught before users meet them | [30][36] |
| Asks why the agent changed the scoring, or the owner asks what happened | Nothing records what the agent saw, which tools it called, or why | Trace every run (model calls, tool calls, tokens, cost and errors) with run, chat and user ids. Show the user an activity log per object: what changed, whether the agent or a person changed it, in which run, and the agent's one-line reason. The owner opens the trace from the log. Decide whether traces keep message content | The user sees why, and the owner can find the cause | [18][32][57][59][68] |
| The provider retires the model the product uses, or a new model behaves differently | Requests to a retired model fail. Anthropic gives at least 60 days' notice. OpenAI gives at least 6 months for generally available models, 3 months for specialised ones, and as little as 2 weeks for previews | Name each model id in one configuration place. Run the eval set on the replacement before switching. Keep a tested fallback model in the gateway. Note the retirement dates | Model changes happen on the owner's schedule, after the evals pass | [15][25][29][36] |
| A release goes out while a user's ten-minute run is midway | On a host that restarts servers on release, a run inside a request ends. Once runs are durable, a paused run could resume into code whose steps have changed | Durable runs stay on the deployment that started them, while new runs use the new code. To fix a bug in runs already in progress, cancel them and rerun them on the latest deployment | Releases do not break a run midway | [12][32] |
| Five hundred users start runs at 9 am on Monday | The provider returns 429 when requests or tokens per minute pass the tier's limit. A sharp jump in traffic can also trigger acceleration limits, so runs fail at the busiest hour | Runs wait in the workflow queue. A model step that receives a 429 waits for retry-after instead of failing. Use prompt caching, because cached input does not count toward Anthropic's input-token limit on most models. Request a higher tier before launch | Busy hours slow runs down instead of failing them | [13][14][17][22][24][48] |

## Decide now or later (`now_and_later`)

### Decide now, each conditioned on a fact in the brief

| If the brief says | Add now | Sources |
|---|---|---|
| Runs take minutes | A durable run with a resumable stream, a separate Stop action, and one active run per chat. An explicit step limit on every loop, because WorkflowAgent has none by default | [1][2][4][8][9][45] |
| The agent edits content the user owns | A revision per saved change with author and run id, one transaction per apply step, schema validation before saving, a version check that refuses stale writes, and an activity log the user can read | [23][37][63][64] |
| The agent can delete, replace, publish, share or send | Approval before those tools run, with the run waiting durably for the answer | [5][8][39][50] |
| The agent refers to the user's other work | Search and read tools that run as the signed-in user under row-level security | [50][51][61] |
| Users return over days and weeks | Messages kept in Postgres, a short summary per session, and a preference record the user can see, edit and delete | [3][14][40][41] |
| The agent reads uploads, pasted text, web pages or email | Untrusted content handled as data, tools limited after reading it, approval for anything that leaves the account, and injected samples in the eval set | [30][49][55] |
| A non-developer owner directs the build | An eval set of 20 to 50 real tasks run before every change, tracing with run, chat and user ids, and one place that names every model id | [18][25][36] |
| Each run costs money (always) | A step limit, a per-run token stop, a per-user allowance in the app, prompt caching, and a gateway budget plus the provider's spend limit, with alerts | [4][16][22][24] |
| Users' content goes to a hosted model (always) | A plain data page naming the providers and their retention, provider-side storage turned off where possible, and one deletion routine that also covers memory and traces | [26][28][60] |
| The brief names sensitive data, such as health, finance or children's data, or a customer contract asks for it | Zero data retention or an equivalent arrangement with the provider, trace content recording turned off, and a check of which provider features fall outside that arrangement | [18][27][28] |
| Data must stay in a country | Regions for the app, database and workflow chosen at creation, as in the web pack, and a check of the model provider's regional processing options, which this pack did not verify | web pack [5][11]; [24] |

### Later, each with a measured trigger

| Add later | When | Source of the threshold |
|---|---|---|
| Live co-editing, with the agent as one more editor of a shared document | Several people edit the same object at the same time, or refused stale writes counted per week become a regular complaint | Judgement. Vendor write-ups describe the pattern and give no number [65]. The version check from the now rows makes collisions countable |
| Child workflows for long runs | A run passes about 2,000 events or 1 GB of stored state | Vercel's Workflow limits page [14] |
| Search over session summaries by meaning | Eval tasks that refer to older sessions fail, or one user's summaries no longer fit in a single tool result | Judgement. No source gives a session count |
| Search across a user's objects by meaning | Eval tasks of the "do it like my earlier activity" kind fail with name and keyword search | Judgement. When this is added, keep the index separated by user [51] |
| Memories extracted in the background | Users repeat preferences the agent should already know, or eval tasks about remembered preferences fail | Judgement. Background writing and its trade-offs are described in [41] |
| A fallback model from a second provider | Provider outages or 429s delay or fail runs often enough to show in weekly counts | Judgement. The fallback must pass the same eval set first [36] |
| A higher provider tier or priority capacity | Peak tokens per minute approach the tier's limit on the provider's usage charts | Judgement on how close is too close. The provider publishes the limits and the charts [24] |
| Several agents with sub-agents | One agent's context fills within a single run, and eval tasks on broad work fail | Judgement. Multi-agent systems use about 15 times the tokens of chat [32] |
| A self-run durable engine or self-hosted models | The budget or the law rules out managed services | Judgement |

### The baseline row

| Brief | Design |
|---|---|
| An agent whose runs finish well inside a minute, within one session, and that changes nothing the user owns | One managed app, one managed database and one model through a gateway, with the agent loop inside the request, a step limit, and messages saved after each turn |

A brief with runs that take minutes, users who return over weeks and an agent that edits content they own does not end at the baseline. Its design is designs 2 to 5: the baseline plus a durable run, memory beyond the conversation, versioned content with an activity log, and evals with tracing. This is a judgement drawn from the rows above.

## Stack options (`stack_options`)

When the project already has a stack, keep it unless a walk failure requires a change. For a new product, the options below are listed in order of fit to this pack's fixes.

| Option | Fits when | Trade-off | Pricing pages |
|---|---|---|---|
| **Recommended.** A Next.js web app on Vercel. AI SDK 7 with `WorkflowAgent` on Vercel Workflows for durable runs, approvals that wait and resumable streams. Vercel AI Gateway for model routing, provider fallback and spend budgets. A Supabase Postgres database with row-level security for conversations, summaries, preferences, revisions and the activity log. Langfuse for traces, user feedback and deletion by user | It matches a stated preference for managed services and carries the now rows: durable runs [8][9], step limits [4], approvals [5], telemetry [18], budgets [16] and row-level security [61] | The product depends on four vendors: Vercel, Supabase, Langfuse and the model provider. The workflow store keeps run data only 1, 7 or 30 days after a run ends, so outcomes must be copied to Postgres [14]. AI SDK 7 renamed several APIs in June 2026, so AI coding agents will often write the version 5 and 6 names (`stepCountIs`, `needsApproval`, `experimental_telemetry`). The codemods and current docs correct this [6]. The app must enforce one active run per chat itself. Gateway budgets cap the team, project, API key or Vercel team member, not each end user [16]. The data leaves with standard Postgres tools. The `ai` package had about 126 million npm downloads in the month to 2026-10-12 [67] | vercel.com/pricing, vercel.com/docs/workflows/pricing, vercel.com/docs/ai-gateway/pricing, supabase.com/pricing, langfuse.com/pricing, and the model provider's page, such as platform.claude.com/docs/en/about-claude/pricing |
| **Runner-up.** LangGraph (TypeScript or Python) on LangSmith Deployment, with LangSmith tracing and evals, and a Supabase Postgres database for product data | A team that wants one managed runtime with checkpoints per thread, time travel and forks, approval interrupts, a long-term memory store, and a choice of rules for a second message during a run [42][43][44][45][46] | There are more framework concepts to learn. Run state and memory sit in the platform's own database, apart from the product data. The second-message rules exist only on the managed platform [45]. The web app still needs its own host. `@langchain/langgraph` had about 16 million npm downloads in the same month [67], so coding agents have seen fewer examples of it | langchain.com/pricing, supabase.com/pricing, and the web host's pricing page |

React, Next.js, TypeScript and PostgreSQL are among the most used tools, and AI coding agents write well-represented languages and tools more correctly (web pack sources 30 and 31). Popularity ranks these options; it is never the evidence that a design is correct.

## Sources

Every row was read on 2026-10-15. Grades use the classifications in the benchmark researcher's contract.

| # | Source | Date | Grade | Limitation |
|---|---|---|---|---|
| 1 | Vercel, Vercel Functions limits, vercel.com/docs/functions/limitations | updated 2026-08-24 | official_platform | One host. 300 s default, 800 s maximum on Pro and Enterprise, 1,800 s in beta |
| 2 | AI SDK, Chatbot resume streams, ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams | no page date | official_platform | Needs a Redis-backed stream store. A plain abort does not stop generation |
| 3 | AI SDK, Chatbot message persistence, ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence | no page date | official_platform | The example stores JSON files; production needs a database |
| 4 | AI SDK, Loop control, ai-sdk.dev/docs/agents/loop-control | no page date | official_platform | ToolLoopAgent stops at 20 steps by default. WorkflowAgent has no default |
| 5 | AI SDK, Tools and tool calling, ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling | no page date | official_platform | `toolApproval` replaces the deprecated `needsApproval` |
| 6 | AI SDK, Migrate AI SDK 6.x to 7.0, ai-sdk.dev/docs/migration-guides/migration-guide-7-0 | AI SDK 7 | official_platform | Renames `stepCountIs`, `experimental_telemetry` and `onFinish` |
| 7 | Vercel, AI SDK 7 is now available, vercel.com/changelog/ai-sdk-7 | 2026-06-25 | official_platform | Announcement. Requires Node.js 22 |
| 8 | Vercel, How to migrate from DurableAgent to WorkflowAgent, vercel.com/kb/guide/durableagent-to-workflowagent | 2026-06-25 | official_platform | Still shows `needsApproval` on tools |
| 9 | Workflow SDK, Resumable streams, workflow-sdk.dev/docs/ai/resumable-streams | updated 2026-10-13 | official_platform | Stream retention is not stated on the page |
| 10 | Workflow SDK, Errors and retrying, workflow-sdk.dev/docs/foundations/errors-and-retries | updated 2026-10-15 | official_platform | Three retries by default. Compensating steps go in the catch block |
| 11 | Workflow SDK, Idempotency, workflow-sdk.dev/docs/foundations/idempotency | updated 2026-10-13 | official_platform | The outside service must accept an idempotency key |
| 12 | Workflow SDK, Versioning, workflow-sdk.dev/docs/foundations/versioning | updated 2026-10-13 | official_platform | Rerunning on "latest" is Vercel-specific |
| 13 | Workflow SDK, Rate limiting, workflow-sdk.dev/cookbook/common-patterns/rate-limiting | updated 2026-10-13 | official_platform | No concurrency cap is described |
| 14 | Vercel, Workflow pricing and limits, vercel.com/docs/workflows/pricing | updated 2026-09-16 | official_platform | Run data kept 1, 7 or 30 days after completion, by plan. Replay slows past about 2,000 events |
| 15 | Vercel, AI Gateway, vercel.com/docs/ai-gateway | updated 2026-09-14 | official_platform | One gateway |
| 16 | Vercel, AI Gateway budgets and spend limits, vercel.com/docs/ai-gateway/observability-and-spend/budgets | updated 2026-09-10 | official_platform | Soft cap. Scopes are team, project, API key and Vercel team member, not end users |
| 17 | Vercel, AI Gateway rate limits, vercel.com/docs/ai-gateway/rate-limits | updated 2026-09-08 | official_platform | Provider limits still apply on the paid tier |
| 18 | AI SDK, Telemetry, ai-sdk.dev/docs/ai-sdk-core/telemetry | no page date | official_platform | Once registered, it records inputs and outputs by default |
| 19 | Anthropic, Compaction overview, platform.claude.com/docs/en/build-with-claude/compaction | no page date | official_platform | Beta. One provider |
| 20 | Anthropic, Context editing, platform.claude.com/docs/en/build-with-claude/context-editing | no page date | official_platform | Beta. Default trigger is 100,000 input tokens |
| 21 | Anthropic, Memory tool, platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool | no page date | official_platform | Runs client-side, so the app stores and protects the memory |
| 22 | Anthropic, Prompt caching, platform.claude.com/docs/en/build-with-claude/prompt-caching | no page date | official_platform | The cache lasts 5 minutes by default, or 1 hour |
| 23 | Anthropic, Structured outputs, platform.claude.com/docs/en/build-with-claude/structured-outputs | no page date | official_platform | Refusals and truncation can break the schema |
| 24 | Anthropic, Rate limits, platform.claude.com/docs/en/api/rate-limits | no page date | official_platform | The spend-cap 429 has no retry-after |
| 25 | Anthropic, Model deprecations, platform.claude.com/docs/en/about-claude/model-deprecations | latest entry 2026-09-30 | official_platform | At least 60 days' notice |
| 26 | Anthropic Privacy Center, How long do you store my organization's data?, privacy.claude.com/en/articles/7996866 | updated 2026-07-01 | official_platform | 30 days by default; up to 2 years if flagged |
| 27 | Anthropic, API and data retention, platform.claude.com/docs/en/manage-claude/api-and-data-retention | no page date | official_platform | Batch, Files and code execution fall outside zero data retention |
| 28 | OpenAI, Data controls in the OpenAI platform, developers.openai.com/api/docs/guides/your-data | no page date | official_platform | Conversations are kept until deleted and are not eligible for zero data retention |
| 29 | OpenAI, Deprecations, developers.openai.com/api/docs/deprecations | latest entry 2026-10-14 | official_platform | At least 6 months' notice for generally available models |
| 30 | OpenAI, Safety in building agents, developers.openai.com/api/docs/guides/agent-builder-safety | no page date | official_platform | Written for Agent Builder, which closes on 2026-11-30. The guidance itself is general |
| 31 | Anthropic, Building effective agents, anthropic.com/engineering/building-effective-agents | 2024-12-19 | evidence_backed_practice | Stopping conditions and checkpoints |
| 32 | Anthropic, How we built our multi-agent research system, anthropic.com/engineering/multi-agent-research-system | 2025-06-13 | evidence_backed_practice | One company's system. Source of the 4× and 15× token figures |
| 33 | Anthropic, Writing effective tools for agents, anthropic.com/engineering/writing-tools-for-agents | 2025-09-11 | evidence_backed_practice | The 25,000-token cap it mentions is Claude Code's own default |
| 34 | Anthropic, Effective context engineering for AI agents, anthropic.com/engineering/effective-context-engineering-for-ai-agents | 2025-09-29 | evidence_backed_practice | Techniques without thresholds |
| 35 | Anthropic, Effective harnesses for long-running agents, anthropic.com/engineering/effective-harnesses-for-long-running-agents | 2025-11-26 | evidence_backed_practice | Written about coding agents |
| 36 | Anthropic, Demystifying evals for AI agents, anthropic.com/engineering/demystifying-evals-for-ai-agents | 2026-01-09 | evidence_backed_practice | Recommends starting with 20 to 50 tasks |
| 37 | Claude Code, Checkpointing, code.claude.com/docs/en/checkpointing | no page date | official_platform | One product's undo: 100 checkpoints per session, kept about 30 days |
| 38 | Claude Agent SDK, Handle approvals and user input, code.claude.com/docs/en/agent-sdk/user-input | no page date | official_platform | Read through a search extract. Two to four options per question |
| 39 | Claude Agent SDK, Configure permissions, code.claude.com/docs/en/agent-sdk/permissions | no page date | official_platform | Built for coding-agent tools; the order of checks transfers |
| 40 | Claude, Claude's memory works everywhere, and you decide what's in it, claude.com/blog/claudes-memory-works-everywhere-and-you-decide-whats-in-it | 2026-08-25 | evidence_backed_practice | One shipped consumer product |
| 41 | LangChain, Memory overview, docs.langchain.com/oss/javascript/concepts/memory | no page date | official_platform | Framework concepts |
| 42 | LangChain, LangGraph persistence, docs.langchain.com/oss/javascript/langgraph/persistence | no page date | official_platform | One framework |
| 43 | LangChain, LangGraph interrupts, docs.langchain.com/oss/javascript/langgraph/interrupts | no page date | official_platform | Steps before an interrupt run again on resume |
| 44 | LangChain, LangGraph time travel, docs.langchain.com/oss/javascript/langgraph/use-time-travel | no page date | official_platform | Covers agent state, not product content |
| 45 | LangChain, Double texting, docs.langchain.com/langsmith/double-texting | no page date | official_platform | Managed deployment only |
| 46 | LangChain, Agent Server, docs.langchain.com/langsmith/agent-server | no page date | official_platform | At most one run per thread |
| 47 | Temporal, Durable execution meets AI, temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai | 2025-07-10 | evidence_backed_practice | Vendor blog |
| 48 | Temporal, Rate-limit downstream APIs with separate task queues, docs.temporal.io/guides/rate-limit-downstream-apis | no page date | official_platform | One engine |
| 49 | OWASP, LLM01:2025 Prompt injection, genai.owasp.org/llmrisk/llm01-prompt-injection | 2025 | evidence_backed_practice | 2025 text. No method fully prevents injection |
| 50 | OWASP, LLM06:2025 Excessive agency, genai.owasp.org/llmrisk/llm062025-excessive-agency | 2025 | evidence_backed_practice | 2025 text. It is LLM03 in the 2026 list |
| 51 | OWASP, LLM08:2025 Vector and embedding weaknesses, genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses | 2025 | evidence_backed_practice | 2025 text. It is LLM09 in the 2026 list |
| 52 | OWASP, Top 10 for LLM applications 2026, genai.owasp.org/resource/owasp-genai-llm-top-10-2026 | 2026-08-03 | evidence_backed_practice | The page does not list the entries; the numbering was read in [53] |
| 53 | Cloud Security Alliance, research note on the OWASP 2026 LLM Top 10, labs.cloudsecurityalliance.org/research/csa-research-note-owasp-genai-top10-2026-agent-control-stand | 2026-09-04 | evidence_backed_practice | Secondary summary, used only for the 2026 numbering |
| 54 | OWASP, Top 10 for Agentic Applications launch post, genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai | 2025-12-09 | evidence_backed_practice | Names ASI06, memory and context poisoning. Mitigations are not on the page |
| 55 | Beurer-Kellner et al., Design patterns for securing LLM agents against prompt injections, arxiv.org/abs/2506.08837 | v3 2025-06-27 | evidence_backed_practice | Research paper |
| 56 | Hong, Troynikov and Huber, Context rot, trychroma.com/research/context-rot | 2025-07-14 | evidence_backed_practice | Vendor research on 18 models |
| 57 | Amershi et al., Guidelines for human-AI interaction, CHI 2019; microsoft.com/en-us/haxtoolkit/library | 2019 | evidence_backed_practice | Guidelines G9, G10, G11, G12, G13, G14, G15 and G17 are used |
| 58 | Google PAIR, People + AI Guidebook: Errors and graceful failure, pair.withgoogle.com/chapter/errors-failing | no page date | evidence_backed_practice | Guidance |
| 59 | Langfuse, User feedback, langfuse.com/docs/observability/features/user-feedback | no page date | official_platform | One tracing tool |
| 60 | Langfuse, Data deletion, langfuse.com/docs/administration/data-deletion | no page date | official_platform | Deleting by user leaves datasets in place |
| 61 | Supabase, Row level security, supabase.com/docs/guides/database/postgres/row-level-security | no page date | official_platform | The secret key bypasses it |
| 62 | Supabase, Database functions, supabase.com/docs/guides/database/functions | no page date | official_platform | Prefers security invoker |
| 63 | PostgreSQL, Transactions, postgresql.org/docs/current/tutorial-transactions.html | version 18.6 | official_platform | None |
| 64 | IETF, RFC 9110 HTTP Semantics, section 13.1.1 If-Match, rfc-editor.org/rfc/rfc9110 | 2022-06 | binding_or_normative | Binds HTTP conditional requests. Applied here to database writes by analogy |
| 65 | Sam Willis (Electric), AI agents as CRDT peers with Yjs, electric.ax/blog/2026/04/08/ai-agents-as-crdt-peers-with-yjs | 2026-04-08 | evidence_backed_practice | Vendor reference implementation with no independent evaluation |
| 66 | OpenAI Help Center, Memory FAQ, help.openai.com/en/articles/8590148 | no page date | official_platform | Read through a search extract; the direct fetch was refused |
| 67 | npm downloads API, api.npmjs.org/downloads/point/last-month/ai and /@langchain%2Flanggraph | 2026-09-13 to 2026-10-12 | evidence_backed_practice | Counts include automated installs. Ranks options only |
| 68 | OpenTelemetry, Generative AI semantic conventions, opentelemetry.io/docs/specs/semconv/gen-ai | no page date | official_platform | Moved to a dedicated repository. Status is Development |

## Owner question candidates (`router_question_candidate`)

Each question is for the router to ask in the story's terms. The recommended answer is the default that "yes" accepts.

1. When someone closes the tab during a run, should the agent finish the job and show the result when they come back? Recommended: yes.
2. Before the agent deletes or replaces a whole section, or publishes or shares anything, should it ask first? Recommended: ask for those, and make reversible edits straight away and show them.
3. When a user comes back after a week, should the agent already know what you did together last time? Recommended: yes, from a short summary of each recent session.
4. Should users be able to see, change and delete what the agent remembers about them? Recommended: yes, on a memory page, with nothing sensitive saved by default.
5. What can you spend on AI per user per month, and what should happen when someone reaches that figure? You name the figure. Recommended behaviour: warn the user as they approach it, let the run in progress finish, and pause new runs until the next period.
6. If a user and the agent change the same activity at the same moment, what should happen? Recommended: neither change is lost. The agent re-reads and tries again, and the user sees a notice.
7. When a user mentions their other work, may the agent open it? Recommended: yes, but only their own work and work shared with them, and the agent names what it opened.
8. If a user sends a new message while the agent is still working, should the agent wait, stop and switch, or refuse? Recommended: queue the message, and show a button that stops the current run and uses the new message.
9. What should users be told about what the AI company keeps? Recommended: name the provider and its retention on a plain data page, and turn off provider-side storage where possible.
10. When you fix a problem, should you be able to read the conversation that caused it? Recommended: yes, for a short fixed period, with access limited to you, and deleted with the user's account.

## Unknowns

- **User numbers.** The research brief gives no figures for launch, 12 months or the busiest hour. These decide the provider tier and when the later rows come due.
- **Budget per user per month.** It decides the allowance and the model choice.
- **Where users are and what sensitive data they bring.** These decide zero data retention, regional processing and which law applies. If users are in India, the web pack covers the DPDP Act.
- **Acceptable data loss.** The web pack's point-in-time recovery row applies.
- **Which model provider.** Retention periods and retirement notice differ between providers [25][26][28][29].
- **Whether objects are shared between users or teams.** It decides the permission model and whether live co-editing comes due.
- **Whether the agent sends anything outside the product**, such as email or publishing to another system. It decides the approval list.
- **AI SDK approval naming.** The 6-to-7 migration guide deprecates `needsApproval` in favour of `toolApproval` [6]. The WorkflowAgent guide from the same day still sets `needsApproval` on tools [8]. Check the installed version's types before building.
- **Concurrent runs per user.** The Workflow SDK documents no cap [13], so any per-user concurrency limit has to be built in the app.
- **OWASP sources.** The 2026 numbering was read only through a secondary summary [52][53]. The mitigations for poisoned memory come from Anthropic's memory tool page, not from OWASP's own text [21][54].

Scope and query privacy: every search used generic terms about AI agent products. No product, company or customer names were sent.

## Repository evidence

The agent library's `lookFor` terms come from this table. A moment counts as handled when one of its terms appears in source code that uses it. Super-outer's check follows these rules:

- **Exclusions.** It skips `.engineering/super-outer/`, `skills/super-outer/`, `docs/`, Markdown files, `package.json` and lockfiles, because records and manifests name APIs that the code may not use.
- **Renamed APIs.** Where an API was renamed, both names count.
- **Weak terms.** Terms marked weak can also appear when the moment is not handled, so the library leaves them out.
- **Missing matches.** No match means unknown: the walk asks the owner. It does not mean the moment is unhandled.

| Moment | Terms that appear only when it is handled | Notes |
|---|---|---|
| Talks in one chat for an hour | `pruneMessages`, `compact-2026-09-04`, `clear_tool_uses_20250919`, `compact_20260112` | The last three are Anthropic request values |
| Comes back three days later | `validateUIMessages`, `prepareSendMessagesRequest`, `PostgresSaver`, `AsyncPostgresSaver` | These show saved chats; session summaries have no standard name |
| Tab closes during a four-minute run | `WorkflowChatTransport`, `x-workflow-run-id`, `createResumableStreamContext`, `resumeExistingStream` | `WorkflowChatTransport` is imported from `@ai-sdk/workflow`, or from the deprecated `@workflow/ai` |
| Presses Stop | `activeStreamId`, `runs.cancel` (weak) | The stop route has no standard name |
| Second message during a run | `multitaskStrategy`, `multitask_strategy` | No standard name exists on the AI SDK stack |
| Provider outage or tool timeout | `RetryableError`, `FatalError`, `getStepMetadata` | |
| Half-applied change | `security invoker` in a migration that defines the apply function, plus `.rpc(` (both weak) | No library identifier exists |
| Says done when it is not | `jsondiffpatch`, `fast-json-patch`, `diffWords` (all weak) | These show that a diff is computed, not that the agent's report uses it |
| Content breaks the structure | `repairToolCall`, `InvalidToolInputError`, `zodOutputFormat`, `Output.object(` | `InvalidToolArgumentsError` is the AI SDK 4 name |
| "This is not working" | `AskUserQuestion`, `LangfuseBrowserClient`, `"user-feedback"`, `create_score` | `AskUserQuestion` exists only in the Claude Agent SDK. `"user-feedback"` is the score name in Langfuse's docs |
| "Do it like my Boeing activity" | `match_documents` | `enable row level security` and `auth.uid()` appear in almost any Supabase app; `service_role` or a secret key inside agent tool code means the moment is not handled |
| "I always want an audio reflection" | `memory_20250818`, `betaMemoryTool`, `BetaLocalFilesystemMemoryTool`, `PostgresStore` (weak) | These show that memory exists, not that users can see and delete it |
| Hidden instructions in an upload | `activeTools` (weak), `toolApproval`, `needsApproval` | No standard term exists for marking content as untrusted |
| Poisoned memory | `memory_20250818` together with a `/memories` path check (weak) | No reliable term; ask the owner |
| Going back to last Tuesday | `getStateHistory`, `get_state_history`, `Y.snapshot` | A revisions table has no standard name |
| Same object edited at once | `If-Match`, `new Y.Doc`, `y-prosemirror`, `@liveblocks/` | |
| Destructive change | `toolApproval`, `needsApproval`, `addToolApprovalResponse`, `canUseTool` | |
| Runaway run or heavy user | `isStepCount`, `stepCountIs`, `maxTurns`, `recursionLimit` | `maxSteps` is the AI SDK 4 name and also counts |
| Monthly spend cap reached | `enforced_spend_limit_reached`, `quota_for_entity_exceeded` | |
| What the AI company keeps | `store: false`, `inference_geo` (both weak) | A data page has no code term |
| Account deletion | `api/public/traces`, `references auth.users on delete cascade` | |
| Quietly worse after a change | `promptfoo`, `evalite`, `langsmith/evaluation`, `braintrust` | Count these only when a CI job runs them |
| "Why did it change the scoring?" | `registerTelemetry`, `experimental_telemetry`, `LangfuseSpanProcessor`, `LangfuseVercelAiSdkIntegration` | The user-facing activity log has no standard name |
| Model retirement | No reliable term | Check that model ids such as `claude-` or `gpt-` appear in one configuration file only, and that the eval terms above are present |
| Release during a run | `"use workflow"`, `deploymentId: "latest"`, `@temporalio/workflow` | Durable runs are pinned to their deployment by default |
| 9 am rush | `retryAfter`, `cache_control`, `cacheControl`, `maxTaskQueueActivitiesPerSecond` | `retryAfter` counts only when it is passed to `RetryableError` |
