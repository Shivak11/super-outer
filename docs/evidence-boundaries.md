# What each proof actually means

Super-outer never treats one successful check as proof of something else.

Working means the intended person can complete the intended action in the
intended client and environment, and the result can be checked. The task's
completion contract records that requirement before implementation. Task
closure and final reporting evaluate the same current receipts. A changed
target, expired receipt or changed evidence file makes the old result unusable.
The operator must refresh the target record from current runtime evidence;
checking local files cannot detect an external change nobody observed.

| Proof | What it establishes | What it does not establish |
|---|---|---|
| Source checks | The supplied evidence bytes report a passing check for the exact repository version | Who produced those bytes, or that Super-outer independently reran the check |
| CI | A named GitHub Actions run was reread live, completed successfully, and matches the exact repository version | That the package came from that version |
| Package | The archive is complete, safe to inspect, and repeatable | That either host discovered it |
| Isolated staging | Files can be placed safely in a temporary home | That the plugin is active in Claude or Codex |
| Host discovery | The host lists the enabled v4 plugin; the current source is checked when the host reports its installed path | That its hooks actually ran |
| Hook execution | Both hosts completed a probe bound to this activation, source, and plugin version | That either host obtained a model response |
| Model response | The host completed the small model-backed probe | That a real review journey or product workflow works |
| Live journey | The relevant user workflow worked in its real medium | That every failure or recovery path worked |
| Scheduled | The service recorded the intended future action | That the action ran |
| Published | The service recorded a completed publication | That the exact public content matches the approved artifact |
| Publication verified | The actual public body and attachment were read back and matched | That later edits or deletion cannot change it |
| Migration | v4 and v3 changed ownership as intended | That rollback restores the previous state |
| Rollback | The recorded previous state was restored | That a later installation will succeed |
| Warn-first notice | Expected and actual state differed, and the consequence was disclosed | That the action is safe or that a missing check passed |
| Independent review | A fresh reviewer passed, raised a concern, or was recorded as missing for the exact work | That another proof layer passed or an advisory result may be hidden |

For the owner, these are translated into simple statements such as “the checked
version is the version we would release” or “the plugin is present, but we have
not yet proved that Codex ran it.” The table and hashes remain internal unless
technical detail is requested.

A locally supplied version or JSON claim cannot turn CI green. The repository
gate rereads the named run through GitHub before accepting it.

The durable task record retains both sides of the source boundary: the exact
artifact and verification-record hashes, and `producer_authenticated: false`.
This makes the limitation visible after the conversation is gone. Host probe
failures are classified separately as missing account, transport failure,
provider failure, or executable failure; only a narrowly recognised missing
account may limit model proof without erasing completed hook activation.

A branch mismatch or ordinary task-scope drift is normally advisory.
Super-outer warns and continues with analysis, reversible code changes,
unfamiliar non-critical tools, routine Git delivery, and CI reruns; it blocks
only an extremely critical action. Independent review is advisory for QUICK,
FOCUSED, and FULL. A failed,
missing, or incomplete review remains visible and can block only an extremely
critical action or a CRITICAL production-proof claim. An orange `⚠️ Worth a look`
line records a limitation; it does not prove safety. A red `🛑 Stopping here`
line is reserved for the critical boundary. The emoji remains without colour.

Task labels do not create consequences. A `CRITICAL` label, local destructive
mechanism, or missing host session ID cannot by itself block ordinary work.
Super-outer stops only when the live action or explicit production-delivery
claim establishes the extreme consequence.
