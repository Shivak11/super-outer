# Safe activation

Read this before asking the activation question in
[archetypes/safe-activation.json](archetypes/safe-activation.json).

Explain before asking, in ordinary words: both versions can live in the same
deployed service, the current one can stay the default while selected people
test the revision, and a switch returns everyone to the current version without
a revert or a redeploy. Keep branch-by-abstraction, dark launch and canary out
of the conversation unless technical detail is asked for.

Then ask the activation question from
[archetypes/safe-activation.json](archetypes/safe-activation.json),
and work through its decisions in sequence order: what runs when the switch is
off, who may switch it on, how saved results and stored records stay separate,
and how to switch it off for everyone without a release.

Before phrasing the activation question, check whether the change touches
content that existing records hold fixed, such as published versions, sent
messages, signed documents or stored titles. If it does, offer an answer scoped
by record, for example "new screens for records created from now on, while
running ones keep today's screens until they end", in place of whichever of
the activation question's three answers fits the change least, and say what
people using existing records would see under direct replacement. When the change touches many strings or screens, ask before
building, because the answer decides whether a switch is needed at all.

Before adding a switch for a new versioned behaviour, list how the two or
three most recent versioned behaviours in the repository are switched on and
which call paths reach them, and switch the new one on the same way. A switch
placed somewhere new is missed by every existing path that never passes it.
After the switch moves, regenerate saved fixtures and stored test saves.
