# The experiment track

Some work exists to answer a question: will this approach work, what does this
screen feel like, how does this service behave. Its code will be thrown away or
rebuilt. Reviewing it as a finished product wastes the owner's time.

## When it applies

The owner calls the work a prototype, a spike, an experiment, a throwaway, a
proof of concept or a quick try, or asks to "just see" whether something works.
The owner's word sets the track. Never choose it yourself to avoid review, and
never apply it to work that touches a protected domain: sign-in, payments,
stored customer data, production, secrets or git history.

Decide first whether the work touches anything real: production, real
people, real money, stored data, a secret, or anything sent outside, such as a
post, an email or a message. If it does, this track does not apply and the
request keeps its ordinary depth, whatever it is called.

Where the hook is installed, a plainly worded request ("build a quick
prototype", "as an experiment") arrives with a line naming this page. The hook
changes nothing else: the depth, the questions, the specialists, the brief
interview and the story walk are all still listed, because the hook cannot
tell whether the work touches anything real. You decide that, with the limits
above. When the track applies, it replaces all of them. When it does not,
they stand. The hook does not recognise every wording, so on other wordings,
and on a host without the hook, apply this page from the owner's words.

## What changes

- Ask at most one question: what the experiment must show.
- Skip the specialists, the design package, the proof obligations, the tool
  check and the milestone sweep.
- Build in a scratch folder outside the repository, or on a branch named
  `prototype/<slug>`. Never merge that branch.
- Use made-up data. Use test keys and test modes of outside services.

## What does not change

- No real customer data, no production system, no real secret, no real money.
- An action with an extreme consequence keeps its approval phrase.
- Repository rules about commits and files still apply to anything written
  inside the repository.
- Say plainly what was run and seen, and what was only expected.

## How it ends

Report three things: what the experiment showed, what surprised you, and what
a real build would do differently. Then stop.

Promotion is a new request. Route it at its real depth, run the interview and
the approach stage, and treat the prototype's code as a sketch: rewrite it, or
review every line as new work before it is kept. Do not carry a prototype into
the product because it already runs.
