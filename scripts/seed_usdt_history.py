"""One-off: seed the `usdt` source in market_data.prices with daily USDT/IDR
closes from Indodax, so the USDT source has history on day one instead of
waiting for the live job to accumulate some.

    python scripts/seed_usdt_history.py                # dry run: prints what it would insert
    python scripts/seed_usdt_history.py --apply        # writes rows

The target is whatever market-data itself uses: MARKET_DATA_DB_PATH (SQLite),
or Postgres when DATABASE_URL is set. The first line printed is the target.

Skips today's (UTC) candle, since it is incomplete and the live job writes
today's rows, and skips any day that already has a `usdt` row, so re-running
is safe. Each row is stamped at 23:59:00 UTC of its day because Close is the
end-of-day value.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

# Insert at the front: other services in this repo also have an `app` package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "market-data"))

from app import db  # noqa: E402
from app.config import DATABASE_URL, DB_PATH  # noqa: E402

URL = "https://indodax.com/tradingview/history_v2"
SOURCE = "usdt"


def fetch_daily_candles(days: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    params = {
        "symbol": "USDTIDR",
        "tf": "1D",
        "from": int((now - timedelta(days=days)).timestamp()),
        "to": int(now.timestamp()),
    }
    resp = requests.get(URL, params=params, timeout=30)
    resp.raise_for_status()
    return sorted(resp.json(), key=lambda c: c["Time"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=60, help="how far back to fetch (default 60)")
    parser.add_argument("--apply", action="store_true", help="write rows (default is a dry run)")
    args = parser.parse_args()

    target = "Postgres (DATABASE_URL set)" if DATABASE_URL else f"SQLite file {DB_PATH}"
    print(f"Target: {target}")
    print("Mode:   " + ("APPLY (writing)" if args.apply else "DRY RUN (nothing written)"))

    candles = fetch_daily_candles(args.days)
    today = datetime.now(timezone.utc).date()
    conn = db.connect()
    try:
        present = db.price_days_present(conn, SOURCE)
        inserted_days: list[str] = []
        skipped = 0
        for c in candles:
            day = datetime.fromtimestamp(c["Time"], timezone.utc).date()
            day_s = day.isoformat()
            close = float(c["Close"])
            if day >= today:
                reason = "today, incomplete"
            elif day_s in present:
                reason = "already in table"
            else:
                reason = None
            if reason:
                skipped += 1
                print(f"  {day_s}  close {close:>10,.0f}  skip ({reason})")
                continue
            print(f"  {day_s}  close {close:>10,.0f}  {'insert' if args.apply else 'would insert'}")
            if args.apply:
                # The history endpoint has no bid/ask, so buyback = sell = Close.
                # The live ticker's spread is ~0.13%; this is the end-of-day close.
                price = {"source": SOURCE, "sell": close, "buyback": close, "source_updated_at": day_s}
                db.insert_price_at(conn, price, f"{day_s} 23:59:00")
            present.add(day_s)
            inserted_days.append(day_s)
    finally:
        conn.close()

    verb = "inserted" if args.apply else "would insert"
    print(f"\nRows {verb}: {len(inserted_days)}")
    print(f"Rows skipped: {skipped}")
    if inserted_days:
        print(f"First day: {min(inserted_days)}   Last day: {max(inserted_days)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
