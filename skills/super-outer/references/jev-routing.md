# Jev in the route

Jev is TypeSafe's decision model, `typesafe/jev-1.13`, reached through
OpenRouter. It answers typed questions about a text with a probability for each
answer and writes nothing. From 5.8.0, when a person has switched it on,
Super-outer's prompt hook asks Jev about each typed request, and Jev's reading
decides whether the route names the design path. The word lists stay the
fallback.

## What reaches you

- When Jev's reading was used, the route line ends by saying that Jev decided
  whether the design path applies.
- When Jev reads a request as building or remaking something people use, the
  route also carries the product UI specialist and at least `FOCUSED` depth,
  and the Safe Activation question applies as it does for any new feature.
- More lines can follow, each starting "Jev reads": one for each matched
  checklist that is likely a false match, one for a protected boundary when the
  route is not `CRITICAL`, and one for a depth two steps above the route. They add
  care only. Read the request and decide; the route still applies.
- When Jev reads a request as new work (depth `FULL` or `CRITICAL` with
  confidence of at least 0.5, and neither a small adjustment nor a change to
  code alone) and the repository has no product brief, the route carries the
  brief line that points to the story walk. Jev may add this line and never
  removes one the word lists give, and never adds it to a request the word
  lists read as a fix or maintenance (the check uses the word lists' own route,
  before Jev's design reading changes it). On a set of 40 plain requests frozen
  on 12 October 2026, Jev alone found 17 of 20 new pieces of work with no fix
  wrongly flagged. The word lists found 9 and wrongly flagged one; they were
  changed the same day, partly in response to that one, and now find 10 and
  flag none, so their figure on this set is no longer a held-out result.
- When Jev is switched off, has no key, or gives no valid answer within 2.5
  seconds, the route comes from the word lists alone, as it did in 5.7.0.

Jev never decides the checklists, the question allowance beyond the design
path's floor, approval phrases, the safety check before tool calls, closure, or
`SMALL_SAFE`. The word lists decide those.

## Where it runs

Only in the prompt hook, which runs in Claude Code and, through the bridge, in
Cursor. `super-outer route` always uses the word lists. Codex has no Super-outer
prompt hook registered, and Hermes carries this skill without the hook, so both
route on the word lists.

## Switching it on and off

- On: put `SUPER_OUTER_OPENROUTER_KEY=<the key>` in
  `~/.config/super-outer/jev.env` and make that file readable only by its owner
  (`chmod 600`), or set the variable in the environment. A general
  `OPENROUTER_API_KEY` never switches Jev on, because a key kept for another
  tool is not a choice to send prompts to TypeSafe.
- Off: `SUPER_OUTER_JEV=off` in that file or in the environment. Every route
  then comes from the word lists, with no notice.
- Without either, Super-outer says once per session, with the first tool call,
  how to add the key and how to stop the notice.
- `super-outer jev status` reports whether Jev is on, where the key was found
  and whether the record is kept. It never prints the key.
- `SUPER_OUTER_JEV_MODEL=<model name>` in that file or the environment names a
  different decision model served on the same OpenRouter endpoint, such as a
  later Jev release. A value that does not read as a model name is ignored. The
  endpoint serves decision models only, so a general chat model cannot be named
  here.

## What is sent and what is kept

Only the words the person typed are sent, after the host's own blocks are
removed, and at most the first 1,500 characters. Anything the person pasted
into the request is part of it. Nothing is sent for a request shorter than 8
characters, a slash command, a request longer than 50,000 characters, a request
with host markup or tool output left in it, such as a hyphenated block tag or a
JSON object. Nothing is sent when the first 1,700 characters mention a
password, pass, a passcode, a PIN, credentials, a secret, a one-time code, a
card number or any key, also inside a name such as `DB_PASSWORD`; when a login
word, a code, a token, a seed or cred is followed within a few words by a
value; or when they hold a card number or a key in a known shape. Those
requests get the word route. A misspelling or another language that the filter
does not list, a value made only of letters with no credential word next to it,
or a look-alike letter that the filter does not map can still be sent.
Super-outer adds nothing about the repository, the files or the person.

OpenRouter says it stores no prompt text unless the account owner opts in, and
keeps request metadata such as token counts. TypeSafe says it does not train on
input and names no retention period.

`SUPER_OUTER_JEV_RECORD=on` in the key file keeps a private record on the
computer at `~/.local/share/super-outer/jev-record/`: Jev's readings, the
decision taken, the first 120 typed characters of each request that was sent,
the name of the repository folder and a SHA-256 of the whole request. Only the
owner can read it. Files are deleted once they are 30 days old, on every
prompt the hook judges, also after the record is switched off.
`super-outer jev domains` counts how often each candidate domain came up.

## When the person asks

If the person asks why a route named the design path, say which reader decided
it. If they think the decision was wrong, say so plainly and follow the request:
the design path is a recommendation, and the person may raise or lower the work
it asks for.
