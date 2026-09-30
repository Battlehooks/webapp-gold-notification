"""Thin canned-command wrappers for common host introspection. Linux-only
(the real VPS); fail soft on anything else (e.g. a Windows dev machine)
rather than crashing the tool loop, same philosophy as insight/app/news.py's
optional-provider handling.
"""
from __future__ import annotations

import subprocess


def disk_usage() -> dict:
    try:
        proc = subprocess.run(["df", "-h"], capture_output=True, text=True, timeout=15)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc} (disk_usage is Linux-only)"}
    if proc.returncode != 0:
        return {"error": proc.stderr.strip() or "df exited non-zero"}
    return {"stdout": proc.stdout}


def memory_usage() -> dict:
    try:
        proc = subprocess.run(["free", "-m"], capture_output=True, text=True, timeout=15)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc} (memory_usage is Linux-only)"}
    if proc.returncode != 0:
        return {"error": proc.stderr.strip() or "free exited non-zero"}
    return {"stdout": proc.stdout}
