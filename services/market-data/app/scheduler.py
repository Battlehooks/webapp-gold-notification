"""Self-scheduling ingestion. Replaces the root project's host-level cron:
this service is meant to run as an always-on container, so it schedules its
own periodic fetches internally via APScheduler rather than depending on the
host to trigger it -- one less piece of external infra to wire up per
deployment target.
"""
from __future__ import annotations

import logging
import traceback

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app import db, fetchers_crypto, fetchers_gold

log = logging.getLogger("market-data.scheduler")


def _fetch_and_store(name: str, fetch_fn) -> None:
    conn = db.connect()
    try:
        price = fetch_fn()
        db.insert_price(conn, price)
        log.info("fetched %s: sell=%s buyback=%s", name, price["sell"], price["buyback"])
    except Exception:
        log.error("fetch failed for %s", name)
        traceback.print_exc()
    finally:
        conn.close()


def _fetch_crypto_fast() -> None:
    for name, fn in fetchers_crypto.FETCHERS.items():
        _fetch_and_store(name, fn)


def _fetch_treasury() -> None:
    _fetch_and_store("treasury", fetchers_gold.fetch_treasury)


def _fetch_pegadaian() -> None:
    _fetch_and_store("pegadaian", fetchers_gold.fetch_pegadaian)


def start() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    # BTC/ETH/SOL: Indodax's public API is documented at 180 req/min, so
    # every 1 min (3 requests) is comfortably safe.
    scheduler.add_job(_fetch_crypto_fast, IntervalTrigger(minutes=1), id="crypto_fast")
    # Treasury: undocumented endpoint, no published rate limit -- stays on a
    # more conservative cadence.
    scheduler.add_job(_fetch_treasury, IntervalTrigger(minutes=15), id="treasury")
    # Pegadaian: a slow once-daily print, no point polling more often.
    scheduler.add_job(_fetch_pegadaian, CronTrigger(hour=23, minute=30), id="pegadaian")
    scheduler.start()
    log.info("ingestion scheduler started: crypto_fast=1min treasury=15min pegadaian=daily@23:30UTC")
    return scheduler
