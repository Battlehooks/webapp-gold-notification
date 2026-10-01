# Insight Service

Explains the Market Data Service's already-decided BUY/SELL/WAIT signal in plain
language (LLM via SumoPod, grounded in real numbers + optional news headlines), and
answers follow-up questions through a tool-equipped chat agent. Never re-decides the
signal — ported directly from the root project's invariant (see `trend_summary.py`'s
docstring): news and the LLM only ever explain, never override.

Calls the Market Data Service over HTTP for stats — never touches its database.

## Run standalone

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
# secrets live in the shared services/.env (from services/.env.example):
# SUMOPOD_API_KEY at minimum; GNEWS/TAVILY optional
uvicorn app.main:app --reload --port 8002
```

Requires the Market Data Service running and reachable at `MARKET_DATA_URL` with at
least a little price history, or `/narrate` and the chat tools will 404/error.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/narrate` `{group, banner?}` | Fetch stats from Market Data, LLM-explain, persist, return the full narration |
| GET | `/analysis/{group}` | Last saved narration for a group |
| GET | `/analysis/{group}/history?limit=2` | Newest-first saved runs (1–20); the web app diffs the two newest for "since the previous run" |
| GET | `/why-moved?display=BTC&pct=-6.2` | Tavily-backed one-line "why" for a specific move |
| POST | `/chat` `{chat_id, message, context?}` | Tool-equipped Q&A reply, grounded in the latest analysis + rolling per-chat history. Optional `context` (≤4000 chars, e.g. the user's holdings) is injected for that turn only and never stored |
