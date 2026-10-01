"""Configuration. Loads .env sitting next to the service root (no python-dotenv needed)."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv(BASE_DIR / ".env")
# Shared services/.env that every service reads. Loaded second, so a value in
# this service's own .env (above) wins over it.
_load_dotenv(BASE_DIR.parent / ".env")

DB_PATH = Path(os.environ.get("INSIGHT_DB_PATH", BASE_DIR / "insight.db"))
# Postgres instead of DB_PATH when set (see app/pg_compat.py); this service's
# tables live in their own schema of that shared database.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DB_SCHEMA = os.environ.get("DB_SCHEMA", "insight")
PORT = int(os.environ.get("PORT", "8002"))

MARKET_DATA_URL = os.environ.get("MARKET_DATA_URL", "http://localhost:8001")

SUMOPOD_API_KEY = os.environ.get("SUMOPOD_API_KEY", "")
SUMOPOD_BASE_URL = os.environ.get("SUMOPOD_BASE_URL", "https://ai.sumopod.com/v1")
SUMOPOD_MODEL = os.environ.get("SUMOPOD_MODEL", "gpt-4o-mini")
SUMOPOD_CHAT_MODEL = os.environ.get("SUMOPOD_CHAT_MODEL", "gpt-4o-mini")

RESPONDER_MAX_TOOL_ROUNDS = int(os.environ.get("RESPONDER_MAX_TOOL_ROUNDS", "3"))
RESPONDER_CHAT_HISTORY_TURNS = int(os.environ.get("RESPONDER_CHAT_HISTORY_TURNS", "8"))
ANALYSIS_RUNS_KEEP_PER_GROUP = int(os.environ.get("ANALYSIS_RUNS_KEEP_PER_GROUP", "20"))

# Both optional -- news.py fails soft (empty results) when either is unset.
GNEWS_API_KEY = os.environ.get("GNEWS_API_KEY", "")
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
