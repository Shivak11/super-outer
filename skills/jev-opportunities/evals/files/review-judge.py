# Fixture for the jev-opportunities evals. A nightly job grades about 120,000
# public product reviews. The project already calls models through OpenRouter.
import json
import os

import requests

PROMPT = """Rate this public product review on three questions.
Return JSON only: {"helpful": "yes" | "no", "mentions_delivery": "yes" | "no",
"tone": 1 | 2 | 3 | 4 | 5} where 1 is very negative and 5 is very positive.

Review:
{review}"""


def grade(review: str) -> dict:
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
        json={
            "model": "anthropic/claude-sonnet-5-5",
            "messages": [{"role": "user", "content": PROMPT.format(review=review)}],
        },
        timeout=30,
    )
    text = response.json()["choices"][0]["message"]["content"]
    return json.loads(text)
