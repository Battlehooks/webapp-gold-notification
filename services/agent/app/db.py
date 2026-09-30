"""SQLite storage for this service's own state: agent_chat_history (per
session conversation memory, mirrors insight's chat_history) and
command_audit_log (every tool invocation, especially shell commands --
deliberately never trimmed, unlike every other table in this codebase, since
a self-truncating audit log defeats its own purpose).
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from app.config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS agent_chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_chat_history_session_id_id ON agent_chat_history (session_id, id);

CREATE TABLE IF NOT EXISTS command_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args_json TEXT NOT NULL,
    ok INTEGER NOT NULL,
    exit_code INTEGER,
    stdout_excerpt TEXT,
    stderr_excerpt TEXT,
    duration_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_command_audit_log_session_id_id ON command_audit_log (session_id, id);
CREATE INDEX IF NOT EXISTS idx_command_audit_log_ts ON command_audit_log (ts);
"""

EXCERPT_MAX_CHARS = 4000


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def append_chat_message(conn: sqlite3.Connection, session_id: str, role: str, content: str, keep: int) -> None:
    conn.execute(
        "INSERT INTO agent_chat_history (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
        (session_id, role, content, _now()),
    )
    conn.execute(
        "DELETE FROM agent_chat_history WHERE session_id = ? AND id NOT IN "
        "(SELECT id FROM agent_chat_history WHERE session_id = ? ORDER BY id DESC LIMIT ?)",
        (session_id, session_id, keep),
    )
    conn.commit()


def recent_chat_history(conn: sqlite3.Connection, session_id: str, limit: int) -> list[dict]:
    rows = conn.execute(
        "SELECT role, content, created_at FROM agent_chat_history WHERE session_id = ? "
        "ORDER BY id DESC LIMIT ?",
        (session_id, limit),
    ).fetchall()
    return [{"role": r["role"], "content": r["content"], "created_at": r["created_at"]} for r in reversed(rows)]


def log_command(
    conn: sqlite3.Connection,
    session_id: str,
    tool_name: str,
    args: dict,
    ok: bool,
    exit_code: int | None,
    stdout: str | None,
    stderr: str | None,
    duration_ms: int,
) -> None:
    conn.execute(
        "INSERT INTO command_audit_log "
        "(ts, session_id, tool_name, args_json, ok, exit_code, stdout_excerpt, stderr_excerpt, duration_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            _now(),
            session_id,
            tool_name,
            json.dumps(args),
            1 if ok else 0,
            exit_code,
            (stdout or "")[:EXCERPT_MAX_CHARS] or None,
            (stderr or "")[:EXCERPT_MAX_CHARS] or None,
            duration_ms,
        ),
    )
    conn.commit()
