"""Postgres behind the sqlite3 API this service's db.py already uses.

When DATABASE_URL is set, db.connect() returns a PgConnection instead of a
sqlite3.Connection. It speaks the subset of the sqlite3 API the codebase
uses -- conn.execute(...).fetchone()/fetchall(), row["col"] and row[0],
cursor.lastrowid / rowcount, commit(), close(), and pandas.read_sql_query --
and translates the SQLite dialect on the way through (`?` placeholders,
`datetime('now', ?)`, `date(col)`), so no query had to be rewritten.

Schema per service: every service shares one database but lives in its own
Postgres schema (DB_SCHEMA), selected with `SET search_path` on each new
connection. That needs a session-stable connection, i.e. Sumobase's Direct
Connection (or Session Pooler) -- NOT the Transaction Pooler, which hands
each statement to whichever server connection is free.

Connections come from a small per-process pool: connect() checks one out,
close() returns it. Every caller already closes in a `finally`, so a request
costs no new TLS handshake to the database.

This file is identical in market-data, insight and agent -- each service
keeps its own copy rather than sharing code, same as everything else here.
"""
from __future__ import annotations

import re
import threading
import warnings
import weakref

import psycopg2
import psycopg2.extras
import psycopg2.pool

_POOL_MAX = 10

_INSERT_RE = re.compile(r"^\s*INSERT\s+INTO\s+(\w+)", re.IGNORECASE)
_DATETIME_NOW_RE = re.compile(r"datetime\(\s*'now'\s*,\s*\?\s*\)", re.IGNORECASE)
_DATE_COL_RE = re.compile(r"\bdate\(\s*(\w+)\s*\)", re.IGNORECASE)
_SCHEMA_NAME_RE = re.compile(r"^[a-z_][a-z0-9_]*$")

# pandas warns on every read_sql_query for any DBAPI connection that isn't
# sqlite3 or SQLAlchemy; PgConnection's cursor() is exactly what that
# fallback path uses, so the warning is only noise.
warnings.filterwarnings(
    "ignore", message="pandas only supports SQLAlchemy connectable", category=UserWarning
)


def to_pg_sql(sql: str, has_params: bool = True) -> str:
    """Translate the SQLite dialect this service's queries use into Postgres.
    Covers exactly what the queries contain -- not a general translator."""
    if has_params:
        # psycopg2 treats a bare % as a placeholder, but only when params are passed.
        sql = sql.replace("%", "%%")
    # datetime('now', '-30 days') -> the same naive-UTC 'YYYY-MM-DD HH:MM:SS'
    # text every timestamp column stores, so string comparisons still work.
    sql = _DATETIME_NOW_RE.sub(
        "to_char(timezone('UTC', now()) + CAST(? AS interval), 'YYYY-MM-DD HH24:MI:SS')", sql
    )
    # date(col) on a 'YYYY-MM-DD HH:MM:SS' string is its first 10 chars.
    sql = _DATE_COL_RE.sub(r"substr(\1, 1, 10)", sql)
    return sql.replace("?", "%s")


class _PgCursor:
    """sqlite3.Cursor lookalike. Rows are psycopg2 DictRows, which support
    row["col"], row[0], row.keys() and dict(row), like sqlite3.Row."""

    def __init__(self, conn: "PgConnection"):
        self._conn = conn
        self._cur = None
        self.lastrowid = None

    def execute(self, sql: str, params=()) -> "_PgCursor":
        params = tuple(params) if params else None
        pg_sql = to_pg_sql(sql, has_params=params is not None)
        m = _INSERT_RE.match(pg_sql)
        wants_id = bool(m) and m.group(1).lower() in self._conn.id_tables and "RETURNING" not in pg_sql.upper()
        if wants_id:
            pg_sql = pg_sql.rstrip().rstrip(";") + " RETURNING id"
        self._cur = self._conn._run(pg_sql, params)
        if wants_id:
            self.lastrowid = self._cur.fetchone()[0]
        return self

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def fetchmany(self, size=None):
        return self._cur.fetchmany(size) if size else self._cur.fetchmany()

    def __iter__(self):
        return iter(self._cur)

    def close(self) -> None:
        if self._cur is not None:
            self._cur.close()


class _Pool:
    """One per (url, schema) per process. Sets search_path on every new
    server connection, and creates the schema + tables once per process."""

    def __init__(self, url: str, schema: str, ddl: str):
        if not _SCHEMA_NAME_RE.match(schema):
            raise ValueError(f"DB_SCHEMA must be a plain lowercase identifier, got {schema!r}")
        self.schema = schema
        self._ddl = ddl
        self._ready = False
        self._lock = threading.Lock()
        self._configured = weakref.WeakSet()  # server connections already pointed at the schema
        self._pool = psycopg2.pool.ThreadedConnectionPool(1, _POOL_MAX, url, connect_timeout=15)

    def getconn(self):
        raw = self._pool.getconn()
        if raw not in self._configured:
            # First use of this server connection: point it at this service's
            # schema. Autocommit, so every statement commits on its own like
            # the SQLite code expects.
            raw.autocommit = True
            with raw.cursor() as cur:
                if not self._ready:
                    with self._lock:
                        if not self._ready:
                            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {self.schema}")
                            cur.execute(f"SET search_path TO {self.schema}")
                            cur.execute(self._ddl)
                            self._ready = True
                cur.execute(f"SET search_path TO {self.schema}")
            self._configured.add(raw)
        return raw

    def putconn(self, raw, broken: bool = False) -> None:
        self._pool.putconn(raw, close=broken or bool(raw.closed))


_pools: dict[tuple[str, str], _Pool] = {}
_pools_lock = threading.Lock()


class PgConnection:
    """sqlite3.Connection lookalike over one pooled Postgres connection.
    commit() is a no-op (autocommit); close() returns it to the pool."""

    def __init__(self, pool: _Pool, id_tables: set[str]):
        self._pool = pool
        self.id_tables = id_tables
        self._raw = pool.getconn()
        self._used = False

    def _run(self, sql: str, params):
        for attempt in (1, 2):
            cur = self._raw.cursor(cursor_factory=psycopg2.extras.DictCursor)
            try:
                cur.execute(sql, params)
                self._used = True
                return cur
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                # A pooled connection the server dropped while idle fails on
                # its first statement. Nothing has run on it yet, so swap in a
                # fresh one and retry once; any later failure is real.
                if self._used or attempt == 2:
                    raise
                self._pool.putconn(self._raw, broken=True)
                self._raw = self._pool.getconn()

    def cursor(self) -> _PgCursor:
        return _PgCursor(self)

    def execute(self, sql: str, params=()) -> _PgCursor:
        return self.cursor().execute(sql, params)

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        pass

    def close(self) -> None:
        if self._raw is not None:
            self._pool.putconn(self._raw)
            self._raw = None


def connect(url: str, schema: str, ddl: str, id_tables: set[str]) -> PgConnection:
    key = (url, schema)
    pool = _pools.get(key)
    if pool is None:
        with _pools_lock:
            pool = _pools.get(key) or _pools.setdefault(key, _Pool(url, schema, ddl))
    return PgConnection(pool, id_tables)
