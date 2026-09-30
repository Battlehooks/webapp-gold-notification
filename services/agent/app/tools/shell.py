"""The general-purpose escape hatch: real, unsandboxed shell access to
wherever this process runs. See the service README for why this service is
meant to be deployed bare-metal on the VPS rather than in Docker -- a
container-scoped shell here would silently misreport (not error on) the
state of the actual host.
"""
from __future__ import annotations

import os
import signal
import subprocess
import time

from app.config import MAX_SHELL_TIMEOUT_SECONDS


def run_shell(command: str, timeout_seconds: int = 30) -> dict:
    if not command or not command.strip():
        return {"error": "command must be a non-empty string"}

    # Never trust the model's requested timeout unbounded.
    timeout = max(1, min(int(timeout_seconds or 30), MAX_SHELL_TIMEOUT_SECONDS))

    popen_kwargs: dict = dict(
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    posix = os.name == "posix"
    if posix:
        # New process group so a timeout kills the whole pipeline/subtree,
        # not just the immediate shell -- plain subprocess.run(timeout=...)
        # with shell=True only kills the shell itself, leaving orphans.
        popen_kwargs["preexec_fn"] = os.setsid

    start = time.monotonic()
    try:
        proc = subprocess.Popen(command, **popen_kwargs)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}

    try:
        stdout, stderr = proc.communicate(timeout=timeout)
        return {"stdout": stdout, "stderr": stderr, "exit_code": proc.returncode}
    except subprocess.TimeoutExpired:
        if posix:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            proc.kill()
        stdout, stderr = proc.communicate()
        elapsed = time.monotonic() - start
        return {
            "stdout": stdout,
            "stderr": (stderr or "") + f"\n[killed after {elapsed:.1f}s, timeout was {timeout}s]",
            "exit_code": None,
            "timed_out": True,
        }
