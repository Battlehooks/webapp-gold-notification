# gold-notification-web — microservices college project

A web + microservices redesign of the [gold-notification](../README.md) Telegram bot,
built as a final-project deliverable. The original project is a working, deliberately
minimal single-VPS cron system — "no FastAPI, no Docker, no daemon" by design (see the
root README). This directory is a **separate system**, not a replacement: it exists to
demonstrate service decomposition, polyglot microservices, and a real web frontend on
top of the same domain (Indonesian gold + BTC/ETH/SOL price tracking, a rule-based
BUY/SELL/WAIT signal, LLM narration, and Telegram delivery).

## Why split it this way (the defense pitch)

The three backend services aren't an arbitrary split — each one has a genuinely
different failure mode, scaling profile, and "right tool":

| Service | Language | Why this language | Why it's a separate service |
|---|---|---|---|
| **Market Data** | Python | Reuses the existing fetcher/stats code almost directly; pandas/requests is the path of least risk for I/O + numeric work | Polls external APIs every 1–15 min, must stay cheap and always-up. A crash here must not take down narration or Telegram delivery. |
| **Insight** | Python | LLM prompt orchestration and tool-calling agents are Python's strongest ecosystem; reuses `news.py`/`responder.py`'s logic directly | Calls a paid LLM + two news APIs — slow, rate-limited, and the one most likely to degrade. Isolating it means a SumoPod/GNews outage never blocks price logging or basic alerts. |
| **Notification** | Node/TypeScript | Mature Telegram bot tooling (telegraf) and native long-polling/webhook support; shares DTO types with the TypeScript frontend | Owns subscriber state and delivery — the user-facing edge. Also upgrades the original design: the Python bot deliberately used a 1-min cron short-poll to *avoid* running a persistent process; here the service **is** a persistent process, so replies are near-instant instead of lagging up to a minute. |
| **Agent** | Python | Same tool-calling-loop precedent as Insight, reused directly | Owner-only ops agent with real, unsandboxed shell access to the VPS (restart containers, check logs/disk/memory, manage subscribers). This is the highest blast-radius capability in the project, so it's isolated from Insight's already-public, unauthenticated price-chat surface — a bug or prompt-injection risk there must never reach shell tools here. Deliberately **not** run in Docker like the other three — see `services/agent/README.md`. |

Each service owns its own SQLite file — no shared database — so they can only talk to
each other over HTTP. That's the one microservices rule enforceable at zero infra cost,
and it's why this can't quietly degrade into a distributed monolith.

Frontend is a plain **web app** (React + TypeScript + Vite), not mobile — same backend
either way, but far faster to build and demo solo within a semester.

## Services

```
webapp/
├── services/
│   ├── market-data/     Python (FastAPI) — ingestion + rule-based signal engine
│   ├── insight/         Python (FastAPI) — news context + LLM narration + chat agent
│   ├── notification/    Node/TypeScript (Express + telegraf) — Telegram bot, subscriber admin, scheduler
│   └── agent/            Python (FastAPI) — owner-only ops agent, real shell access (runs bare-metal, NOT in docker-compose)
├── frontend/             React + TypeScript (Vite), Nocturne design — overview, asset detail, Ask AI, admin, agent chat
└── docker-compose.yml
```

Request flow for the routine cycle: Notification's scheduler → `GET /signals` (Market
Data) → `POST /narrate` (Insight, which itself calls Market Data + news providers) →
Telegram broadcast. The sudden-move alert is the same chain, triggered by Notification
polling `GET /sudden-move-check` every 5 minutes instead of waiting for the 4h tick.

A second, separate flow: the owner reaches the Agent Service either via Telegram's
`/agent <message>` command or the frontend's "Agent" tab, both authenticated (owner
Telegram chat ID / `AGENT_TOKEN` respectively) and both hitting the same tool-calling
loop with real shell access to the VPS. See `services/agent/README.md` before running
this anywhere reachable.

See each service's own README for endpoints, env vars, and how to run it standalone.

## Running everything

```bash
cd webapp
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SUMOPOD_API_KEY, ADMIN_TOKEN, etc --
# same credentials as the root project. docker-compose reads this file automatically.

docker compose up --build
```

Frontend: http://localhost:5173 · Market Data: http://localhost:8001/docs · Insight:
http://localhost:8002/docs · Notification admin API: http://localhost:3000

Give Market Data's ingestion scheduler a few minutes after first startup before
expecting signals/charts to show real data (BTC/ETH/SOL land within ~1 min; Treasury
within ~15 min; Pegadaian is once-daily).

`docker compose up` brings up three of the four backend services. The Agent Service is
**not** included — it's meant to run bare-metal on whatever machine you want it to
administer, since a containerized shell tool would silently report the container's own
state instead of the real host's. Start it separately per
`services/agent/README.md` (`uvicorn app.main:app --port 8003`); the frontend's
"Agent" tab and Telegram's `/agent` command both expect it at `AGENT_URL`/
`VITE_AGENT_URL` (`http://localhost:8003` by default).

Each backend service can also run standalone outside Docker for development — see its
own README (`services/*/README.md`) for the venv/npm-install instructions used to build
and test this project.
