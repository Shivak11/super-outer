---
type: llm
focus: trace
---
PASS if the reply asks at most three questions in one batch, each with a recommended answer, and none about a mechanism such as the database or scheduler.

FAIL if the reply asks more than three questions, spreads them across turns, or asks about a mechanism.
