#!/usr/bin/env bash
set -euo pipefail
git init -q .
mkdir -p .engineering/super-outer
cat > .engineering/super-outer/ledger.json <<'JSON'
{ "schema_version": "1.0.0", "entries": [ { "id": "ladder-10000-queue", "prompt": "Move background replies onto a managed queue when messages pass 20,000 a day", "why": "judgement", "status": "DEFERRED", "ladder": "10000", "revisitWhen": ["queue consumer"], "measuredWhen": [ { "metric": "messages_per_day", "comparison": ">=", "threshold": 20000, "says": "messages pass 20,000 a day" } ], "recorded_at": "2026-10-01" } ] }
JSON
cat > .engineering/super-outer/metrics.json <<'JSON'
{ "measured_at": "2026-10-22", "metrics": { "messages_per_day": 23500 } }
JSON
git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture"
