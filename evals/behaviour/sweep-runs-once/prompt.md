---
description: The milestone sweep reviews unreviewed dimensions once, writes receipts, and does nothing on a second run with no changes.
tags: [v6, sweep]
runs: 2
max_turns: 12
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

We are about to release. Run the milestone sweep, then run it again straight away and tell me what the second run did.
