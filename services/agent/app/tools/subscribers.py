"""Thin HTTP client for the Notification Service's existing admin API. Never
touches notification.db directly -- preserves the HTTP-only service
boundary, styled like insight/app/market_data_client.py.
"""
from __future__ import annotations

import requests

from app.config import ADMIN_TOKEN, NOTIFICATION_URL

TIMEOUT = 15


def _headers() -> dict:
    return {"x-admin-token": ADMIN_TOKEN}


def list_subscribers() -> dict:
    resp = requests.get(f"{NOTIFICATION_URL}/admin/subscribers", headers=_headers(), timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def approve_subscriber(chat_id: str) -> dict:
    resp = requests.post(
        f"{NOTIFICATION_URL}/admin/subscribers/{chat_id}/approve", headers=_headers(), timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def deny_subscriber(chat_id: str) -> dict:
    resp = requests.post(
        f"{NOTIFICATION_URL}/admin/subscribers/{chat_id}/deny", headers=_headers(), timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()
