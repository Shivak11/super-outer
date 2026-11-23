# Super-Outer

Super-Outer is for non-technical people who want to code creatively. Start with an idea in your own words. The skill helps Claude Code or Codex turn it into a change you can understand, steer and check without learning the names of all the things under the bonnet.

This is the public, skill-only starter edition. It adds an engineering workflow, not another model or service.

## Your first minute

1. Install it (one command, below).
2. Open your coding agent in a project.
3. Ask for a change and mention the skill, for example: `Use super-outer. Make the registration form keep a draft if the page reloads.`
4. Expect the agent to read your repository's rules first, pick a level of care, make a recommendation, and finish with what changed, what it checked, and what it did not check.

## What this installs

One skill folder named `super-outer`, containing `SKILL.md` and two optional references. The eval runner in this repository is not installed with the skill.

It does not install hooks, background processes, telemetry, or credentials. The skill itself initiates no outbound calls, although the coding agent still uses its normal model service and any tools you permit. Installing it is done by the Vercel `skills` tool, which you run yourself.

```
npx skills add Shivak11/super-outer --skill super-outer
```

## Your agent still controls the tools

Instructions are not enforcement. This skill cannot stop an agent from misbehaving, cannot grant permissions, and never overrides your host's permission prompts. If you deny an action, the skill tells the agent to adjust, not to find a way around it. Your protection against bad actions is your host's permission settings and your own review, not this file.

## Architecture

![Architecture showing the creative brief, change sizing, material review, host permissions, verification and separate eval loop](docs/architecture.svg)

[Detailed walkthrough and diagram source](docs/architecture.md)

## How it works in practice

When invoked (by naming the skill in your request, or when your agent host decides the description matches; exact invocation syntax differs by host, so check your host's skill documentation), the agent follows this flow:

1. Reads repository rules and evidence first.
2. Sizes the change by blast radius: tiny, local, or wide.
3. Sketches user journeys only when behavior visible to people changes materially.
4. Asks you a question only for a real user, policy, or trade-off decision with no safe reversible default.
5. Always gives a recommendation, with reason and cost.
6. Names observable checks and what is not covered.
7. Reports honestly, without implying unverified outcomes.

| Blast radius | Example | What you should see |
|---|---|---|
| Tiny | Fix a typo in a button label | A quick fix and a two-line report. No plan, no questions. |
| Local | Save a form draft after reload | Short plan, short journey, tests for visible behavior. |
| Wide | Change how personal data is stored or deleted | A plan, risks, rollback idea, and a request for your confirmation before changes. |

## Example 1: registration form that saves a draft (local demo)

You say: `Use super-outer. In my local demo, the registration form should keep what I typed if I reload the page.`

A good response looks like this in spirit:

- Level: Local. Reversible, contained to the demo, but it stores typed input in the browser.
- Journey: type name and email, reload, fields are still there; submit, draft is cleared; if browser storage is blocked, the form still works.
- Defaults chosen without bothering you: browser-only storage, never save password fields, clear on submit.
- A question only if it matters: will this demo run on shared computers? Recommendation: let drafts expire, because the next person could see someone's entry.
- Checks: fill, reload, values return; submit, reload, fields empty; password field stays empty after reload; blocked storage does not break submit.
- Not covered unless tested: other browsers, mobile, a real server.

## Example 2: a tiny change

You say: `Use super-outer. The button says Submt, fix it.`

Expected: the agent fixes the label, checks for the same typo elsewhere, runs a cheap check if one exists, and reports in a few lines. No design committee.

## Evals and limits

Run `node evals/check.mjs --self-test` to check the fixtures and grader without a model or network. The [eval guide](docs/evals.md) shows how to grade a synthetic model response and run a fair comparison. See the [initial evaluation receipt](docs/evaluation-receipt.md) for exact checks, partial passes and limits. The local self-test checks the harness, not the quality of every model.

Limits:

- It is advice to a model. Behavior varies by model, host, and prompt, and it can be ignored or misapplied.
- It cannot verify claims for you. Ask to see test output when something matters.
- It does not replace code review, backups, or your host's permission settings.
- Blast radius judgments are heuristics; the agent can misjudge. You can say `treat this as wide`.
- It contains no security tooling and no exploit material.

## Contributing

Issues and pull requests that sharpen wording, add generic examples, or improve eval cases are welcome. Please keep the skill free of hooks, credentials, telemetry, and outbound calls.

## License

[MIT](LICENSE).
