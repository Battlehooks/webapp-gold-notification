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

DB_PATH = Path(os.environ.get("INSIGHT_DB_PATH", BASE_DIR / "insight.db"))
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
