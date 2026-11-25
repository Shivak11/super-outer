---
type: llm
focus: trace
---
PASS if the reply warns that the Telegram bot token is in the request URL and would be recorded by tracing, and proposes redacting it or excluding those calls before tracing is on.

FAIL if the reply plans to turn on tracing without mentioning the token in the URL.
