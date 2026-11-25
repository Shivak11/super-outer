# Catalogue: Supabase

Each entry was checked against the official documentation on the date shown.
Before recommending an entry older than 30 days, run a fresh docs search and
update the date. Prices are not stored here; read the current pricing page.

## Data and recovery

- **Database backups and point-in-time recovery.** Daily backups on every
  plan. Pro keeps 7 days, Team 14 days and Enterprise up to 30 days.
  Point-in-time recovery is an add-on for more frequent restore points.
  Docs: https://supabase.com/docs/guides/platform/backups
  checked: 2026-10-22

## Reliability and background work

- **Queues.** A durable message queue inside Postgres, built on the pgmq
  extension. Each message is delivered once within a visibility window, and
  messages can be archived. Fits background work for a product whose data
  already lives in Supabase. Docs: https://supabase.com/docs/guides/queues
  checked: 2026-10-22
- **Cron.** Scheduled jobs built on the pg_cron extension. Use it in place of
  a home-made scheduler. Source: Supabase changelog, Cron announcement.
  checked: 2026-10-22

## Not yet checked

Log drains, Edge Function logs, Auth rate limits and the security advisor
were not verified on 2026-10-22. Search the docs before recommending them.
