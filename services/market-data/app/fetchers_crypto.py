"""Fetchers for cryptocurrency prices (Indodax). Ported from the root
project's crypto_price.py -- public ticker endpoint, no auth needed.
"""
from __future__ import annotations

from datetime import datetime, timezone

import requests

INDODAX_URL = "https://indodax.com/api/ticker/{pair}"
PAIRS = {"btc": "btcidr", "eth": "ethidr", "sol": "solidr"}


def _fetch(name: str, timeout: int = 30) -> dict:
    resp = requests.get(INDODAX_URL.format(pair=PAIRS[name]), timeout=timeout)
    resp.raise_for_status()
    ticker = resp.json()["ticker"]
    updated = datetime.fromtimestamp(int(ticker["server_time"]), tz=timezone.utc)
    return {
        "source": name,
        "sell": float(ticker["sell"]),
        "buyback": float(ticker["buy"]),
        "source_updated_at": updated.strftime("%Y-%m-%d %H:%M:%S"),
    }


def fetch_btc(timeout: int = 30) -> dict:
    return _fetch("btc", timeout)


def fetch_eth(timeout: int = 30) -> dict:
    return _fetch("eth", timeout)


def fetch_sol(timeout: int = 30) -> dict:
    return _fetch("sol", timeout)


FETCHERS = {"btc": fetch_btc, "eth": fetch_eth, "sol": fetch_sol}
