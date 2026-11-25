# Plain-English glossary

Locks recurring engineering concepts to one consistent plain-English phrasing,
so the same idea does not reach the owner three different ways across three
sessions.

This core ships with the tool and is domain-general. It is enriched, when the
vault is reachable, from `references/glossary/` in the owner's notes vault — see
*Enrichment* below. A missing vault is normal, not an error.

## Format

One term per row. `term` is matched case-insensitively on exact word text.
`plain` is the phrasing to use in a question, a consequence, or a disclosure.

| term | plain |
|---|---|
| idempotent | doing it twice has the same effect as doing it once |
| idempotency | whether doing it twice changes anything |
| rollback | going back to the previous version safely |
| eventual consistency | people may briefly see older information |
| race condition | two things happening at once can leave the wrong result |
| backfill | filling in past records to match a new shape |
| schema migration | changing the shape of stored information |
| p95 latency | how long almost everyone waits |
| p99 latency | how long the slowest few wait |
| cache invalidation | clearing saved copies so people see fresh information |
| circuit breaker | backing off from a failing service instead of retrying |
| retry budget | how many times we try again before giving up |
| dead-letter queue | where work goes when it cannot be processed |
| fan-out | one action causing many downstream actions |
| backpressure | slowing down intake when the system is saturated |
| optimistic update | showing the result before it is confirmed |
| hydration | making a rendered page interactive |
| observability | being able to tell what happened after the fact |
| distributed trace | following one request across services |
| feature flag | a switch that turns behavior on for some people |
| blast radius | how much is affected if this goes wrong |
| tenant isolation | keeping one customer's data away from another's |
| least privilege | giving only the access actually needed |
| audit trail | a durable record of who did what |
| soft delete | hiding a record while keeping it recoverable |
| hard delete | removing a record permanently |

## Enrichment

Read additional entries from `<vault>/references/glossary/` — one file per term,
frontmatter `term:` and `plain:`. Look them up **by path or exact term key**,
never by semantic search: a question-phrasing gate must return the same
phrasing for the same term on every run, and a vector index does not promise
that. The wiki's `qmd` index is the wrong instrument for a dictionary lookup
even though it is already there.

Super-outer never writes to the vault, so the vault's own reindex obligation
(`qmd update && qmd embed`) never applies to this tool.

When two sources define the same term, the vault wins — it is the one the owner
maintains as they work.
