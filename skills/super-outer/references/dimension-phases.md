# Dimensions by phase

Engineering dimensions open at the phase of the product where they start to
matter, so the twelve are never interviewed all at once. The phase comes from
the project facts that the router reads (the deploy config, whether
observability is on, the product brief anchors and fired ledger triggers) and
from the brief.

| Phase | Dimensions it opens |
|---|---|
| First deploy | Observability and operations, delivery and release |
| First outside users | Scale, performance and cost; security, privacy and abuse (abuse and limits); identity and sign-in; onboarding |
| First stranger's data | Data and migrations; security, privacy and abuse |
| A ladder trigger fires | Scale, performance and cost |
| An AI feature | AI and LLM systems (evaluation) |

## Rules

- A [journey map](journey-map.md) row that keeps another person's data opens
  security, privacy and abuse for the design, before the first outside user.
- A deployed project always opens observability, whatever the request says.
  Wording about latency, slowness or timing also opens it.
- A dimension that opened stays open for the rest of the product's life. Each
  later route reads its last sweep receipt before reviewing it again.
- Answers come from evidence first: the repository, the deploy config, the
  platform's metrics and the brief. Ask the owner only a genuine decision that
  evidence cannot settle, written as a consequence for customers, money or
  moments, within the route's existing question allowance.
- When a dimension opens, read [lessons](lessons.md) and the stack's
  [catalogue](catalogue/) before proposing a service, and send the benchmark
  researcher in scout mode when a service choice is in play.
- Run-and-operate work (model deprecations, secret age, backup and restore
  drills, cost alarms, incident handling) opens at the first deploy, inside
  observability and operations. Its guidance is in
  [run and operate](../modules/observability-operations/run-operate.md).
