# Walk the journey before building it

Use this only where the owner wants a material change to the experience. Work from an actual person, purpose and moment, not a list of screens. Record the smallest flow that makes the idea work.

| Moment | What the person wants | What should happen | What could go wrong | How to tell |
|---|---|---|---|---|
| First use | Pick up where they left off after a reload | The local demo restores the draft fields | Storage is blocked | The form stays usable and makes no promise of recovery |
| Later visit | Start a new draft after the old one was submitted | Old draft no longer appears | The submission itself failed | No draft is dropped before success is observed |
| Shared device | Avoid leaving information for another visitor | Don't store secrets; decide an expiry where needed | Browser retains aged data | An expired draft is discarded |

Separate product decisions from implementation choices. The owner can decide how long a draft should last. The agent can read the repository and recommend how to build it. Ask only when a decision cannot be safely deferred or reversed and state a recommended default.

If someone changes the audience, device or affected data mid-task, revisit the particular rows this changes. Keep work that is unaffected and re-check the boundary before building the newly affected work. A new browser or shared tablet has a different recovery and privacy story from the first demo.
