#!/usr/bin/env bash
# An existing tutoring app with a product brief already written.
set -euo pipefail
git init -q .
mkdir -p .engineering/super-outer src
cat > .engineering/super-outer/product-brief.md <<'MD'
---
schema: super-outer-product-brief/1
kind: tutoring web app with an AI tutor bot
daily_users: 3000
launch_spike: false
updated: 2026-10-01
---

# Product brief: Tutor

## Facts
| Fact | Value | Status |
|---|---|---|
| Who uses it | Class 11 and 12 students in India preparing for board exams | decided 2026-10-01 |
| Device | Android phones first | decided 2026-10-01 |
| Users | about 3,000 a day, 10,000 in 12 months | decided 2026-10-01 |
| Most common action | asking the tutor bot to explain a question | decided 2026-10-01 |
| Budget | under 30,000 rupees a month | decided 2026-10-01 |
| Must never go wrong | a student sees another student's chats | decided 2026-10-01 |
MD
cat > src/tutor-bot.js <<'JS'
// The tutor bot answers one question at a time and keeps nothing between sessions.
export async function answer(question, model) {
  return model.complete(`You are a patient tutor. ${question}`);
}
JS
git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture"
