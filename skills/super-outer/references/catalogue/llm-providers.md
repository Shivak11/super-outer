# Catalogue: OpenAI, Anthropic and LLM evaluation

Each entry was checked against the official documentation on the date shown.
Before recommending an entry older than 30 days, run a fresh docs search and
update the date. Prices are not stored here; read the current pricing page.

## Run and operate

- **OpenAI deprecations page.** Lists retired and retiring models and
  endpoints. Generally available models get at least 6 months of notice and
  specialised variants at least 3 months. When checked, the OpenAI Evals
  platform and Agent Builder were due to shut down on 30 November 2026. Read
  this page at every release and when the session-start check runs. Docs:
  https://developers.openai.com/api/docs/deprecations
  checked: 2026-10-22

## Cost

- **Anthropic Message Batches.** Sends many Messages API requests as one batch
  that finishes later, for work that does not need an answer at once.
  Pre-warming the cache with `max_tokens: 0` is not supported inside a batch.
  Docs: https://platform.claude.com/docs/en/build-with-claude/batch-processing
  checked: 2026-10-22
- **Anthropic prompt caching.** A `cache_control` block marks a prompt prefix
  to reuse; repeat calls report the reused part as cache reads. Fits long
  fixed instructions sent on every turn. Docs:
  https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  checked: 2026-10-22

## AI evaluation

- **Langfuse datasets.** A named set of inputs and expected outputs, used to
  test a new release before it reaches production and grown from edge cases
  found in production. Experiment runs show an aggregate score per run. Use it
  for the release replay set when Langfuse is connected. Docs:
  https://langfuse.com/docs/datasets/overview
  checked: 2026-10-22

## Not yet checked

OpenAI Batch API, OpenAI prompt caching and the Anthropic model deprecation
page were not verified on 2026-10-22. Search the docs before recommending them.
