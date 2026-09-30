"""Auth dependency for the /chat route. Mirrors notification/src/adminApi.ts's
requireAdmin: fail-closed if the shared secret is unset or doesn't match --
an empty AGENT_TOKEN must never mean "open access".
"""
from __future__ import annotations

from fastapi import Header, HTTPException

from app.config import AGENT_TOKEN


def require_agent_token(x_agent_token: str | None = Header(default=None)) -> None:
    if not AGENT_TOKEN or x_agent_token != AGENT_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")
