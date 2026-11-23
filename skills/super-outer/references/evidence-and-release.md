# Evidence and release

Choose a check matched to the claim. A passing unit test is evidence about the tested code, not proof that the shipped product works for a user.

| Claim | Evidence | What it still does not establish |
|---|---|---|
| The form restores a draft after refresh | Inspect the browser after a reload and assert the restored fields | Other browsers or devices |
| A blocked storage API doesn't break the form | Test the failure path with synthetic input | No bugs in the live product |
| The deployment reaches customers | Verify the current version through an authorised release/readback path | That customers adopted it |

Before a material rollout, name the intended audience, behaviour to be checked, way to detect trouble and way to revert. Start with an ordinary local test. Treat code changes, a successful build, deployment and a user-visible check as separate events. Ask for approval where appropriate without changing production or widening access on the strength of a draft plan.

At handoff, tie each meaningful claim to what was actually observed. If tests could not run or permissions blocked a check, say what was blocked and leave that claim unverified. Do not try another identity or path to evade a denial.
