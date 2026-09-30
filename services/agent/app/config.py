"""Configuration. Loads .env sitting next to the service root (no python-dotenv needed).

Deliberately mirrors insight/app/config.py's hand-rolled style rather than
introducing pydantic BaseSettings -- this repo duplicates per-service
boilerplate on purpose (no shared package exists yet).
"""
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

DB_PATH = Path(os.environ.get("AGENT_DB_PATH", BASE_DIR / "agent.db"))
PORT = int(os.environ.get("PORT", "8003"))

# Shared secret required as the x-agent-token header on every /chat call.
# This is the single highest-blast-radius secret in the repo -- see README.
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")

# Other services this one calls over HTTP -- never their databases directly.
NOTIFICATION_URL = os.environ.get("NOTIFICATION_URL", "http://localhost:3000")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

SUMOPOD_API_KEY = os.environ.get("SUMOPOD_API_KEY", "")
SUMOPOD_BASE_URL = os.environ.get("SUMOPOD_BASE_URL", "https://ai.sumopod.com/v1")
SUMOPOD_CHAT_MODEL = os.environ.get("SUMOPOD_CHAT_MODEL", "gpt-4o-mini")

AGENT_MAX_TOOL_ROUNDS = int(os.environ.get("AGENT_MAX_TOOL_ROUNDS", "6"))
AGENT_CHAT_HISTORY_TURNS = int(os.environ.get("AGENT_CHAT_HISTORY_TURNS", "12"))

# Directory containing docker-compose.yml, for docker_ops tool commands.
COMPOSE_PROJECT_DIR = os.environ.get("COMPOSE_PROJECT_DIR", str(BASE_DIR.parent.parent))

# Hard server-side cap on run_shell's timeout_seconds -- the model's
# requested value is clamped to this, never trusted unbounded.
MAX_SHELL_TIMEOUT_SECONDS = int(os.environ.get("MAX_SHELL_TIMEOUT_SECONDS", "120"))

# Comma-separated list of allowed browser origins. Deliberately NOT "*" --
# unlike Insight (public price-chat), this service can run shell commands.
CORS_ALLOW_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
