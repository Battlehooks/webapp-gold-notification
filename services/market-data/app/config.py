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

DB_PATH = Path(os.environ.get("MARKET_DATA_DB_PATH", BASE_DIR / "market_data.db"))
TIMEZONE = os.environ.get("GOLD_TZ", "Asia/Jakarta")
PORT = int(os.environ.get("PORT", "8001"))

# Sudden-move override tuning — same defaults as the original bot.
SUDDEN_MOVE_SOURCES = ["btc", "eth", "sol"]
SUDDEN_MOVE_PCT = float(os.environ.get("SUDDEN_MOVE_PCT", "5.0"))
SUDDEN_MOVE_WINDOW_MIN = int(os.environ.get("SUDDEN_MOVE_WINDOW_MIN", "60"))
