---
type: llm
focus: trace
---
PASS if the reply asks the owner at least one question about what the agent should remember or what students experience (for example whether it should recall yesterday's session, whether students can see or delete what it remembers, or what the owner can spend per student), each with a recommended answer, AND no question asks the owner to choose a database, vector store, framework, model provider or other tool.

FAIL if any question asks the owner to pick a tool or technology, or if the reply asks no question about memory at all.
