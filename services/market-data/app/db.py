"""Storage for price history: SQLite, or Postgres when DATABASE_URL is set
(this service's own schema, see app/pg_compat.py). This service owns the
`prices` table exclusively -- no other service reads it directly, only via
HTTP."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from app.config import DATABASE_URL, DB_PATH, DB_SCHEMA

SCHEMA = """
CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    sell REAL NOT NULL,
    buyback REAL NOT NULL,
    source_updated_at TEXT,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_source_time ON prices (source, fetched_at);
"""


PG_SCHEMA = """
CREATE TABLE IF NOT EXISTS prices (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    sell DOUBLE PRECISION NOT NULL,
    buyback DOUBLE PRECISION NOT NULL,
    source_updated_at TEXT,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_source_time ON prices (source, fetched_at);
"""


def connect() -> sqlite3.Connection:
    if DATABASE_URL:
        from app import pg_compat

        return pg_compat.connect(DATABASE_URL, DB_SCHEMA, PG_SCHEMA, id_tables={"prices"})
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def insert_price(conn: sqlite3.Connection, price: dict) -> None:
    conn.execute(
        "INSERT INTO prices (source, sell, buyback, source_updated_at, fetched_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            price["source"],
            price["sell"],
            price["buyback"],
            price.get("source_updated_at"),
            datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    conn.commit()


def previous_price(conn: sqlite3.Connection, source: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM prices WHERE source = ? ORDER BY id DESC LIMIT 1",
        (source,),
    ).fetchone()


def price_before(conn: sqlite3.Connection, source: str, minutes_ago: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM prices WHERE source = ? AND fetched_at <= datetime('now', ?) "
        "ORDER BY fetched_at DESC LIMIT 1",
        (source, f"-{int(minutes_ago)} minutes"),
    ).fetchone()


def recent_prices(conn: sqlite3.Connection, source: str, days: int = 30) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM prices WHERE source = ? AND fetched_at >= datetime('now', ?) "
        "ORDER BY fetched_at",
        (source, f"-{int(days)} days"),
    ).fetchall()
