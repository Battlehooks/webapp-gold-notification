"""Convenience wrappers over `docker compose` for the project's own four
services. These exist so the model doesn't have to hand-construct compose
syntax for the common ops requests -- run_shell remains available for
anything these don't cover. List-form subprocess args (never shell=True
string interpolation) and a name allowlist, even though run_shell is already
unsandboxed: no reason to make the narrow tools sloppier than necessary.
"""
from __future__ import annotations

import json
import subprocess

from app.config import COMPOSE_PROJECT_DIR

ALLOWED_CONTAINERS = ["market-data", "insight", "notification", "frontend"]


def _run_compose(args: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=COMPOSE_PROJECT_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def list_containers() -> dict:
    try:
        proc = _run_compose(["ps", "--format", "json"], timeout=30)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}
    if proc.returncode != 0:
        return {"error": proc.stderr.strip() or f"docker compose ps exited {proc.returncode}"}
    containers = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            containers.append(json.loads(line))
        except ValueError:
            continue
    return {"containers": containers}


def restart_container(name: str) -> dict:
    if name not in ALLOWED_CONTAINERS:
        return {"error": f"unknown container {name!r}, expected one of {ALLOWED_CONTAINERS}"}
    try:
        proc = _run_compose(["restart", name], timeout=60)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}
    return {"stdout": proc.stdout, "stderr": proc.stderr, "exit_code": proc.returncode}


def tail_logs(name: str, lines: int = 100) -> dict:
    if name not in ALLOWED_CONTAINERS:
        return {"error": f"unknown container {name!r}, expected one of {ALLOWED_CONTAINERS}"}
    n = max(1, min(int(lines or 100), 2000))
    try:
        proc = _run_compose(["logs", "--no-color", "--tail", str(n), name], timeout=30)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}
    return {"logs": proc.stdout, "stderr": proc.stderr, "exit_code": proc.returncode}
