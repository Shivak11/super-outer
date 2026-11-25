# The 14 families

## Contents

- How the list was built and what it covers
- Starting levels
- 1 to 14: each family's signals, common cases and what handling looks like

## How the list was built and what it covers

The families come from standard test-design heuristics: boundary values and
equivalence classes, CORRECT (conformance, ordering, range, reference,
existence, cardinality, time), zero-one-many, Elisabeth Hendrickson's test
heuristics, and the fallacies of distributed computing. They are ranked with
the questions of failure mode and effects analysis: how often, how bad, and
whether anyone would notice.

They were checked against two samples of the author's own fixes:

- **400 bug-fix commits** from five repositories (the Rehearsal app and
  backend, an OSINT scanner, a website and Super-outer), 29 October 2026. 145
  broke under one of the conditions, 2 under none, and 103 were plain wrong
  logic on the normal path. Commit subjects are short, so many conditions were
  invisible and the logic share is overstated.
- **419 merged fix pull requests** from the interview backend, the backend's
  interview code and the mobile app, 30 October 2026, read with their
  descriptions. 266 broke under a condition and 41 (13%) were plain wrong
  logic. The first 13 families covered 94% of the condition breakage. The rest
  were the AI giving a wrong answer (10, now family 14), memory or speed
  degrading as use grew (6, now in family 2) and private data sent to
  analytics (1, now in family 9).

In the interview, transcription and report code, 58 breakages were serious
(an interview, recording, transcript or report lost, stuck or wrong). 24 of
them were work stopping halfway, 7 too much, 7 a mishandled error, 4 the wrong
kind of input and 3 the AI giving a wrong answer. For audio, uploads and long
model pipelines, check family 5 first.

No condition list finds plain wrong logic on the normal path; ordinary tests of
the main path do. Say so when a report could be read as covering everything.

Published studies point the same way, though nearly all of them study large
server systems:

- 92% of catastrophic failures in five distributed systems came from wrong
  handling of an error the software had already raised; 35% were trivial, such
  as an empty or log-only handler or a handler left as TODO (Yuan and others,
  OSDI 2014).
- Roughly 70% of outages follow a change to a live system (Google, *Site
  Reliability Engineering*, introduction). About two thirds of upgrade failures
  were old and new versions disagreeing about data (Zhang and others, SOSP
  2021); certificates caused 55% of deployment errors in Microsoft Teams
  incidents (Ghosh and others, SoCC 2022).
- Broken access control is the first item of the OWASP Top 10 for 2025.
- Real failures need few conditions together: 98% of the concurrency bugs Lu
  and others studied (ASPLOS 2008) involved at most two threads, and 90% of
  Yuan's failures needed at most three input events. Check single conditions
  and pairs; leave exotic combinations out.

## Starting levels

The count is the number of condition fixes in that family across both samples
(413 in all: 147 from the commits and 266 from the pull requests, with the
cases folded into families 2, 9 and 14 counted there). Start "how often" at
this level and move it at most one step for what the code shows.

| Family | Fixes | Starting level |
|---|---|---|
| 4 An error is mishandled | 57 | high |
| 12 The release itself | 48 | high |
| 9 The wrong person | 44 | high |
| 3 The wrong kind of input | 42 | high |
| 5 It stops halfway | 39 | high; first for audio, uploads and long pipelines |
| 13 The device | 35 | medium |
| 1 Nothing there | 31 | medium |
| 2 Too much | 31 | medium |
| 8 Coming back later | 26 | medium |
| 7 Two at once | 24 | medium |
| 11 Steps out of order | 14 | low |
| 14 The AI gives a wrong answer | 10 | low; medium wherever a model's answer reaches the user |
| 6 The same thing twice | 7 | low |
| 10 Time and place | 5 | low |

A low starting level is about frequency only. Ranking puts harm first, so
families 6 and 14, which often carry high harm (a double charge, a wrong score
in an interview report), can still rank first.

## 1 Nothing there (existence, zero)

Applies when the code reads data that might not exist yet: lists, profiles,
settings, optional fields, query results, first use.

- A new user with no recordings, notes or history yet.
- An optional field left blank, or a lookup that finds nothing.
- A list that becomes empty after the last item is deleted.

Handled looks like: an empty state that says what to do, a default value, a
guard before using the first item.

## 2 Too much (range, boundary values, limits)

Applies when input size or count is not fixed: text fields, uploads, lists,
loops, prompts sent to a model, retries.

- The longest name or answer, the largest file, the ten-thousandth row.
- A model prompt or reply past its token limit.
- Many requests at once: a class of 300 starting a test at 10 am.
- A loop or retry with no limit that runs forever or spends without end.
- Memory or caches that grow with every request until the server is killed,
  or a list that gets slower as it grows.

Use the real limit from the schema, API or plan when one exists. If nothing
limits the size, that is itself a finding.

Handled looks like: a stated limit checked before work starts, pagination, a
clear message at the limit, a cap on repeats.

## 3 The wrong kind of input (conformance, parsing)

Applies when the code reads anything typed, pasted, uploaded or returned by
another system.

- Hindi or mixed-script names, emoji, spaces in a pasted phone number.
- Input that arrives another way: pasted, imported, dragged in or sent through
  the API instead of typed.
- A file whose name says one format and whose content is another.
- An API or model reply in a slightly different shape than expected.

Handled looks like: validation at the edge, tolerant parsing with a clear
error, a schema check on outside replies.

## 4 An error is mishandled (error handling, timeouts, fallbacks)

Applies whenever the changed code can raise or receive an error: a network
service, a model provider, a database, a file, a payment or messaging
provider, another process, or its own checks.

- A service is slow, times out, returns an error or hits a rate limit.
- The handler is empty, only logs, says TODO, or catches everything and
  carries on as if the work succeeded.
- The handler overreacts: one failed item stops the whole job, or it retries
  forever.

Handled looks like: a timeout, a bounded retry, a message the person can act
on, their work kept so they can try again, and a test that drives the error
path. Search the changed code for empty and catch-all handlers first; they are
the cheapest findings.

## 5 It stops halfway (atomicity, interruption, cleanup)

Applies when work has several steps or takes time: uploads, multi-table writes,
background jobs, payments, long model calls.

- The app is closed or backgrounded mid-upload.
- One write succeeds and the next fails.
- A job is killed and leaves a half-finished record.
- A recording kept only in storage the phone may clear, or marked done before
  storage confirms the file, so it sits at "uploading" for ever.
- A cancelled or failed analysis that cannot be retried from where it stopped.

Name what a failure after each step leaves behind: a file in storage with no
record, a record with no file, a charge with no access.

Handled looks like: one transaction, a resumable upload, a status that marks
unfinished work, cleanup on failure.

## 6 The same thing twice (idempotency, duplicates)

Applies when an action can be repeated by a person, a retry or another system:
submit buttons, payments, webhooks, queued jobs.

- A double tap on Submit or Pay.
- A network retry that resends a request that already worked.
- A webhook delivered twice.

Handled looks like: a request key checked before acting, a disabled button
while sending, a unique constraint.

## 7 Two at once (concurrency, races, stale data)

Applies when two people, tabs, devices or processes can touch the same data.

- The same account open on phone and laptop.
- Two people editing one record.
- An older reply arriving after a newer one and overwriting it.

Handled looks like: version checks on write, locks where needed, ignoring
stale replies.

## 8 Coming back later (state over time)

Applies when anything is saved and used again: sessions, caches, drafts, app
data on the phone, links.

- An expired login or token.
- A link to something since deleted or moved, or a record deleted while
  others still point to it.
- Saved data written by an older app version.

Handled looks like: refresh or a clear sign-in prompt, a not-found page,
migration of saved data.

## 9 The wrong person (authorisation, privacy, security settings)

Applies when data belongs to someone, or roles differ.

- One user reading or changing another user's data by changing an id.
- A role that can do more than it should.
- A security setting switched off, such as certificate checking.
- Private data sent where it should not go, such as names in analytics events.

Handled looks like: an ownership check on the server for every read and write,
row rules, a test that tries another user's id.

## 10 Time and place (time zones, dates, locale, currency)

Applies when the code stores, compares or shows dates, times, money, numbers
or language.

- A user in another time zone, or a streak counted across midnight.
- Month ends, leap days, daylight saving.
- Store prices in another currency, or numbers written with other separators.

Handled looks like: storing UTC, converting for display, using the platform's
locale and price formatting.

## 11 Steps out of order (ordering, navigation, lifecycle)

Applies to multi-step flows, navigation, and code that depends on setup having
run first.

- The back button in the middle of a flow.
- A link that opens step 3 directly.
- A screen used before its data or setup has loaded.
- The first run after install, or a restart with work already queued.

Handled looks like: each step checks what it needs, links resolve to a valid
start, loading states.

## 12 The release itself (deployment, configuration, migration, versions)

Applies to every change that ships.

- A setting or key present on the developer's machine and missing in
  production.
- An old app version talking to the new server, or old and new code reading
  each other's saved data during the rollout.
- A wrong flag, constant or limit, or a certificate or key that expires.
- A migration that fails on real data, or a rollback that cannot undo it.

Handled looks like: settings checked at start-up, backward-compatible API
changes and data, migrations tested on a copy, expiry dates watched, a
rollback plan.

## 13 The device (offline, platform, permissions, screen)

Applies to anything a person runs on a phone, browser or desktop.

- No network, or a slow one.
- A permission refused: microphone, camera, notifications.
- A small screen or open keyboard hiding the button; iOS and Android behaving
  differently.

Handled looks like: an offline state, a message when permission is refused,
layouts checked at small sizes, platform-specific tests.

## 14 The AI gives a wrong answer (model and speech-to-text quality)

Applies when the change calls a language model or speech-to-text and uses what
comes back as content a person sees or a decision depends on: scores, reports,
summaries, transcripts, questions, tags.

- A wrong or unfair score, or an answer marked "insufficient" when it was weak
  but real.
- Invented facts, advice the source did not contain, or the wrong language.
- A conversation that repeats itself or never ends.
- A transcript that merges speakers or comes back nearly empty from noisy
  audio.

Handled looks like: a small set of real, recorded inputs with expected
outcomes run against every prompt or model change, checks on the answer before
it is shown, and a clear fallback when the answer fails them. Family 3 covers
a reply in the wrong shape; this family covers a reply in the right shape that
is wrong.
