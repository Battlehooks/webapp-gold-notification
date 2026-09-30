"""Market Data Service -- ingestion + rule-based BUY/SELL/WAIT signal engine.

Owns the `prices` SQLite table exclusively. Other services (Insight,
Notification) only ever see this data through the REST API below -- never by
reading the DB file directly, which is the boundary that keeps this an
actual microservice rather than a shared-database distributed monolith.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
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


def _downsample(rows: list, max_points: int) -> list:
    """Keep the last row of each of `max_points` equal time buckets. Crypto
    logs every minute, so 90 raw days is ~130k rows per source -- far more
    than a chart can draw. Bucketing by time (not by row index) keeps gaps in
    ingestion looking like gaps instead of compressing them away."""
    if len(rows) <= max_points:
        return rows
    parse = datetime.fromisoformat
    start, end = parse(rows[0]["fetched_at"]), parse(rows[-1]["fetched_at"])
    span = (end - start).total_seconds() or 1
    buckets: dict[int, object] = {}
    for r in rows:
        i = min(max_points - 1, int((parse(r["fetched_at"]) - start).total_seconds() / span * max_points))
        buckets[i] = r
    return [buckets[i] for i in sorted(buckets)]


@app.get("/prices/{source}")
def prices(source: str, days: int = 30, max_points: int | None = Query(None, ge=2)):
    if source not in signals.SOURCE_META:
        raise HTTPException(404, f"unknown source {source!r}")
    conn = db.connect()
    try:
        rows = db.recent_prices(conn, source, days=days)
        if max_points:
            rows = _downsample(rows, max_points)
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
