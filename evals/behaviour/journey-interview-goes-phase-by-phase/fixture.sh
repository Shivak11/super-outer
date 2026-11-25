#!/usr/bin/env bash
# A new product with its brief facts decided and no journey map or story walk yet.
set -euo pipefail
git init -q .
mkdir -p .engineering/super-outer
cat > .engineering/super-outer/product-brief.md <<'MD'
---
schema: super-outer-product-brief/1
kind: long-running agent with per-student memory
daily_users: 2000
launch_spike: true
updated: 2026-11-18
---

# Product brief: study buddy

## Facts
| Fact | Value | Status |
|---|---|---|
| Who uses it | College students revising for exams | decided 2026-11-18 |
| Device | Phone browser | decided 2026-11-18 |
| Where they are | India | decided 2026-11-18 |
| Now anchor | 300 students at one college | decided 2026-11-18 |
| Next anchor | 2,000 students across the college in exam week | decided 2026-11-18 |
| Users on a normal day | 300 now, 2,000 at launch, 2,000 in 12 months | decided 2026-11-18 |
| Launch day or campaign spike | Yes: exam week, with 800 students online at 9 pm | decided 2026-11-18 |
| Most common action | Ask a question about a topic and ask for another example | decided 2026-11-18 |
| Must never go wrong | One student sees another student's history | decided 2026-11-18 |
| Acceptable data loss | The last few minutes of a session | decided 2026-11-18 |
| Budget per month | 40 rupees of AI spend per student | decided 2026-11-18 |
| Sensitive data | Students' names and study history | decided 2026-11-18 |
| Data must stay in | No legal requirement; hosted in India | decided 2026-11-18 |
MD
git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture"
