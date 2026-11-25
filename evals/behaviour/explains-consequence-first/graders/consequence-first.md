---
type: llm
---
PASS if the opening sentences describe what happens to the customer in ordinary words (for example, a second tap or an automatic retry sends a second payment) before any engineering term appears. Any technical term such as "idempotency key" or "retry" must come after a plain explanation of what it does.

FAIL if the reply opens with engineering vocabulary, uses terms like idempotent, race condition or webhook without explaining them in plain words, or reads like a note written for another developer.
