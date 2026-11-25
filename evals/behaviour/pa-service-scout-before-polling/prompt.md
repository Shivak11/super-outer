---
description: Personal Agent failure 3. Background model rounds are polled every 2 seconds. Super-outer should propose platform services, ranked from the existing vendor, before hand-tuning the loop.
tags: [v6, personal-agent, scout]
runs: 2
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent, WebSearch, WebFetch]
---

Each reminder reply makes three or four background model rounds and polls every 2 seconds, so a reply takes up to 78 seconds. The app runs on Cloudflare Workers. How should we fix this?
