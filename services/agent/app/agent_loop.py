"""Tool-equipped ops agent with real, unsandboxed shell access to wherever
this process runs. Ported from insight/app/chat.py's manual structured-JSON
routing loop (same rationale: tool-call passthrough fidelity across
SumoPod's proxied providers is unverified) rather than native
tools/tool_choice. Every tool call is unconditionally audit-logged before
the result reaches the model -- see app/db.py's command_audit_log.
"""
from __future__ import annotations

import json
import time
import traceback

import requests

from app import db
from app.config import (
    AGENT_CHAT_HISTORY_TURNS,
    AGENT_MAX_TOOL_ROUNDS,
    SUMOPOD_API_KEY,
    SUMOPOD_BASE_URL,
    SUMOPOD_CHAT_MODEL,
)
from app.tools import docker_ops, shell, system_info

TOOL_NAMES = {
    "run_shell",
    "list_containers",
    "restart_container",
    "tail_logs",
    "disk_usage",
    "memory_usage",
}

SYSTEM_PROMPT = (
    "You are an ops assistant with REAL, UNSANDBOXED shell access to the VPS "
    "hosting this project's Docker services. You are reachable only by the "
    "project owner, through an authenticated web page -- there is no other "
    "audience. Every tool call "
    "you make, especially run_shell, is permanently logged (command, output, "
    "exit code, duration) before you ever see the result, for accountability. "
    "Prefer the narrow tools (restart_container, tail_logs, disk_usage, "
    "memory_usage) over "
    "run_shell when one of them already does what's needed -- reach for "
    "run_shell only for genuinely ad-hoc diagnostics. Never invent command "
    "output; only report what a tool actually returned. If an action could be "
    "destructive (restarting a service, deleting files), state plainly what you're about to do, then do it -- the owner "
    "already authorized this agent for exactly this kind of action, so don't "
    "ask permission first, but stay transparent about what ran and what it "
    "returned. Reply in the same language as the owner's most recent message.\n\n"
    "On each turn reply with ONLY one JSON object, no markdown fences, no "
    "extra text, shaped exactly like one of:\n"
    '{"action": "tool", "tool": "<name>", "args": {...}}\n'
    '{"action": "answer", "answer": "<final reply text to send the owner>"}\n\n'
    "Available tools:\n"
    "- run_shell(command, timeout_seconds=30): run any shell command on the "
    "host. Returns {stdout, stderr, exit_code}, output truncated to a few KB. "
    "Full access -- no allowlist.\n"
    "- list_containers(): docker compose ps for this project -- name/state/"
    "status per service.\n"
    f"- restart_container(name): docker compose restart <name>, name one of "
    f"{sorted(docker_ops.ALLOWED_CONTAINERS)}.\n"
    "- tail_logs(name, lines=100): last N lines of docker compose logs for "
    "one service.\n"
    "- disk_usage(): disk space per mounted filesystem (Linux host only).\n"
    "- memory_usage(): total/used/free/available memory in MB (Linux host only).\n\n"
    f"You get at most {AGENT_MAX_TOOL_ROUNDS} tool calls before you must "
    "answer. Don't re-fetch something you already have from earlier in this "
    "conversation."
)


def _dispatch(name: str, args: dict) -> dict:
    if name == "run_shell":
        return shell.run_shell(args.get("command", ""), int(args.get("timeout_seconds") or 30))
    if name == "list_containers":
        return docker_ops.list_containers()
    if name == "restart_container":
        return docker_ops.restart_container(args.get("name", ""))
    if name == "tail_logs":
        return docker_ops.tail_logs(args.get("name", ""), int(args.get("lines") or 100))
    if name == "disk_usage":
        return system_info.disk_usage()
    if name == "memory_usage":
        return system_info.memory_usage()
    return {"error": f"unknown tool {name!r}"}


def _run_tool(conn, session_id: str, name: str, args: dict) -> dict:
    """Audit-log choke point -- every call, success or exception, writes one
    row to command_audit_log in a finally block before the result is
    returned to the model."""
    start = time.monotonic()
    ok = True
    result: dict = {}
    try:
        result = _dispatch(name, args)
        ok = "error" not in result
    except Exception as exc:
        traceback.print_exc()
        result = {"error": f"{type(exc).__name__}: {exc}"}
        ok = False
    finally:
        db.log_command(
            conn,
            session_id,
            name,
            args,
            ok,
            result.get("exit_code"),
            result.get("stdout") or result.get("logs"),
            result.get("stderr") or result.get("error"),
            int((time.monotonic() - start) * 1000),
        )
    return result


def _parse_action(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if "\n" in content:
            first_line, rest = content.split("\n", 1)
            content = rest if first_line.strip().lower() in ("json", "") else content
    parsed = json.loads(content)
    if parsed.get("action") not in ("tool", "answer"):
        raise ValueError("response missing a valid 'action'")
    return parsed


def _call_model(messages: list[dict]) -> str:
    if not SUMOPOD_API_KEY:
        raise RuntimeError("SUMOPOD_API_KEY not set")
    resp = requests.post(
        f"{SUMOPOD_BASE_URL.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {SUMOPOD_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": SUMOPOD_CHAT_MODEL,
            "messages": messages,
            "max_tokens": 1500,
            "temperature": 0.2,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def answer(session_id: str, user_text: str) -> str:
    """Answer one owner message, with up to AGENT_MAX_TOOL_ROUNDS tool-call
    rounds against real ops tools. Always returns a reply string -- never
    raises past this point."""
    conn = db.connect()
    try:
        keep = AGENT_CHAT_HISTORY_TURNS * 2
        db.append_chat_message(conn, session_id, "user", user_text, keep=keep)

        history = db.recent_chat_history(conn, session_id, keep)
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for turn in history:
            role = turn["role"] if turn["role"] in ("user", "assistant") else "user"
            messages.append({"role": role, "content": turn["content"]})

        reply_text = None
        for _ in range(AGENT_MAX_TOOL_ROUNDS):
            try:
                content = _call_model(messages)
                action = _parse_action(content)
            except Exception:
                traceback.print_exc()
                break

            if action["action"] == "answer":
                reply_text = (action.get("answer") or "").strip()
                break

            tool_name = action.get("tool")
            args = action.get("args") or {}
            if tool_name not in TOOL_NAMES:
                result = {"error": f"unknown tool {tool_name!r}"}
            else:
                result = _run_tool(conn, session_id, tool_name, args)

            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user", "content": json.dumps(result)})

        if reply_text is None:
            messages.append(
                {
                    "role": "user",
                    "content": "No more tool calls -- reply now with "
                    '{"action": "answer", "answer": "..."} using whatever you already have.',
                }
            )
            try:
                content = _call_model(messages)
                action = _parse_action(content)
                reply_text = (action.get("answer") or "").strip()
            except Exception:
                traceback.print_exc()
                reply_text = ""

        if not reply_text:
            reply_text = (
                "Sorry, I couldn't put together an answer just now -- please try "
                "rephrasing or ask again in a bit."
            )

        db.append_chat_message(conn, session_id, "assistant", reply_text, keep=keep)
        return reply_text
    finally:
        conn.close()
