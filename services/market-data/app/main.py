"""Market Data Service -- ingestion + rule-based BUY/SELL/WAIT signal engine.

Owns the `prices` SQLite table exclusively. Other services (Insight,
Notification) only ever see this data through the REST API below -- never by
reading the DB file directly, which is the boundary that keeps this an
actual microservice rather than a shared-database distributed monolith.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import db, scheduler, signals
from app.config import SUDDEN_MOVE_PCT, SUDDEN_MOVE_SOURCES, SUDDEN_MOVE_WINDOW_MIN

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    sched = scheduler.start()
    yield
    sched.shutdown()


app = FastAPI(title="Market Data Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/sources")
def sources():
    return {"sources": signals.SOURCE_META, "groups": signals.GROUPS}


@app.get("/prices/{source}")
def prices(source: str, days: int = 30):
    if source not in signals.SOURCE_META:
        raise HTTPException(404, f"unknown source {source!r}")
    conn = db.connect()
    try:
        rows = db.recent_prices(conn, source, days=days)
        return {
            "source": source,
            "points": [
                {
                    "sell": r["sell"],
                    "buyback": r["buyback"],
                    "fetched_at": r["fetched_at"],
                }
                for r in rows
            ],
        }
    finally:
        conn.close()


@app.get("/signals/{source}")
def signal_for_source(source: str, days: int = 30):
    if source not in signals.SOURCE_META:
        raise HTTPException(404, f"unknown source {source!r}")
    conn = db.connect()
    try:
        df = signals.load_frame(conn, [source], days=days)
        if df.empty:
            raise HTTPException(404, f"no price history yet for {source!r}")
        stats = signals.compute_stats(df)
        result = stats.get(source)
        if not result:
            raise HTTPException(404, f"no stats computable yet for {source!r}")
        return {"source": source, **result}
    finally:
        conn.close()


@app.get("/signals")
def signals_for_group(group: str, days: int = 30):
    if group not in signals.GROUPS:
        raise HTTPException(404, f"unknown group {group!r}, expected one of {sorted(signals.GROUPS)}")
    conn = db.connect()
    try:
        group_sources = signals.GROUPS[group]["sources"]
        df = signals.load_frame(conn, group_sources, days=days)
        if df.empty:
            return {"group": group, "sources": {}}
        return {"group": group, "sources": signals.compute_stats(df)}
    finally:
        conn.close()


@app.get("/sudden-move-check")
def sudden_move_check():
    """Stateless: reports the biggest qualifying move right now, if any.
    Cooldown/dedup across repeated calls is the Notification service's job."""
    conn = db.connect()
    try:
        move = signals.detect_sudden_move(
            conn, SUDDEN_MOVE_SOURCES, SUDDEN_MOVE_PCT, SUDDEN_MOVE_WINDOW_MIN
        )
        return {"move": move, "window_min": SUDDEN_MOVE_WINDOW_MIN, "threshold_pct": SUDDEN_MOVE_PCT}
    finally:
        conn.close()
