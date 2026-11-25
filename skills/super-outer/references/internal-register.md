# Internal register

A short register for text that only agents and the coordinator read. It saves
tokens on agent work. Everything the owner reads stays in OUTER English. These
rules are copied here from the caveman "full" level, so Super-outer does not
depend on a separately installed skill.

## When it applies

Use it only when agents run, which means `FOCUSED` work and above. Reading
these rules costs a fixed amount, which `QUICK` work does not recover.

It applies to:

- briefs sent to agents;
- agent reports and specialist results;
- scout output;
- sweep receipt notes, suggestion records and ledger notes.

It never applies to:

- anything shown to the owner, including questions, warnings, reports and the
  plan they approve;
- commit messages, pull requests, CHANGELOG entries and raw records;
- security warnings and confirmations before an irreversible action, which
  keep full sentences.

## Rules

1. Drop articles, filler, pleasantries and hedging words.
2. Fragments are fine. One fact per line.
3. Keep every number, path, error message, command, identifier and code
   block exactly as written. Never shorten or paraphrase them.
4. Keep negation and conditions explicit: write `not`, `only if`, `unless`.
5. Use the arrow `->` for a cause or a next step, and `=` for a definition.
6. State uncertainty once, as `unverified:` or `assumed:`, never through soft
   wording.
7. Name each file with its path and line where known.

Example, for an agent report:

```text
done: skills/super-outer/references/lessons.md created, 2 lessons.
check: python docs/architecture/check_docs.py -> PASS.
unverified: Codex copy not loaded in host.
```

## Translation

The coordinator translates every internal result into OUTER English before
the owner sees it, following the reply rules in the repository's `CLAUDE.md`. An
internal-register line is never pasted into a reply to the owner.
