"""SQLite storage for this service's own state: analysis_runs (narration
history, for the chat agent to ground itself in) and chat_history (per
chat_id conversation memory). No price data lives here -- that's Market
Data's table, reached only over HTTP.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from app.config import ANALYSIS_RUNS_KEEP_PER_GROUP, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS analysis_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    stats_json TEXT NOT NULL,
    reasoning_json TEXT,
    headlines_json TEXT NOT NULL,
    banner TEXT,
    summary_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_group_id ON analysis_runs (group_name, id);
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_history_chat_id_id ON chat_history (chat_id, id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def save_analysis_run(
    conn: sqlite3.Connection,
    group_name: str,
    stats: dict,
    reasoning: dict | None,
    headlines: list[str],
    summary_text: str,
    banner: str | None = None,
) -> int:
    cur = conn.execute(
        "INSERT INTO analysis_runs "
        "(group_name, created_at, stats_json, reasoning_json, headlines_json, banner, summary_text) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            group_name,
            datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            json.dumps(stats),
            json.dumps(reasoning) if reasoning is not None else None,
            json.dumps(headlines),
            banner,
            summary_text,
        ),
    )
    conn.execute(
        "DELETE FROM analysis_runs WHERE group_name = ? AND id NOT IN "
        "(SELECT id FROM analysis_runs WHERE group_name = ? ORDER BY id DESC LIMIT ?)",
        (group_name, group_name, ANALYSIS_RUNS_KEEP_PER_GROUP),
    )
    conn.commit()
    return cur.lastrowid


def latest_analysis_run(conn: sqlite3.Connection, group_name: str) -> dict | None:
    runs = recent_analysis_runs(conn, group_name, limit=1)
    return runs[0] if runs else None


def recent_analysis_runs(conn: sqlite3.Connection, group_name: str, limit: int) -> list[dict]:
    """Newest first. Two of these are what the web app diffs for its
    "since the previous run" list -- the diff is plain data, not LLM output."""
    rows = conn.execute(
        "SELECT * FROM analysis_runs WHERE group_name = ? ORDER BY id DESC LIMIT ?",
        (group_name, limit),
    ).fetchall()
    return [_run_from_row(row) for row in rows]


def _run_from_row(row: sqlite3.Row) -> dict:
    return {
        "group_name": row["group_name"],
        "created_at": row["created_at"],
        "stats": json.loads(row["stats_json"]),
        "reasoning": json.loads(row["reasoning_json"]) if row["reasoning_json"] else None,
        "headlines": json.loads(row["headlines_json"]),
        "banner": row["banner"],
        "summary_text": row["summary_text"],
    }


def append_chat_message(conn: sqlite3.Connection, chat_id, role: str, content: str, keep: int) -> None:
    conn.execute(
        "INSERT INTO chat_history (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (str(chat_id), role, content, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.execute(
        "DELETE FROM chat_history WHERE chat_id = ? AND id NOT IN "
        "(SELECT id FROM chat_history WHERE chat_id = ? ORDER BY id DESC LIMIT ?)",
        (str(chat_id), str(chat_id), keep),
    )
    conn.commit()


def recent_chat_history(conn: sqlite3.Connection, chat_id, limit: int) -> list[dict]:
    rows = conn.execute(
        "SELECT role, content, created_at FROM chat_history WHERE chat_id = ? "
        "ORDER BY id DESC LIMIT ?",
        (str(chat_id), limit),
    ).fetchall()
    return [{"role": r["role"], "content": r["content"], "created_at": r["created_at"]} for r in reversed(rows)]
