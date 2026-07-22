# Handover: gold-notification-web

Read this before touching anything in `webapp/`. It's written for an agent or developer
with zero prior context on this specific subproject.

## What this is

A microservices + web frontend redesign of the root [gold-notification](../README.md)
Telegram bot, built as a college final-project deliverable (requirement: frontend and
backend built separately, as microservices, with an explainable architectural value
pitch). Domain: Indonesian gold (Pegadaian/Treasury) and BTC/ETH/SOL price tracking,
a rule-based BUY/SELL/WAIT signal, LLM narration, Telegram delivery.

**This does not replace the root project.** The root README explicitly chose "no
FastAPI, no Docker, no daemon" for the real deployed VPS bot — that system is a
separate, working, minimal cron pipeline and should be left alone. `webapp/` is a
deliberately different system that reuses the same domain logic (fetchers, signal math,
news search, LLM prompts) but is architected for the coursework requirement instead of
for running cheaply on a small VPS. Don't try to unify them.

Full architecture rationale and the "why split it this way" defense pitch is in
[`README.md`](./README.md) — read that first for the *design* reasoning. This document
covers *implementation state* instead: what's built, what's verified, what isn't, and
the traps to avoid.

## Current status (as of 2026-07-18)

All four pieces exist and were built, not just scaffolded — every endpoint below was
exercised against a live, running instance during the build session (not just
typechecked/compiled). Nothing is committed to git yet; `webapp/` is entirely
untracked. **Docker Desktop was not running by default on this machine** — start it
manually (`Docker Desktop.exe`) before `docker compose` commands; the daemon takes
~30-90s to become ready after launch.

### Verified working (live, not just unit-level)

- Market Data: ingestion scheduler fires on its own (no cron needed), `/prices`,
  `/signals`, `/sudden-move-check` all confirmed against real Pegadaian/Treasury/Indodax
  responses.
- Insight: `/narrate` confirmed to call Market Data over HTTP, fetch real news
  (GNews + Google News RSS), and persist to its own `analysis_runs` table. `/chat`
  confirmed with a real multi-round tool-calling loop against a live LLM.
- Notification: admin API (`/admin/subscribers`, `/approve`, `/deny`) confirmed live,
  including a real Telegram `sendMessage` call on approve. The scheduler's
  `runNarrationBroadcast` confirmed to chain Market Data → Insight → Telegram
  correctly.
- Frontend: all three pages (Dashboard, Chat, Admin) confirmed working against live
  backends in an actual browser, including the full admin approve flow.
- `docker compose build && up`: all four containers build and start clean; confirmed
  cross-container HTTP (Insight → `http://market-data:8001`) works over the compose
  network; confirmed the frontend's baked-in `VITE_*` URLs correctly reach the
  host-mapped ports from the browser.

### NOT verified — do this before claiming the bot integration works

**The interactive Telegram flow was never tested.** `/start`, `/stop`, `/pending`,
`/approve <id>`, `/deny <id>` typed *in Telegram*, and free-text chat replies via the
bot, all depend on `bot.launch()` (long-polling `getUpdates`). This was deliberately
never run against the real bot token, because Telegram allows only one `getUpdates`
consumer per bot token — launching it here could conflict with the root project's live
VPS cron poller if that's currently active. What *was* verified is one-way
`sendMessage` calls (confirmed real messages land in the owner's Telegram chat) and the
full narration pipeline that feeds those messages.

To actually verify the interactive flow: confirm the VPS cron bot is stopped (or
accept a short overlap), then run the notification service **without**
`SKIP_TELEGRAM_POLLING=1` and interact with the bot for real from a Telegram client.

### Known non-blocker

`SUMOPOD_MODEL=gemini/gemini-2.5-flash` (copied from the root project's `.env`)
currently 404s against SumoPod. This is a stale/invalid model id, not a code bug — the
root README documents the same caveat ("must be a real id from `list_models.py`").
The fail-soft path handles it correctly (falls back to the rule engine's own
`signal_reasons`, `reasoning` comes back `null`), so nothing is broken, but a real demo
should run `list_models.py`-equivalent (hit SumoPod's models endpoint, or just try
`SUMOPOD_CHAT_MODEL`'s value, which *does* work) and put a valid id in
`insight/.env` / `webapp/.env` before presenting.

## Architecture at a glance

```
frontend (React/TS, :5173)
  │  Dashboard, Chat, Admin — talks to all three below directly, no gateway
  ▼
market-data (Python/FastAPI, :8001)      insight (Python/FastAPI, :8002)      notification (Node/TS, :3000)
  - owns `prices` table                    - owns `analysis_runs`,              - owns `subscribers`,
  - APScheduler ingestion                    `chat_history`                       `alert_state`
    (btc/eth/sol@1min, treasury@15min,     - calls market-data over HTTP        - telegraf bot (long-poll)
    pegadaian daily)                       - calls SumoPod/GNews/Tavily         - node-cron scheduler calls
  - GET /prices/{source}                   - POST /narrate, /chat                 market-data + insight,
  - GET /signals(/{source})                - GET /analysis/{group}                broadcasts via Telegram
  - GET /sudden-move-check                 - GET /why-moved                     - admin REST API (token-gated)
```

No service reads another's SQLite file directly — only HTTP. That boundary is load-
bearing for the "why microservices" defense; don't casually add a shared DB or direct
cross-service imports.

## Directory layout

```
webapp/
├── README.md              -- architecture + defense pitch (read this first)
├── HANDOVER.md             -- this file
├── docker-compose.yml
├── .env.example            -- compose reads webapp/.env automatically
├── services/
│   ├── market-data/        -- Python/FastAPI, own README + .env.example
│   ├── insight/             -- Python/FastAPI, own README + .env.example
│   └── notification/        -- Node/TS, own README + .env.example
└── frontend/                -- React/TS/Vite, own .env.example
```

Each service directory has its own README with endpoint tables and standalone-run
instructions — check there before this file for anything endpoint-specific.

## Running it

**Docker (full stack):**
```bash
cd webapp
cp .env.example .env   # fill in credentials, or reuse the existing .env if present
docker compose up --build
```
Frontend at `localhost:5173`. Give Market Data's scheduler a few minutes after first
boot for real signal data to appear (BTC/ETH/SOL ~1 min, Treasury ~15 min, Pegadaian is
once-daily).

**Standalone (faster iteration on one service):** each service's own README has venv/
npm-install instructions. Run market-data and insight first (notification and frontend
depend on them being reachable).

## Gotchas a new agent needs to know

1. **`node:sqlite`, not `better-sqlite3`.** The notification service uses Node's
   built-in `node:sqlite` (`DatabaseSync`) because this dev machine has no Visual
   Studio Build Tools, and `better-sqlite3`'s native addon failed to compile.
   `node:sqlite` needs Node 22.5+, ships with zero native deps, and the API is close
   enough to better-sqlite3 (`.prepare().run()/.get()/.all()`) that this was a small
   swap. It logs an "experimental feature" warning on every start — that's expected,
   not an error. If you add a new Node service, default to `node:sqlite` here too
   rather than reaching for better-sqlite3.

2. **`SKIP_TELEGRAM_POLLING=1`** on the notification service skips `bot.launch()`
   while keeping the admin API and outbound `sendMessage` working. This exists
   specifically so the service can be run/tested against the *same* bot token as a
   potentially-live deployment without a `getUpdates` conflict. It is not set by
   default in `docker-compose.yml` — if you bring the stack up with a real
   `TELEGRAM_BOT_TOKEN` in `webapp/.env`, it **will** call `bot.launch()` and start
   real long-polling. Set `TELEGRAM_BOT_TOKEN` blank, or add
   `SKIP_TELEGRAM_POLLING: "1"` to the notification service's compose environment,
   if you need to run this alongside a live bot deployment.

3. **Frontend env vars are baked in at build time and must be browser-reachable.**
   `VITE_MARKET_DATA_URL` etc. get compiled into the static JS bundle by Vite — they
   cannot be docker-compose service hostnames (`http://market-data:8001`) because the
   browser runs on the host, outside the compose network. They must be
   `http://localhost:<port>` (the host-mapped port). This is already correct in
   `docker-compose.yml`'s frontend build args — don't "fix" it to use service names.

4. **Service boundary discipline.** If you're tempted to have Insight read Market
   Data's SQLite file directly for convenience (e.g. to avoid an HTTP round-trip),
   don't — that's the one property that keeps this a real microservices system rather
   than a distributed monolith for the course rubric.

5. **Rule-engine-owns-the-signal invariant carries over from the root project.** The
   LLM in Insight (`narration.py`, `chat.py`) explains the BUY/SELL/WAIT signal, never
   invents or overrides it. Preserve this if you touch prompts.

## Suggested next steps

- Verify the interactive Telegram flow for real (see "NOT verified" above).
- Fix `SUMOPOD_MODEL` to a valid id before any live demo.
- Nothing is committed to git — commit when the user asks, not proactively.
- If the course rubric wants a written report/diagram, `README.md`'s "why split it
  this way" table plus the ASCII architecture diagram above are reusable starting
  points.
