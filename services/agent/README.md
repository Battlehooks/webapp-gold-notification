# Agent Service

An owner-only, tool-equipped ops agent with **real, unsandboxed shell access** to
wherever this process runs. Reachable only from the "Agent" tab in the web frontend
(token-gated). Answers by looping an LLM against a small set of ops tools (`run_shell`,
container restart/logs, disk/memory) — see `app/agent_loop.py` for the full tool
list and system prompt.

This is the highest-blast-radius piece of the whole project. Read this file fully
before running it anywhere reachable.

## Why this service is NOT in docker-compose.yml

Every other service here runs in Docker. This one deliberately doesn't, and shouldn't:

A container-scoped shell tool is **worse than no shell tool at all** — `run_shell("df -h")`
run inside a container returns real, syntactically valid output, just for the
*container's own* filesystem, not the VPS. It won't error, it'll quietly misinform,
which is exactly backwards for a tool whose whole job is trustworthy infra
introspection. Mounting the Docker socket as a "safer" middle ground doesn't help
either — socket access is already root-equivalent on the host, so it's the same blast
radius with more moving parts for zero safety benefit.

So: **run this service bare-metal**, directly on the machine you want it to administer
(your dev machine for local testing, the real VPS for production). Its subprocess
calls then have exactly the access of whatever OS user runs the process — no
container-escape tricks needed, and no illusion of a sandbox that doesn't actually
exist.

## Run standalone (dev)

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
# secrets live in the shared services/.env (from services/.env.example):
# SUMOPOD_API_KEY, plus AGENT_TOKEN -- /chat refuses every request until it's set
uvicorn app.main:app --reload --port 8003
```

Run this directly on your dev machine, not in a container, if you want `docker_ops`/
`system_info` tools to reflect anything real. It talks to the other services over
its host-mapped ports — no special networking needed for local dev.

`disk_usage`/`memory_usage` (`df`/`free`) and `run_shell`'s process-group-kill-on-timeout
are Linux-specific; they degrade gracefully (or the shell commands simply won't exist)
on a Windows dev machine. That's expected, not a bug — the real target is the Linux
VPS.

## Run in production (the real VPS)

Run as a systemd unit, bound to localhost only (see "Network exposure" below):

```ini
[Unit]
Description=gold-notification-web agent service
After=docker.service

[Service]
WorkingDirectory=/opt/gold-notification-web/services/agent
ExecStart=/opt/gold-notification-web/services/agent/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8003
Restart=on-failure
User=deploy

[Install]
WantedBy=multi-user.target
```

No `EnvironmentFile=` is needed: the service loads the shared `services/.env` itself.
Set `COMPOSE_PROJECT_DIR` to wherever `docker-compose.yml` actually lives on the VPS
(it defaults to this repo's root), so `restart_container`/`list_containers`/`tail_logs`
run `docker compose` against the right project.

## Network exposure — a separate decision from "full shell access"

You've already decided this agent gets real, unsandboxed shell access. Whether its
port is reachable from the public internet is a **different, still-open** decision:
if you bind `0.0.0.0:8003` so your browser can reach the web "Agent" tab from
anywhere, the entire safety of this feature rests on `AGENT_TOKEN` never leaking
(browser history, logs, a future XSS in the frontend, a misconfigured CORS entry —
any of these becomes remote code execution on your VPS). Recommended, in order of
preference:

1. Bind `127.0.0.1` (as in the systemd unit above) and reach the web UI via an SSH
   tunnel (`ssh -L 8003:localhost:8003 user@vps`) or a private network (Tailscale/
   WireGuard).
2. If you must expose it directly, put it behind a reverse proxy with TLS, and treat
   `AGENT_TOKEN` as rotatable rather than "set once and forget."

## `AGENT_TOKEN`

The only real gate on `/chat`. The web UI's token form is a convenience layer in front
of a client that already holds this token — anyone who obtains it directly can call
`/chat` with full shell access. Never log it, never commit a real value, never reuse it,
and rotate it immediately if it's ever exposed.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness check |
| POST | `/chat` `{session_id, message}` | `x-agent-token` header | Tool-equipped ops reply; every tool call is written to `command_audit_log` before the model sees the result |

## Tools (v1)

`run_shell`, `list_containers`, `restart_container`, `tail_logs`, `disk_usage`,
`memory_usage` — see
`app/agent_loop.py`'s `SYSTEM_PROMPT` for exact signatures. New tools can be added
under `app/tools/` without touching this set.
