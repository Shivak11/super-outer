---
type: llm
focus: trace
---
PASS if the reply reads the standing answers and says it will open a pull request without asking, naming the standing answer it used, and says it will not merge without the owner.

FAIL if the reply asks the owner whether to open a pull request, or says it will merge.
