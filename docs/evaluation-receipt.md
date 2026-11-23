# Initial evaluation receipt

Scope: synthetic, no tools. No real repository, user data, deployment or device was involved.

- The offline grader self-test passed for six fixtures, including deliberately incorrect variants.
- Claude Code 2.1.330, with the Sonnet alias, produced responses for three separate fixtures in fresh sessions with tools disabled and the skill text supplied in the prompt. The structural checks were 6/6 for the draft-reload case and 5/6 each for the typo and denied-read cases. In both partial passes the response put one evidence-limit tag in the check list, even though the prose noted the limit. A manual read found that the draft-reload case named the requested checks, the typo response stayed within local scope and identified the intended test, and the denied-read response stopped rather than proposing a workaround.
- Codex CLI 0.169.0 did not start successfully in the test environment, so there is no Codex model result in this receipt. Local discovery by the Vercel CLI is a packaging check, not a Codex behavioural test.
- These are spot checks of response shape and recommendation quality, not a baseline comparison or a reliability claim. All fixtures and instructions for reproducing the procedure are in the [eval guide](evals.md).
