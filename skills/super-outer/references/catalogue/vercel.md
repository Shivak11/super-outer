# Catalogue: Vercel

Each entry was checked against the official documentation on the date shown.
Before recommending an entry older than 30 days, run a fresh docs search and
update the date. Prices are not stored here; read the current pricing page.

## Observability and operations

- **Observability.** Performance and traffic views on every plan.
  Observability Plus adds more metrics, longer retention and Monitoring. Log
  retention is short, so long-term logs need a log drain. Docs:
  https://vercel.com/docs/observability
  checked: 2026-10-22

## Reliability and background work

- **Workflows.** A managed service for steps that pause and resume, built on
  the open-source Workflow SDK, for long jobs and AI agents. Docs:
  https://vercel.com/docs/workflows
  checked: 2026-10-22
- **Queues.** Durable delivery used underneath Workflows. Delivery is at least
  once, so each consumer must be safe to run twice. Its status was early when
  last reported, so confirm it is generally available before recommending.
  Guide: https://vercel.com/kb/guide/how-to-run-background-jobs-in-nextjs-on-vercel
  checked: 2026-10-22
- **Cron Jobs.** Time-based schedules for Vercel Functions, set in
  `vercel.json`. Use for work triggered by the clock, and queues for work
  triggered by a user. Docs: https://vercel.com/docs/cron-jobs
  checked: 2026-10-22

## AI and LLM systems, cost

- **AI Gateway.** One endpoint for many model providers, with budgets, usage
  monitoring, load balancing and fallbacks. Docs:
  https://vercel.com/docs/ai-gateway
  checked: 2026-10-22
