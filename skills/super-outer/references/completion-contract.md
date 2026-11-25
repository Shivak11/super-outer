# Check the outcome the user requested

Read this before implementation of a user-facing or deployed workflow and again
before reporting completion. The intended user, action, client, environment and
observable result define working. The coding agent's client and operating-system
user are not substitutes for the intended downstream client and account.

Contents:

- [Record the contract](#record-the-contract)
- [Record observed evidence](#record-observed-evidence)
- [Report the result plainly](#report-the-result-plainly)
- [Remote CI](#remote-ci)

## Record the contract

Use the task command's `--completion-contract` option with a JSON file. The same
option on `task completion` updates an active task; terminal tasks require a new
task. Contract changes discard old approval and final-verification metadata.
Each claim uses this shape:

```json
{
  "schema_version": "1.0.0",
  "claims": [{
    "id": "owner-readback",
    "level": "journey",
    "actor_ref": "configured-owner",
    "client": "hosted-assistant",
    "environment": "production",
    "action": "List tools and read the connected account",
    "expected_result": "The intended tools are available and the configured account is returned",
    "context_file": "evidence/current-target.json"
  }]
}
```

For host discovery and later proof levels, the context file must record
`actor_ref`, `client` and `environment` matching the contract, plus `route`,
`revision`, `permissions` and `artifact_ref`. These are current, sanitised
observations of the target. Each is a non-empty string; use `not-applicable` only
when the field genuinely does not apply and explain why in the evidence file.
Refresh the context from the actual target before claiming completion.
Use opaque account references and
hashes of non-secret identifiers. Never put access tokens, credential hashes,
cookies, private source text or real personal identities into proof records.

For the example above, the current context could have this shape, populated
from the actual observation:

```json
{
  "actor_ref": "configured-owner",
  "client": "hosted-assistant",
  "environment": "production",
  "route": "https://service.example/mcp",
  "revision": "observed-deployment-reference",
  "permissions": "observed-scope-reference",
  "artifact_ref": "observed-tools-schema-reference"
}
```

Choose separate claims for source, CI, package, installation, host-discovery,
runtime, journey, scheduled, published or publication-verified. One level cannot
satisfy another. A scheduled job is incomplete publication evidence even when
the scheduling request succeeded.

Two levels check the experience itself. `intent-conformance` records a rendered
review of the built screens against the recorded product intent and design
package, made by a reviewer who did not build them. `owner-acceptance` records
the owner's own words accepting the result; it is never inferred. When the task
records `design_package.required: true`, closure as `PROVED` needs a passing
receipt at both levels, and a changed package manifest marks the recorded
version stale. The context file of each claim at these two levels names the
pinned manifest SHA-256 in `artifact_ref`, so a review or acceptance of an
earlier package version does not count after a newer one is pinned. A changed
product intent is reported in the same way. Both levels need direct
observation. Record the requirement, and
pin the package and intent versions, with the command below; the words in angle
brackets are parameters:

```text
super-outer task design --id <task-id> --required yes --reason <one sentence> --package <folder> --package-version <version> --intent <file> --intent-version <version>
```

For new work that has a [journey map](journey-map.md), `Done when` lists the
map's `Launch` rows as the journeys to perform. The contract holds one
`journey` claim for each of those rows. The
[finished-product walk](experience-review.md#finished-product-walk) performs
them, and a journey-level result is recorded per row. A row nobody performed
has no receipt and is reported as unproved with the reason.

## Record observed evidence

Supply `--completion-evidence` with a repository-contained JSON file. Its
`claims` array records each claim's `id`, exact `level`, `contract_sha256`,
`context_sha256`, `status` (`PASS` or `FAIL`), `observed_at`, `expires_at`,
`evidence_file`, `evidence_sha256` and `method`. Use `local-check` for a local
check or `direct-observation` for an action actually observed in its intended
medium. Host discovery, runtime and user-journey results require direct observation. Every
receipt must have a finite review period; choose one that matches the expected
rate of change and recheck after any relevant change even within that period.

The contract digest is produced by `completionContractDigest` in
`src/completion.mjs`. Context and evidence digests hash the actual file bytes.
Record failed or unavailable observations honestly. Do not rename a unit-test
output to a journey receipt or create a successful observation from an expected
result. A local file cannot authenticate who observed it. The checker binds
records and detects local drift; it cannot discover an unobserved external
change. Exact-source CI and independent review remain additional requirements
for production claims.

The command forms below take the actual task ID and file paths from the task
record; the words in angle brackets are parameters, not shell commands:

```text
super-outer task create --id <task-id> --completion-contract <contract-file>
super-outer task completion --id <task-id> --completion-evidence <receipts-file>
super-outer task completion --id <task-id>
```

Run the last command before the final reply. Read its claim results and reasons.
Task closure and the Stop hook use the same evaluator. Missing, wrong-level,
failed, edited or expired receipts cannot establish a recorded outcome. Legacy
tasks without a contract remain readable and explicitly lack user-outcome
proof. Ordinary tools remain available. A requested `PROVED` closure cannot skip
its recorded completion requirements or outstanding proof obligations.

## Milestone sweep

At a release or the end of a phase, run the sweep once:

```text
super-outer sweep --plan
```

It lists the dimensions that were never reviewed and those whose files
changed since their last receipt. Run each listed review once, with the
`dimension-reviewer` role for that dimension, and record each result in
`.engineering/super-outer/sweep-receipts.json` with the dimension, commit, date
and result. A dimension is not swept again until its files change or a ledger
trigger fires, so a second sweep with no changes does nothing.

Suggestions collected during the work, such as a platform service that does
manual work the session was doing by hand, are shown here and nowhere else:
once, together, after the sweep. A suggestion the owner answers with Not now
returns only when its trigger changes.

When the milestone's work touched an agent, an LLM chain, a skill or an MCP server, run the read-only `jev-opportunities` and `caveman-opportunities` skills once and show their findings with the suggestions.

Run the read-only `edge-cases` skill once over the milestone's changes and show its findings that are not handled and tested with the suggestions.

Run `super-outer lessons check` once and propose each merge, correction and removal it points to with the suggestions ([learning loop](learning-loop.md#check-and-prune)). Show the readiness gaps from `super-outer inventory` that are still open, once. Say in one line how many eval candidates `super-outer evals candidates` reports waiting, and whether a batch is due.

For deployed work the contract includes the claim that the change can be
observed in production: the platform's logs or traces show the changed path
running, and the receipt names where they were read.

## Decisions taken for the owner

An unattended run meets choices nobody answered in advance. Stopping at each
one wastes the run, and deciding silently hides it. Sort each choice:

- **Cheap to reverse**, such as a file's name, a library among equals or the
  order of two steps: proceed on the recommended answer and add one line under
  "Decisions taken" in the approach record, or in the reply when there is no
  record: what was chosen, why, and how to reverse it.
- **A product threshold, an irreversible action, money, people's data, or
  anything the approval phrase covers**: do not decide. Finish the work that
  does not depend on it and put the question to the owner.

A [standing answer](standing-answers.md) settles a choice of the first kind
without a line, and never a choice of the second kind.
At the end of the run, list every decision taken in the final reply, in plain
English, before the result. The owner reverses any of them with one sentence.

## After release

A release that passed its checks can still fail in use. At a production
release, add an entry to `.engineering/super-outer/after-release.json`:

```json
{
  "entries": [
    {
      "id": "2026-11-10-refund-emails",
      "released_at": "2026-11-10",
      "what": "errors on the refund path, refund emails sent, cost per day",
      "where": "the platform's logs and the email provider's dashboard",
      "due": ["2026-11-11", "2026-11-17"],
      "looks": []
    }
  ]
}
```

Name what to look at in three parts: errors on the changed path, the success
signal the work was for, and cost. The two dates are the next working day and
one week later. A look is one read of the logs or metrics named in `where`.
Record it under `looks` with its date and a one-line finding, and tell the
owner the finding in one line. A bad finding opens a fix or a rollback
discussion with the owner. It is never fixed silently.

Where the session-start hook runs, its one line names a look that is due. On a
host without that hook, read the file when you start work in a deployed
project. A look the session cannot make, because it has no access to the logs,
is reported to the owner with the exact place to look.

## Report the result plainly

Say which intended action worked, where it worked and what was checked,
against the task's `Done when`. If only
source work is complete, say so and identify the remaining client action. Do not
say everything works because deployment succeeded. User consent, a reconnect or
a missing account may require the user to act; name that step precisely.

Reasoned inference, planning, estimates and forecasts are not delivery claims.
Ground their assumptions and identify uncertainty without requiring evidence
that a future outcome has already occurred.

## Remote CI

A CI claim uses `direct-observation` and a JSON evidence file naming the GitHub
Actions repository, workflow and run ID. The checker rereads that run through
the existing GitHub verifier. It must be completed, successful and on the
current repository head, which must also match the recorded context revision.
An unavailable remote check leaves CI unproved. A supplied PASS value or a
matching hash alone cannot establish remote CI.
