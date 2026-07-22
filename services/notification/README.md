# Notification Service

Telegram bot + subscriber management + the scheduler that ties Market Data and
Insight together into a push. Node/TypeScript, not Python — mature Telegram bot
tooling (telegraf) and, more importantly, this service **is** the always-on process,
so it long-polls Telegram directly instead of the root project's 1-min cron
short-poll workaround. That's a genuine upgrade, not just a rewrite: replies land
immediately instead of up to ~1 minute later.

Owns subscriber state (`subscribers` table) and the sudden-move alert cooldown
(`alert_state`) in its own SQLite file.

## Run standalone

```bash
npm install
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ADMIN_TOKEN
npm run dev
```

Requires Market Data and Insight running and reachable at `MARKET_DATA_URL` /
`INSIGHT_URL`. Without `TELEGRAM_BOT_TOKEN` set, the bot doesn't launch but the admin
API still starts (useful for frontend development without a live bot).

## Telegram commands

Same access model as the root project: owner (`TELEGRAM_CHAT_ID`) chats freely and can
run `/pending`, `/approve <chat_id>`, `/deny <chat_id>`; anyone else must `/start`
first and wait for owner approval; `/stop` opts out.

## Admin REST API (for the frontend)

All routes under `/admin`, require header `x-admin-token: <ADMIN_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/subscribers` | All subscribers |
| GET | `/admin/subscribers/pending` | Pending requests only |
| POST | `/admin/subscribers/:chatId/approve` | Approve + notify the subscriber on Telegram |
| POST | `/admin/subscribers/:chatId/deny` | Deny a pending request |
