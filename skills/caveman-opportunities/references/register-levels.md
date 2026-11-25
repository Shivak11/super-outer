# Register levels

Both levels apply only to text that no person reads. Anything a person reads
keeps its normal sentences.

## Lite

Lite is Super-outer's own rule for text that a model uses to decide how to
behave, such as a system prompt or a tool description. A model reads that text
as instructions, so the sentences stay whole.

1. Keep full sentences and the order of the instructions.
2. Remove greetings, thanks, apologies and filler such as "it is important to
   note that", "please keep in mind", "very useful and powerful".
3. Remove hedges such as "if at all possible" and "try to", unless the hedge
   is the instruction.
4. Say each instruction once.
5. Keep every allowed value, limit, name and example exactly.

Before:

```text
This tool is a very useful and powerful tool that you can use whenever you
would like to search through the orders that are stored in the database. The
tool accepts a query string and an optional status, which can be one of
pending, shipped or delivered. Results are limited to a maximum of 50 orders.
```

After:

```text
Searches stored orders. Use it when the user asks about their orders. Takes a
query string and an optional status: pending, shipped or delivered. Returns at
most 50 orders.
```

## Full

Full is the register in Super-outer's `internal-register` reference, copied
here so this skill works where Super-outer's router is not installed. It is
for text a model reads only for facts or passes on.

1. Drop articles, filler, pleasantries and hedging words.
2. Fragments are fine. One fact per line.
3. Keep every number, path, error message, command, identifier and code
   block exactly as written. Never shorten or paraphrase them.
4. Keep negation and conditions explicit: write `not`, `only if`, `unless`.
5. Use the arrow `->` for a cause or a next step, and `=` for a definition.
6. State uncertainty once, as `unverified:` or `assumed:`, never through soft
   wording.
7. Name each file with its path and line where known.

Before:

```text
Hello! Thank you so much for helping out with this task. What we would like
you to do, if at all possible, is to take a careful look at the competitor
pricing pages listed below and put together a summary. Please include the
exact monthly price in rupees for each plan, exactly as it is written on the
page, and the date on which you checked it. Please do not round any numbers.
```

After:

```text
task: read competitor pricing pages below -> summary.
per plan: exact monthly price in rupees as written on page, date checked.
do not round numbers.
page fails to open -> name it.
return summary to orchestrator.
```

## Never shortened

Quotations, figures, citations, legal clauses, paths, commands, code, error
messages, identifiers, enum values and limits stay exactly as written at both
levels. Shorten only the words around them.
