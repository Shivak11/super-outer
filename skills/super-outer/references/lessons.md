# Lessons across projects

Each lesson came from real work in one project and applies to others. The
benchmark researcher reads this file before the stack catalogue in scout mode,
and the router reads it before opening a dimension. Add a lesson when a hidden
trade-off surfaced late and would surface again in another project. Every
lesson follows the shape in [learning-loop.md](learning-loop.md#the-shape-of-a-lesson),
and a new lesson is proposed to the owner before it is added here. A lesson
about one project belongs in that project's
`.engineering/super-outer/lessons.md`.

## Telegram bot tokens appear in request URLs

- Learned: 22 October 2026, Personal Agent (Cloudflare Workers and Telegram).
- Trigger: a project calls the Telegram Bot API and someone proposes turning
  on request tracing or request logging that records full URLs.
- What goes wrong: Telegram puts the bot token in the URL path
  (`/bot<token>/sendMessage`). A trace or log that stores outbound URLs
  stores the token in the platform dashboard, where anyone with dashboard
  access can read it.
- What to do: treat tracing as a security decision for this project. Redact
  the token from recorded URLs, or exclude Telegram calls from tracing, before
  switching tracing on. Check every other API that carries a secret in its
  URL in the same way.

## Observability switched off in a deployed project

- Learned: 22 October 2026, Personal Agent (Cloudflare Workers).
- Trigger: a project has a deploy config and is live, and nobody has checked
  whether the platform's logs and traces are on.
- What goes wrong: `wrangler.cloud.jsonc` had
  `"observability": { "enabled": false }` for several days of work. Slow
  replies were investigated by rebuilding request timings by hand from the
  app's own records, because the platform had recorded nothing.
- What to do: at the first deploy, and at every route on a deployed project,
  read the deploy config and confirm logs and traces are on. If they are off,
  open the observability dimension and turn them on, after checking the
  lesson above for secrets in URLs. Do this before investigating any latency
  or error report.

## The local main branch and the deployed revision can differ

- Learned: 14 October 2026, Cloudflare brain reader.
- Trigger: a change to sign-in, permissions or another live setting is about
  to be designed from the code on the local default branch.
- What goes wrong: the deployed service ran a different branch. The session
  read stale sign-in code on main, concluded that only one reader was
  supported, and began a replacement while two readers were already approved
  on the deployed source.
- What to do: before designing the change, find the revision that is deployed,
  read the grants already made, and search the local branches for the existing
  policy. Report a difference between main and the deployment as a difference,
  and reuse the existing policy.

## A connector that applies a migration can record its own version

- Learned: 19 October 2026, a course-builder project (Supabase).
- Trigger: a database migration is applied through a connector or a dashboard
  and not through the project's own migration command.
- What goes wrong: the Supabase connector recorded the time of the call as the
  migration's version. The repository's file carried a different version, so
  the next push from the repository would have found a remote migration with
  no local file and stopped.
- What to do: after applying, list the remote migrations and compare the
  recorded version with the file name. When they differ, rename the local file
  to the recorded version. Do not repair the remote history table without the
  owner.

## A surprising rendered result: check the instrument before the product

- Learned: 19 and 21 October 2026, two web projects.
- Trigger: a browser check on a dev server or in an embedded browser pane
  shows something the code does not explain: a dialog that never closes, a
  style that is missing, a script that stopped.
- What goes wrong: three sessions diagnosed a product bug and wrote a fix that
  changed nothing. The causes were a hidden browser pane that had stopped
  running animations, a dev server that reloaded the page when a source file
  was edited, and a dev server that served the stylesheet one save behind.
- What to do: first check that the pane is visible, that the page has not
  reloaded since the script started, and that the served file contains a
  distinctive string from the latest edit. Suspect the product only after all
  three hold. Do not edit source files while a scripted run is in progress.
- Assumption: an embedded browser pane pauses animations while hidden, and a
  dev server under several writers can serve a file one save behind.
- Retire when: a hidden pane completes a 100 ms exit animation, and the served
  stylesheet matches the file on disk immediately after a save with five
  writers active.

## A secret the database needs must not pass through the agent

- Learned: 24 October 2026, Moodle MCP (Supabase).
- Trigger: a database setup step needs a key, a role password or another
  shared secret.
- What goes wrong: the step that set a signing key and a role password through
  the SQL connector was refused, because the secret values were written in the
  request. The refusal came after the owner had approved the schema change, so
  the release stopped halfway.
- What to do: plan the step so that the secret never appears in the agent's
  request. Generate a key inside the database when only the database uses it.
  For a secret two systems share, give the owner a one-line statement to run
  in the database's own editor. Put this in the runbook before asking for
  approval.
