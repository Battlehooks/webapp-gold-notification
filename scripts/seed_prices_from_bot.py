"""Seed market_data.prices with the price history the original Telegram bot
has already logged (its SQLite file, gold.db), so the web app's charts and
signals have history from day one instead of starting empty.

Prices are the only thing the web app takes from the bot. Users,
subscribers, chat history and AI analyses stay separate on each side.

    python scripts/seed_prices_from_bot.py /path/to/gold-notification/gold.db

Safe to re-run: for each source it only copies rows newer than the newest
one Postgres already has, so running it again just before starting the
services closes the gap. Rows go in oldest-first, so ids keep increasing with
time per source (previous_price() relies on that). gold.db is only read.

The bot and Market Data fetch the same endpoints with the same
normalisation (IDR per gram for gold, IDR per coin for crypto), so their rows
are interchangeable. Connection string: same as migrate_sqlite_to_postgres.py.
"""
from __future__ import annotations

import argparse
import io
import sqlite3
import sys
from pathlib import Path

import psycopg2

from migrate_sqlite_to_postgres import _copy_value, _database_url, _python_ddl

SCHEMA = "market_data"
# Market Data's SOURCE_META keys -- the bot logs more sources than these.
SOURCES = ["pegadaian", "treasury", "btc", "eth", "sol"]
COLUMNS = ["source", "sell", "buyback", "source_updated_at", "fetched_at"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("gold_db", type=Path, help="the bot's gold.db")
    args = parser.parse_args()
    if not args.gold_db.exists():
        sys.exit(f"{args.gold_db} not found")

    lite = sqlite3.connect(f"file:{args.gold_db}?mode=ro", uri=True)
    pg = psycopg2.connect(_database_url(), connect_timeout=15)
    total = 0
    with pg.cursor() as cur:
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
        cur.execute(f"SET search_path TO {SCHEMA}")
        cur.execute(_python_ddl("market-data"))
        print(f"{'source':<10} {'already in postgres up to':<27} {'copied':>9}")
        for source in SOURCES:
            cur.execute("SELECT MAX(fetched_at) FROM prices WHERE source = %s", (source,))
            since = cur.fetchone()[0] or ""
            rows = lite.execute(
                f"SELECT {', '.join(COLUMNS)} FROM prices WHERE source = ? AND fetched_at > ? ORDER BY fetched_at, id",
                (source, since),
            ).fetchall()
            buf = io.StringIO()
            for row in rows:
                buf.write("\t".join(_copy_value(v) for v in row) + "\n")
            buf.seek(0)
            cur.copy_expert(f"COPY prices ({', '.join(COLUMNS)}) FROM STDIN", buf)
            total += len(rows)
            print(f"{source:<10} {since or '(empty)':<27} {len(rows):>9,}")
    pg.commit()  # all sources or none
    print(f"\nDone: {total:,} rows added to {SCHEMA}.prices.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
