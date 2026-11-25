# Working method

The explanation behind the short rules in [SKILL.md](../SKILL.md#the-working-method-in-short). Read the section a route needs.

Contents:

- [Anticipate what the work implies](#anticipate-what-the-work-implies)
- [Sequence by the cost of changing your mind](#sequence-by-the-cost-of-changing-your-mind)
- [Keep a ledger of deferrals, with triggers](#keep-a-ledger-of-deferrals-with-triggers)
- [Considered is not proven](#considered-is-not-proven)
- [The author of a test is not its witness](#the-author-of-a-test-is-not-its-witness)
- [Separate deploying from switching on](#separate-deploying-from-switching-on)
- [Say it once, and make it worth reading](#say-it-once-and-make-it-worth-reading)
- [Name the altitude of each step](#name-the-altitude-of-each-step)
- [Learn from a correction](#learn-from-a-correction)

## Anticipate what the work implies

A plainly worded request — "build a voice pipeline", "add login", "handle
refunds" — names a *kind of work*, not the engineering vocabulary that kind of
work involves. Recognise the kind, and bring in the specialists that always
matter for it, before anyone has mentioned retries or tokens.

Archetypes live in [archetypes](archetypes/), one file per
kind of work, each listing the failure modes that recur every time. They match
product nouns, because that is the vocabulary someone describing a feature
actually uses. They cover a product's whole life; with no repository yet, start
from [new-product-setup](archetypes/new-product-setup.json).

Two rules keep anticipation from becoming interrogation:

1. **Look before asking.** Every failure mode records where in the repository to
   check whether it is already handled. If the repository answers it, say so
   plainly and do not ask. On a well-built codebase most are already answered,
   and saying so is more useful than asking.
2. **Fill an empty room, do not crowd a full one — with specialists.** When
   evidence has already assembled the right panel, an archetype does not add
   more; that unbalances the review and re-creates the over-asking flow-first
   removed. Its failure modes still apply. A task described in enough
   engineering vocabulary to select a full panel is usually the task whose edge
   cases matter most, and suppressing them there was backwards.

Maintenance work — a rename, a typo, reordering comments — never summons an
archetype. A protected domain still outranks that exemption: renaming a column
on the payments table is payments work.

A matched archetype raises the ceiling to twelve, above every ordinary tier.
Before the thing exists is the one moment when asking is cheapest and a wrong
assumption is most expensive. The raise is a ceiling, never a quota: the floor
stays at one, and a question invented to reach twelve is the ceremony this tool
removed. For `FOCUSED` work and above, run the [engineering approach](engineering-approach.md) stage next.

## Sequence by the cost of changing your mind

Do first whatever is most expensive to change later. It is not "auth first" — a
login screen defers freely; the ownership column does not, because "whose data
is this?" infects every query, endpoint, and screen once retrofitted.

Each anticipated failure mode carries one of three classes:

- `now` — impossible or ruinous to retrofit: data shape, ownership and tenancy,
  idempotency on anything irreversible, consent for what is stored. Consent is
  `now` because it cannot be obtained retroactively for data already collected.
- `decide` — cheap later only if a decision now keeps the door open: offline,
  caching, multi-device, background upload. A `decide` item needs a recorded
  answer today, not code today.
- `defer` — genuinely additive later. Never ask about a `defer` item; record it.

Order the interview `now` first, then `decide`. When the budget truncates, the
surviving questions are the ones whose wrong answer costs most to discover late.

## Keep a ledger of deferrals, with triggers

Deferred risk decisions live in `.engineering/super-outer/ledger.json`. Every
entry carries `revisitWhen` — where in the repository to look to see whether the
deferral has expired, such as "a public endpoint exists"; "revisit later" rots. An
entry with a measured signal, such as peak database load, also carries `measuredWhen`, which `super-outer ledger check --metrics <file>` compares with supplied numbers ([story walk](story-walk.md#recording-later-fixes)).

The prompt hook checks due deferrals by repository search on each routed prompt
and passes each due part on once per session as one plain line, the way settled
questions are surfaced. Pass it to the owner. The ledger holds deferred risk
decisions, not features; past ten open entries say plainly it is a wishlist.

## Considered is not proven

The user can decide "a recording must never be lost." They cannot read the
upload layer to confirm the code achieves it, and the agent that wrote the code
is not a witness, for the same reason shipped questions are tested by code.

Each answered archetype question carries `provenBy`: the check that would
demonstrate the answer holds. Record it as a proof obligation in
`.engineering/super-outer/proof-obligations.json`, status `UNPROVEN`, until
named evidence exists — a test file, a CI run, a recorded journey. "It works" is
not evidence, and marking proved requires naming the evidence.

Open obligations are reported with every delivery claim, the way
independent-review gaps already are: visible and advisory for ordinary work,
never silently passed. Do not generate the proof code automatically and mark it
proved — an overstated proof is worse than an open obligation.

## The author of a test is not its witness

The witness is the recorded run. Follow the ladder, and never skip a rung:

1. **Draft candidates.** For each open obligation, produce a candidate — the
   scenario from `provenBy`, the decision it protects, and a suggested test
   path. A candidate guides the test you then write in the repository's own
   stack; it is not evidence and changes nothing.
2. **Write the real test** where the candidate suggests, in the target
   repository's own framework.
3. **Run it, and attest the run** — the test file, the exact command (which
   must name the file), and the exit code. Promotion to `PROVED` happens only
   on a recorded passing run; a failing run is recorded as an attempt, which is
   honest history, not proof.
4. **Freshness is re-checked**, not assumed. A proved test that later changes
   or disappears demotes its obligation to `STALE`, and stale reads in the
   delivery gate exactly as unproven does. Proof is a state, not an event.

Evidence that was merely named, never confirmed by a recorded run, is reported
as exactly that. The attestation records the test file's content hash together
with its honest limitation: a hash binds the artifact, it does not authenticate
its producer. Say what was checked; never imply more.

## Separate deploying from switching on

Shipping code and turning behaviour on are two decisions. Treat them that way
for a new feature, a substantial overhaul, a replacement, or work coordinated
across app and server.

Before asking the activation question, read
[safe-activation.md](safe-activation.md), which links its
JSON and says how to explain it and when to scope it to new records.

Depth floors: a bounded new feature is at least `FOCUSED`; an overhaul, a
replacement, or coordinated cross-system work is `FULL`. A protected domain may
raise this further. Maintenance never invokes it — adding a test, renaming a
flag, updating documentation, reformatting, or comment-only work stays where it
was. Check the repository first: an approved rollout contract already in the
code is reported settled in one sentence rather than asked again. Several
repositories produce one activation decision, never one each.

## Say it once, and make it worth reading

Severity is one line: 💡 Heads up, ⚠️ Worth a look, 🛑 Stopping here. Never a
wall of letters.

A notice appears the first time it applies in a session and stays quiet after
that. A line that appears every time carries no information.

Mark what was actually earned, at most once each, and only when it happened:

- how much was checked against how little needs the user —
  "🔍 Checked 7 things your code already handles. One needs you.";
- a decision proved by its first recorded test run;
- a deferred item waking because the condition named for it came true;
- an interview that genuinely needed nothing.

Curated facts travel with the failure mode they belong to. Never invent one — a
tool that claims only what is proven does not make up a statistic to be liked.

Warm and dry throughout. Plain, confident, occasionally wry; never cute, and
never so long that momentum breaks.

## Name the altitude of each step

Label each plan step as architect work or engineer work. Architect work sets
the shape of the system: the anchors and scale ladder, service choices, and
which dimensions are open. Engineer work changes code and tests inside that
shape. Review each at its own level and report them separately, so a decision
about the system's shape is not lost among code review findings. When a code
finding shows that the shape is wrong, move it to the architect list and say
so.

## Learn from a correction

A correction that changes only the output is paid for again in the next
session. Fix the instruction, file or assumption that caused the mistake in the
same piece of work, store each lesson once in one shape, and retire a
workaround when the weakness it covered is gone. The procedure is in
[learning-loop.md](learning-loop.md).
