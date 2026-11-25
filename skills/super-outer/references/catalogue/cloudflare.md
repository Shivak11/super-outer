# Catalogue: Cloudflare

Each entry was checked against the official documentation on the date shown.
Before recommending an entry older than 30 days, run a fresh docs search and
update the date. Prices are not stored here; read the current pricing page.

## Observability and operations

- **Workers Logs and traces.** Turned on in the Wrangler config with
  `observability.enabled` and `observability.traces.enabled`, with a
  `head_sampling_rate` for busy Workers. Traces capture fetch, binding and
  handler calls without an SDK. Automatic tracing was in early beta when
  checked. Read lessons.md first: a URL that carries a secret is stored with
  the trace. Docs: https://developers.cloudflare.com/workers/observability/traces/
  checked: 2026-10-22

## Reliability and recovery

- **Workflows.** Durable steps that retry, keep their results, and can sleep
  or wait for outside input for minutes, hours or weeks. Fits long or
  multi-step background work that a Worker would otherwise poll for. Docs:
  https://developers.cloudflare.com/workflows/
  checked: 2026-10-22
- **Queues.** Background work with batching, retries, dead letter queues and
  pull consumers. Delivery is at least once, so each consumer must be safe to
  run twice. Docs: https://developers.cloudflare.com/queues/
  checked: 2026-10-22
- **D1 Time Travel.** Restores a D1 database to any minute in the last 30
  days. Always on. A restore overwrites current data and returns a bookmark
  that undoes it. Run a restore drill on a copy before relying on it. Docs:
  https://developers.cloudflare.com/d1/reference/time-travel/
  checked: 2026-10-22

## AI and LLM systems, cost

- **AI Gateway.** Sits in front of model providers and adds request logs,
  caching with a time limit, and rate limiting by request count per window
  (requests over the limit get a 429). Useful for per-user cost limits and for
  seeing every model call in one place. Docs:
  https://developers.cloudflare.com/ai-gateway/features/
  checked: 2026-10-22

## Not yet checked

R2 backup patterns, Durable Object alarms and Cloudflare Access were not
verified on 2026-10-22. Search the docs before recommending them.
