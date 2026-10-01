"""One-off: copy every service's SQLite data into its schema of the shared
Postgres database (DATABASE_URL in services/.env).

Run it once, with the services stopped, before starting them with
DATABASE_URL set -- see "Moving to Postgres" in README.md.

    python scripts/migrate_sqlite_to_postgres.py                # standalone-run defaults
    python scripts/migrate_sqlite_to_postgres.py --market-data migration/market_data.db ...

Each service's SQLite file defaults to where it lives when the service runs
standalone (services/<name>/<name>.db); pass a path to use a copy pulled out
of its docker volume instead. A missing file just skips that service.

Tables are created from each service's own Postgres DDL -- PG_SCHEMA in
services/*/app/db.py and SCHEMA_SQL in services/notification/src/db.ts, read
straight from the source so there's no second copy to drift -- then filled
with COPY, ids included, and each id sequence is moved past the copied ids.
Row counts are checked afterwards.

Refuses to write into a schema that already has rows (so it can't clobber a
live database with stale SQLite data) unless --reset, which empties that
service's tables first. SQLite files are only ever read.

The connection string is DATABASE_URL from services/.env (the file every
service reads), or $DATABASE_URL; failing both it's prompted for, so the
password never has to go on the command line. Needs `pip install
psycopg2-binary`.
"""
from __future__ import annotations

import argparse
import ast
import getpass
import io
import os
import re
import sqlite3
import sys
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
SERVICES = ROOT / "services"


def _database_url() -> str:
    """$DATABASE_URL, else DATABASE_URL from services/.env, else a prompt."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    shared = SERVICES / ".env"
    if shared.exists():
        for line in shared.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key.strip() == "DATABASE_URL" and value.strip().strip('"').strip("'"):
                print(f"Using DATABASE_URL from {shared.relative_to(ROOT)}")
                return value.strip().strip('"').strip("'")
    return getpass.getpass("Postgres connection string (postgresql://...): ").strip()


def _python_ddl(service: str) -> str:
    tree = ast.parse((SERVICES / service / "app" / "db.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "PG_SCHEMA" for t in node.targets):
            return node.value.value
    raise SystemExit(f"PG_SCHEMA not found in services/{service}/app/db.py")


def _notification_ddl() -> str:
    src = (SERVICES / "notification" / "src" / "db.ts").read_text(encoding="utf-8")
    m = re.search(r"const SCHEMA_SQL = `(.*?)`;", src, re.DOTALL)
    if not m:
        raise SystemExit("SCHEMA_SQL not found in services/notification/src/db.ts")
    return m.group(1)


# schema name -> (flag, default SQLite path, DDL loader)
TARGETS = {
    "market_data": ("market-data", SERVICES / "market-data" / "market_data.db", lambda: _python_ddl("market-data")),
    "insight": ("insight", SERVICES / "insight" / "insight.db", lambda: _python_ddl("insight")),
    "notification": ("notification", SERVICES / "notification" / "notification.db", _notification_ddl),
    "agent": ("agent", SERVICES / "agent" / "agent.db", lambda: _python_ddl("agent")),
}


def _copy_value(v) -> str:
    """One field in COPY's text format."""
    if v is None:
        return r"\N"
    if isinstance(v, float):
        return repr(v)
    return str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def _pg_columns(cur, schema: str, table: str) -> list[str]:
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = %s "
        "ORDER BY ordinal_position",
        (schema, table),
    )
    return [r[0] for r in cur.fetchall()]


def migrate_service(pg, schema: str, sqlite_path: Path, ddl: str, reset: bool) -> bool:
    lite = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    tables = [
        r[0]
        for r in lite.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    ]
    with pg.cursor() as cur:
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
        cur.execute(f"SET search_path TO {schema}")
        cur.execute(ddl)
        pg_tables = [t for t in tables if _pg_columns(cur, schema, t)]
        skipped = sorted(set(tables) - set(pg_tables))
        if skipped:
            print(f"  (ignoring SQLite-only tables: {', '.join(skipped)})")
        occupied = []
        for t in pg_tables:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            n = cur.fetchone()[0]
            if n:
                occupied.append(f"{t} ({n:,} rows)")
        if occupied and not reset:
            pg.rollback()
            print(f"  REFUSING: {schema} already has data: {', '.join(occupied)}. Re-run with --reset to replace it.")
            return False
        ok = True
        for t in pg_tables:
            cols = [c for c in _pg_columns(cur, schema, t) if c in {r[1] for r in lite.execute(f"PRAGMA table_info({t})")}]
            rows = lite.execute(f"SELECT {', '.join(cols)} FROM {t}").fetchall()
            cur.execute(f"TRUNCATE {t}")
            buf = io.StringIO()
            for row in rows:
                buf.write("\t".join(_copy_value(v) for v in row) + "\n")
            buf.seek(0)
            cur.copy_expert(f"COPY {t} ({', '.join(cols)}) FROM STDIN", buf)
            if "id" in cols:
                cur.execute(
                    f"SELECT setval(pg_get_serial_sequence('{schema}.{t}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {t}), 1), (SELECT MAX(id) FROM {t}) IS NOT NULL)"
                )
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            copied = cur.fetchone()[0]
            match = copied == len(rows)
            ok &= match
            print(f"  {t:<22} sqlite={len(rows):>9,}  postgres={copied:>9,}  {'ok' if match else 'MISMATCH'}")
    if ok:
        pg.commit()  # one transaction per service: all of its tables, or none
    else:
        pg.rollback()
        print(f"  rolled back {schema}: row counts didn't match")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for schema, (flag, default, _) in TARGETS.items():
        parser.add_argument(f"--{flag}", type=Path, default=default, metavar="PATH",
                            help=f"SQLite file for {schema} (default: {default.relative_to(ROOT)})")
    parser.add_argument("--reset", action="store_true",
                        help="empty each service's Postgres tables before copying, instead of refusing when they have data")
    args = parser.parse_args()

    url = _database_url()
    if not url:
        sys.exit("No connection string given.")
    pg = psycopg2.connect(url, connect_timeout=15)

    results = {}
    for schema, (flag, _, ddl) in TARGETS.items():
        path: Path = getattr(args, flag.replace("-", "_"))
        print(f"\n{schema}  <-  {path}")
        if not path.exists():
            print("  no SQLite file there, skipped")
            continue
        results[schema] = migrate_service(pg, schema, path, ddl(), args.reset)

    if not results:
        print("\nNothing migrated: no SQLite files found. Pass their paths (see --help).")
        return 1
    failed = [s for s, ok in results.items() if not ok]
    print("\nDone." if not failed else f"\nNot migrated: {', '.join(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
