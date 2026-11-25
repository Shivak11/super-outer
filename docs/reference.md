# Super-outer reference

The [README](../README.md) says what Super-outer sets out to do. This page holds the detail: how it decides when to stop, what it sends outside your computer, the commands each host uses, and how releases are checked.

## Optional parts

Super-outer can install one optional part beside it. The learning skills,
Brief me and Meditate, work in Claude Code and Codex. Brief me gives you the
vocabulary of a field before you build in it, with each term's source page and
an example request. Meditate turns a finished stretch of work into a short
visual study that opens with a map of how the thing you built works.

The developer package asks whether you want them. With a clone, name the choice:

```sh
npm run setup -- --components skills
```

Use `skills` or `none`. A first install with no choice brings the learning
skills, and a later update keeps the saved choice.

## Think first; keep ordinary work moving

Super-outer does not ask for code approval merely because an agent will change
files. Brainstorming, video and document analysis, design critique, temporary
analysis files, reversible code changes, tests, builds, formatting, commits,
pushes, pull requests, normal merges, CI inspection, and CI reruns continue
without a Super-outer approval phrase.

Stale recorded context should not disable harmless work. If the recorded branch
does not match the active branch, Super-outer normally warns and continues with
reads, searches, local tests, builds, formatting, and reversible work. An
unfamiliar tool continues unless Super-outer detects a concrete extremely
critical consequence. Unknown does not mean dangerous.
The warning says what it expected, what it found, why the difference matters
for this action, and whether work may continue.

A missing, failed, or incomplete independent review is advisory for QUICK,
FOCUSED, and FULL work and remains visible in the final report. It can block
only an extremely critical action or a CRITICAL production-proof claim.

Extremely critical actions can affect production or private data; identity,
permissions, secrets, payments, privacy, or security; destructive or privileged
production infrastructure; consequential external messages or transactions; or recovery,
rollback, audit, and repository protections. Production deployment,
publication, migration, release, and promotion belong in this category.

A risky-looking command is not automatically an extreme consequence. Local
infrastructure cleanup, feature-branch cleanup, and ordinary installation work
continue unless the live action clearly crosses one of the boundaries above.
Missing host session information also never blocks ordinary work; it matters
only when Super-outer must safely bind a rare critical approval.

Super-outer says a warning in one line: `💡 Heads up` for bookkeeping, `⚠️ Worth
a look` for a risk or a proof gap, and `🛑 Stopping here` for the rare hard
block. Each line states what was expected, what was found, why it matters for
this action and whether work may continue. The emoji stays readable without
colour. Super-outer avoids repeating the same low-risk warning when the host
can remember that it has already been shown.

## Balanced, not UI-heavy

Super-outer treats these as equal engineering dimensions:

- product UI/UX and motion;
- frontend and client engineering;
- backend and APIs;
- data and changes to stored information;
- security, privacy, and misuse;
- scale, speed, and cost;
- reliability and recovery;
- architecture and maintainability;
- compatibility and integrations;
- production visibility and operations;
- AI and model-backed systems;
- delivery and release.

The task determines the emphasis. A backend-only change does not activate a UI
review. A motion-only change does not activate backend or scale review. A
full-stack feature activates the parts it genuinely touches.

## Intent and design before building screens

Super-outer is an end-to-end, plain-language coding kit for people who do not
write code. For a user-facing new feature or redesign it records what the user
is trying to do and what must stay true while they do it, asks only the design
questions that change the result, and has the main working screen rendered as a
near-production design package before any builder starts. Each builder receives
the same versioned package. Before the work can be called done, a reviewer who
did not build it operates the real screens against the recorded intent, and the
owner's acceptance is recorded in the owner's own words. Nothing is blocked
while that evidence is missing; the work simply cannot be closed as proved.

A small visual correction gets a before and after render. Backend-only work
cites an intent that already exists. Maintenance gets nothing new.

Archetypes now cover a product's whole life: starting with no code, analytics,
admin and support tools, people's rights over their data, teams and roles,
public pages and store listings, help and release notes, email delivery, and
retiring a feature or the product.

## Jev, and what leaves your computer

From 5.8.0, Super-outer can ask Jev, TypeSafe's routing model, to read each
request you type. Jev decides whether the request builds or remakes something
people use, and so whether the design path applies. On 120 written requests,
each set frozen before the run that tested it, it chose correctly 118 times and
the word lists 84 times. The word lists still decide everything else, and they decide
alone whenever Jev is switched off, has no key, or does not answer within 2.5
seconds.

Jev is off until you switch it on with your own OpenRouter key. Create the key
file and make it readable only by you:

```sh
mkdir -p ~/.config/super-outer && touch ~/.config/super-outer/jev.env && chmod 600 ~/.config/super-outer/jev.env
```

Then open that file in any text editor and add one line,
`SUPER_OUTER_OPENROUTER_KEY=` followed by your key, so that the key never sits
in your shell history. An `OPENROUTER_API_KEY` you keep for other tools never switches it on. To stop
the reminder without switching Jev on, put `SUPER_OUTER_JEV=off` in that file.
`super-outer jev status` shows what is switched on.

When Jev is on, the words you typed in each request, at most the first 1,500
characters, go to OpenRouter and TypeSafe. That includes anything you paste
into the request, such as a file path or an error message. Super-outer adds
nothing about your repository or files. Nothing is sent for a request that
holds text a tool wrote, such as command output or a pasted JSON object, or for
one whose first 1,700 characters mention a password, pass, a passcode, a PIN,
credentials, a secret, a one-time code, a card number or any key, also inside a
name such as `DB_PASSWORD`. The same holds when a login word, a code, a token,
a seed or cred is followed within a few words by a value, or when the text
holds a card number or a key in a known shape. Those requests get the same
route as in 5.7.0. A misspelling or another language that the filter does not
list, a value made only of letters with no credential word next to it, or a
look-alike letter that the filter does not map can still be sent.
OpenRouter says it stores no prompt text unless
your account opts in. TypeSafe says it does not train on what it receives, and
it names no period for keeping it. Each request costs about a hundredth of a
cent and adds about a second before the reply starts.

From 6.1.0, another plugin may send Jev a typed request with a fixed list of
options through `super-outer jev ask`. The same key and switch apply. The
request is sent only when it is at most 1,500 characters and passes the same
secret check, and only the request, the kind and the option names are sent.

## The tool check

From 6.3.0, `super-outer tool-check run --write` checks the project's packages
and its vendors' skills and connections. The agent runs it when work plans or
builds something, at the story walk's stack choice and at the milestone sweep,
and follows `skills/super-outer/references/tool-check.md`.

- It reads `package.json`, `requirements.txt` and `pyproject.toml` files up to
  three folders deep, with their lock files, and skips sample and test folders.
- Workspace, local, Git and URL packages, and every package behind a private
  registry or index, are never looked up. Public names go to npm or PyPI.
- Expo projects are compared with Expo's own version table for the installed
  and the next version.
- Skills come from skills.sh, searched by the project's own vendors and, with
  `--need "<up to five words>"`, by what new work needs. A skill is shown when
  it still exists in its repository, no safety scanner failed it, and its
  instructions hold no hidden text or download-and-run commands. A scanner
  warning shows it with a note.
- Connections (MCP servers) come from the MCP Registry under the vendor's own
  GitHub account or domain.
- `super-outer tool-check shown <id>...` and `super-outer tool-check answer
  <id>... <accepted|declined|later>` record what the owner saw and said. A
  declined item is not raised again; "later" returns after 14 days.

The command makes read-only GET requests, at most 500 in one run, and stores
only the owner's answers in `.engineering/super-outer/tool-check.json`.

## How it works

1. Small, safe work stays quiet.
2. Material work is mapped to the relevant engineering dimensions.
3. Only the relevant parts of those specialist playbooks are loaded.
4. The repository's own product, design, backend, security, operating, and
   delivery rules are checked before generic precedent.
5. Specialists return evidence to one router. Only the router speaks to the owner.
6. The router translates technical findings into product consequences and one
   consolidated set of questions.
7. Ordinary implementation continues without approval. A rare extremely
   critical action uses an exact, one-use approval. Delivery claims are checked
   against the exact repository version and the medium where the claim lives.

## Native use

- Claude Code: `/super-outer:super-outer <task>`
- Codex: `$super-outer <task>`
- Cursor: native hooks via `npm run install:cursor` (every skill under
  `skills/` is copied to `~/.cursor/skills/<name>`, plus `~/.cursor/hooks.json`)
- System diagrams: `/super-outer:draw-system-diagram` in Claude Code and
  `$draw-system-diagram` in Codex draw a light, colourful SVG of how a product's
  parts connect, of how its pipeline turns inputs into results, or of how one
  endpoint or backend flow works for a developer who will open the code, with a
  test that keeps each one in step with the code.
- Opportunity finders: `jev-opportunities` finds LLM calls that only make a
  closed decision and recommends Jev, the OpenAI Decisions API, Claude
  structured output on a small model or keeping the call;
  `caveman-opportunities` finds text that only machines read and shows a
  shorter register for it. Both are read-only and change nothing until the owner
  approves an item. Super-outer runs them when a plan builds or changes an
  agent, LLM chain, skill or MCP server, and at the milestone sweep.
- Edge cases: `edge-cases` checks a change against 14 families of common
  breakage, keeps those the change can meet, and ranks at most 10 by how often,
  how much harm and whether anyone would notice, each with its evidence and the
  test that would prove it handled. It is read-only. Super-outer runs it on
  `FOCUSED` and deeper plans, at the milestone sweep and inside the failure
  scout.
- Compatibility: `/outer <task>` continues to route to Super-outer after
  promotion.

The local command interface supports profile, task, repository, package,
installation, verification, migration, and rollback operations. Its structured
output is for the agent's evidence layer; it is not the language the agent
should show the owner.

Other plugins can ask Jev one closed question through
`~/.super-outer/bin/super-outer jev ask --kind <slug> --options <a,b,c>`, with
the typed request on stdin. Setup writes that launcher and points it at the
installed version. The command prints one JSON line and always exits 0:
`{"answer":"<option>"|null,"source":"jev"|"local"|"off"|"refused","confident":true|false}`.
The kind and each of the two to eight options are lowercase slugs of up to 40
letters, digits and hyphens. The answer is an option only when Jev reads that
one option at 0.8 or more and every other option at 0.2 or less. `off` means
Jev is switched off or has no key, `refused` means the arguments or the text
were refused and nothing was sent, and `local` means the caller decides.

Promotion makes Super-outer the only active OUTER version. Existing OUTER 2.1
and v3 files are moved out of Claude and Codex discovery into separate hashed
archives under `~/.super-outer/legacy-archives/`; their hooks and global v3
instructions are deactivated, not deleted. Cursor remains outside the
Claude/Codex developer-upgrade package and uses the separate Cursor installer.

## Verification

Run:

```sh
npm run verify
```

This checks source rules, manifests, public records, all tests, repeatable
packaging, checksums, and isolated staging. It deliberately does not claim live
Claude or Codex discovery. Host discovery, hook execution, live review, CI, and
user-wide promotion remain separate proof layers.

An isolated host check does not copy your Claude or Codex login. It reports
completed plugin-hook activation separately from a completed model response, so
an intentionally logged-out temporary home is described as a proof limit rather
than confused with a broken plugin.

Codex reviewer roles are installed at Codex's native agent location, beside any
unrelated personal roles. Super-outer will not overwrite a same-named role it
does not own, and rollback restores the previous Codex configuration.

For CRITICAL or explicit production delivery, a matching version string is not
CI proof.
Super-outer rereads the named GitHub Actions run and requires it to be complete,
successful, and attached to the exact version being delivered.

Local source evidence is also bound to the exact version and exact evidence
bytes. Its record says plainly that this does not prove who produced those bytes
or rerun the check. The remote CI result is independently reread; the local
artifact limitation is never hidden behind the word “proved.”

See [architecture](architecture.md), [installation and recovery](installation.md),
and [proof boundaries](evidence-boundaries.md).

The v4 design and its amendments (warn-first, flow-first and single owner)
are internal plans. Their rules are in the skill text and the tests.
OUTER 2.1 and v3 remain recoverable after complete cross-host verification, but
only the installed Super-outer release remains active.

## Architecture documentation

Start with the [C5 views](architecture/index.md), the [operating constraints](architecture/decisions/0002-operating-constraints.md) and the [C5 convention](architecture/CONVENTION.md). Read the constraints before you change ownership, retries, authentication or service boundaries.

Update a view in the same change that makes it untrue. Render the SVG to PNG and look at it before you commit.
