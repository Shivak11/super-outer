# Proof and recorded-input verification

Require a check that would fail on the old behavior when feasible. Verify every
claim in its own medium: source, tests, browser, simulator, physical device,
API, database, logs, metrics, CI, installation, runtime, or direct user
journey.

When changing a filter, parser or classifier over inputs already recorded on
disk, replay the accessible recorded population through the old and new code
in a read-only, side-effect-free harness. Define the intended changes from the
approved behaviour independently of the implementation. Report counts for
intended changes, unexpected changes and unchanged inputs; treat unrecognised
input shapes as a finding. State any coverage or access gap instead of claiming
a full replay. Keep private text out of reports, commits and external tools.

When attributing an observed incident, reproduce it with recorded component
input. For a prompt hook, use its recorded payload or queued input; later
model-visible framing is different evidence. A valid synthetic component
input can establish a new boundary defect without proving what caused an
earlier incident. Label synthetic reproductions and their scope clearly.
Missing historical input leaves the historical attribution unconfirmed.

When the owner reverses a recorded decision during the build, write down the
old claim's distinctive phrases at the moment of the reversal. Before release,
search every shipped text file for them: skill descriptions, READMEs, command
hints, file headers and the changelog. Tests of wording style and of the
presence of terms pass on a sentence that is no longer true.

When a change adds a module that is loaded at run time, or code that falls back
quietly when it fails, check every installer that builds a copy of the runtime.
Run the staged copy itself and show that the new code path ran there, through a
probe line or a side effect that only the feature produces. A clean exit does
not show that the feature loaded.

When code added to a hook or a request path has a time limit, time the new
path end to end on a fixture of realistic size and input count before
accepting a deadline wrapper. Report whether the normal case finishes inside
the budget, as well as that the worst case stops at it. Count subprocess starts
and network round trips per call, because their fixed cost grows with the
number of inputs.

## Tests that outlive the code

When the promise is "for every input, this holds", a handful of examples does
not prove it. A parser accepts what it produced, money adds up across any
split, a permission check refuses every role outside its list, an operation
gives the same result when repeated. For such a promise write a test that
generates inputs (property-based testing; `fast-check` and Hypothesis are
common libraries) and record the seed of any failing run so that it can be
replayed. Use it where a wrong edge case costs money, data or trust, and keep
example tests for everything else.

Name the few tests that state the product's promises from outside as boundary
tests: a journey a person completes, a property like those above, a load the
service must carry. Record them in the approach record. A rewrite, by a person
or an agent, must pass them unchanged, and a builder never edits one to make
it pass. Tests of internal structure may be rewritten with the code they
describe.

The builder is not the sole final judge. A fresh verifier receives the recorded
record, exact diff and head, required journeys, failure cases, and read-only
evidence surfaces. It attempts to disprove completion.

Use terminal states:

Ordinary path: `UNASSESSED → NEEDS_CLARIFICATION → CONFIRMED → ACTIVE → VERIFYING → PROVED`.

Only an extremely critical action adds `AWAITING_APPROVAL` before `ACTIVE`.

Alternate terminals: `SKIPPED`, `CANCELLED`, `BLOCKED`,
`BUDGET_EXCEEDED`, `ROLLED_BACK`.

`PROVED` requires current evidence for every claim. Source, CI, package,
installation, host discovery, hook execution, runtime journey, and migration
proof remain separate. For `QUICK`, `FOCUSED`, and `FULL`, record independent
review as `PASS`, advisory concern, or missing; the latter two must remain
visible but do not block ordinary completion. A `CRITICAL` production-proof
claim requires independent `PASS` against the exact clean head.

FULL and CRITICAL production delivery also requires a named GitHub Actions run
that Super-outer rereads live for that exact version. Missing proof stays
unproved rather than becoming a general stop; only the extremely critical
action or `CRITICAL` production-proof claim is blocked. Bind local source
evidence to its exact bytes and version, and retain the limitation that this
does not authenticate the artifact's producer or rerun the underlying check.
