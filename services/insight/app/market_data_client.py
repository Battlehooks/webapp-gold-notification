"""Thin HTTP client for the Market Data Service. This is the service
boundary in action: Insight never touches Market Data's SQLite file, only
its REST API.
"""
from __future__ import annotations

import requests

from app.config import MARKET_DATA_URL

TIMEOUT = 15


def get_group_signals(group: str, days: int = 30) -> dict:
    resp = requests.get(
        f"{MARKET_DATA_URL}/signals", params={"group": group, "days": days}, timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def get_source_signal(source: str, days: int = 30) -> dict:
    resp = requests.get(f"{MARKET_DATA_URL}/signals/{source}", params={"days": days}, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def get_sources() -> dict:
    resp = requests.get(f"{MARKET_DATA_URL}/sources", timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()
