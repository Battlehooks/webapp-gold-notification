# Market Data Service

Ingests Pegadaian/Treasury gold and BTC/ETH/SOL (Indodax) prices on its own internal
schedule (APScheduler, not host cron) and computes a deterministic BUY/SELL/WAIT signal
from historical price data only — no LLM, no news, ported directly from the root
project's `trend_summary.py` stats engine. Owns its own SQLite file; nothing else in
this system reads it except through this API.

## Run standalone

```bash
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
# secrets live in the shared services/.env (from services/.env.example) -- none needed here
uvicorn app.main:app --reload --port 8001
```

Docs at http://localhost:8001/docs. Give it a minute or two after startup for the 1-min
crypto job to log its first points; signal endpoints return 404 until there's at least
one data point.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/sources` | Known sources + which groups they belong to |
| GET | `/prices/{source}?days=30&max_points=` | Time series for frontend charts. Optional `max_points` (≥2) keeps the last row of each of N equal time buckets -- crypto logs every minute, so always pass it from the UI |
| GET | `/signals/{source}?days=30` | Stats + BUY/SELL/WAIT for one source |
| GET | `/signals?group=crypto\|gold&days=30` | Stats + signal for every source in a group |
| GET | `/latest` | Newest stored sell *and* buyback per source (the Notification service's push alerts judge profit at buyback) |
| GET | `/sudden-move-check` | Biggest BTC/ETH/SOL move right now if ≥5% in the last hour, else `null`. Stateless — the caller (Notification service) tracks cooldown. |
