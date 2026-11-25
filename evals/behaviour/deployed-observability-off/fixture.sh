#!/usr/bin/env bash
# A deployed chat bot on Cloudflare Workers with observability switched off.
set -euo pipefail
git init -q .
mkdir -p src .engineering/super-outer
cat > wrangler.jsonc <<'JSON'
{
  "name": "reminder-bot",
  "main": "src/index.js",
  "compatibility_date": "2026-09-01",
  "observability": { "enabled": false }
}
JSON
cat > src/index.js <<'JS'
// Answers Telegram messages and sets reminders. Deployed with `wrangler deploy`.
export default {
  async fetch(request, env) {
    const update = await request.json();
    const reply = await env.MODEL.reply(update.message.text);
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      body: JSON.stringify({ chat_id: update.message.chat.id, text: reply }),
    });
    return new Response("ok");
  },
};
JS
git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture"
