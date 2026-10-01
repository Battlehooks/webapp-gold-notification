# gold-notification-web — microservices college project

A web + microservices redesign of the [gold-notification](../README.md) Telegram bot,
built as a final-project deliverable. The original project is a working, deliberately
minimal single-VPS cron system — "no FastAPI, no Docker, no daemon" by design (see the
root README). This directory is a **separate system**, not a replacement: it exists to
demonstrate service decomposition, polyglot microservices, and a real web frontend on
top of the same domain (Indonesian gold + BTC/ETH/SOL price tracking, a rule-based
BUY/SELL/WAIT signal, LLM narration) — delivered as a web app with browser push alerts
instead of Telegram. The two apps are independent: separate databases, separate users;
the only thing the web app takes from the bot is its price history (see "Moving to
Postgres").

## Why split it this way (the defense pitch)

The three backend services aren't an arbitrary split — each one has a genuinely
different failure mode, scaling profile, and "right tool":

| Service | Language | Why this language | Why it's a separate service |
|---|---|---|---|
| **Market Data** | Python | Reuses the existing fetcher/stats code almost directly; pandas/requests is the path of least risk for I/O + numeric work | Polls external APIs every 1–15 min, must stay cheap and always-up. A crash here must not take down narration or alerts. |
| **Insight** | Python | LLM prompt orchestration and tool-calling agents are Python's strongest ecosystem; reuses `news.py`/`responder.py`'s logic directly | Calls a paid LLM + two news APIs — slow, rate-limited, and the one most likely to degrade. Isolating it means a SumoPod/GNews outage never blocks price logging or basic alerts. |
| **Notification** | Node/TypeScript | Mature Web Push tooling (`web-push`) and in-process scheduling (`node-cron`); shares DTO types with the TypeScript frontend | Owns alert delivery — the user-facing edge. The always-on clock: checks every opted-in browser's holdings each minute for take-profit/stop-loss, watches for signal flips and sudden moves, and pushes desktop notifications even with the tab closed; also schedules the AI narration. The original bot needed host cron for all of this; here the service **is** the persistent process. |
| **Agent** | Python | Same tool-calling-loop precedent as Insight, reused directly | Owner-only ops agent with real, unsandboxed shell access to the VPS (restart containers, check logs/disk/memory). This is the highest blast-radius capability in the project, so it's isolated from Insight's already-public, unauthenticated price-chat surface — a bug or prompt-injection risk there must never reach shell tools here. Deliberately **not** run in Docker like the other three — see `services/agent/README.md`. |

Each service owns its own data — its own SQLite file by default, or its own Postgres
schema (`market_data`, `insight`, `notification`, `agent`) when `DATABASE_URL` is
set — and never reads another's, so they can only talk to each other over HTTP. That's
the one microservices rule enforceable at zero infra cost, and it's why this can't
quietly degrade into a distributed monolith. (On Postgres the schemas share one login,
so the boundary is kept by each service only ever setting `search_path` to its own
schema, not enforced by database permissions.)

Frontend is a plain **web app** (React + TypeScript + Vite), not mobile — same backend
either way, but far faster to build and demo solo within a semester.

## Services

```
webapp/
├── services/
│   ├── market-data/     Python (FastAPI) — ingestion + rule-based signal engine
│   ├── insight/         Python (FastAPI) — news context + LLM narration + chat agent
│   ├── notification/    Node/TypeScript (Express + web-push) — push alerts + narration scheduler
│   └── agent/            Python (FastAPI) — owner-only ops agent, real shell access (runs bare-metal, NOT in docker-compose)
├── frontend/             React + TypeScript (Vite), Nocturne design — overview, asset detail, Ask AI, alerts, agent chat
└── docker-compose.yml
```

Routine narration: Notification's scheduler → `POST /narrate` (Insight, which calls
Market Data + news providers) → stored, and shown on the dashboard.

Alerts: a browser turns them on in the **Alerts** dialog (`PUT /push/devices/:id` with
its Web Push subscription, holdings and rules). Every minute Notification reads
`GET /latest` (Market Data) and pushes take-profit/stop-loss crossings; every 5 minutes
it reads `GET /signals` and `GET /sudden-move-check` and pushes signal flips and sudden
moves. The browser's service worker (`frontend/public/sw.js`) shows them, even with
the tab closed.

A separate flow: the owner reaches the Agent Service from the frontend's "Agent" tab,
authenticated with `AGENT_TOKEN`, hitting a tool-calling loop with real shell access
to the VPS. See `services/agent/README.md` before running
this anywhere reachable.

See each service's own README for endpoints, env vars, and how to run it standalone.

## Running everything

```bash
cp services/.env.example services/.env
# fill in the secrets -- the one file every service reads, whether it runs under
# docker-compose (env_file) or standalone. Everything else has a default.

docker compose up --build
```

Frontend: http://localhost:5173 · Market Data: http://localhost:8001/docs · Insight:
http://localhost:8002/docs · Notification: http://localhost:3000/health

Give Market Data's ingestion scheduler a few minutes after first startup before
expecting signals/charts to show real data (BTC/ETH/SOL land within ~1 min; Treasury
within ~15 min; Pegadaian is once-daily).

`docker compose up` brings up three of the four backend services. The Agent Service is
**not** included — it's meant to run bare-metal on whatever machine you want it to
administer, since a containerized shell tool would silently report the container's own
state instead of the real host's. Start it separately per
`services/agent/README.md` (`uvicorn app.main:app --port 8003`); the frontend's
"Agent" tab expects it at `VITE_AGENT_URL` (`http://localhost:8003` by default).

Each backend service can also run standalone outside Docker for development — see its
own README (`services/*/README.md`) for the venv/npm-install instructions used to build
and test this project.

## Moving to Postgres

Every service keeps working on SQLite until it's given a connection string. With one,
it uses its own schema of a shared Postgres database, creating the schema and tables on
first start. The SQL is unchanged: Python services go through `app/pg_compat.py`, which
speaks the sqlite3 API and translates the SQLite dialect, and Notification's `db.ts` has
one async API over both backends.

Use Sumobase's **Direct Connection** string (or Session Pooler), not the Transaction
Pooler: each service pins its schema per connection with `SET search_path`, which a
transaction pooler doesn't keep. URL-encode any `@ : / # ? %` in the password.

**Where the connection string goes:** `DATABASE_URL` in `services/.env`, the one file
every service reads (standalone or docker-compose). Each service defaults to its own
schema, overridable with `DB_SCHEMA`.

**Bring the existing SQLite data across first.** Stop every service *before* setting
`DATABASE_URL`: the next start picks it up, and anything written to SQLite after the
copy would be left behind.

```bash
pip install psycopg2-binary            # the copy script's only dependency

# 1. stop everything (docker-compose: `docker compose stop`; standalone: stop each service)
docker compose stop

# 2. docker-compose only: pull each SQLite file out of its volume
mkdir -p migration
docker compose cp market-data:/app/data/market_data.db migration/
docker compose cp insight:/app/data/insight.db migration/
docker compose cp notification:/app/data/notification.db migration/

# 3. set DATABASE_URL in services/.env, then copy the data in
python scripts/migrate_sqlite_to_postgres.py \
    --market-data migration/market_data.db --insight migration/insight.db \
    --notification migration/notification.db
# (standalone: no flags needed -- it defaults to services/<name>/<name>.db,
#  including the agent's)

# 4. start again, now on Postgres
docker compose up -d
```

**Price history from the original bot (optional).** Prices are the one thing the web
app takes from the Telegram bot; users, subscribers, chats and AI analyses stay separate.
`python scripts/seed_prices_from_bot.py /path/to/gold-notification/gold.db` copies the
bot's BTC/ETH/SOL/Treasury/Pegadaian history into `market_data.prices` (same endpoints,
same units). It only adds rows newer than what's already there, so run it once more just
before starting the services to close the gap; after that Market Data logs its own.

The migration script reads `DATABASE_URL` from `services/.env` (or prompts for it), copies
each service's tables into its schema with ids intact, moves the id sequences past them,
and checks row counts; each service's copy is one transaction, so it lands whole or not
at all. It refuses to write into a schema that already has rows, so it can't overwrite
live data with a stale SQLite file; `--reset` replaces them deliberately. The SQLite
files are only read, so switching back is just clearing the connection string (anything
written while on Postgres stays in Postgres).
