"""Insight Service -- news context + LLM narration of the Market Data
Service's signal, plus a tool-equipped chat agent. The slowest, most
failure-prone piece of the system (paid LLM + two news APIs) is isolated
here on purpose: an outage here must never block price ingestion or basic
alert delivery, which is exactly what happens once it's a separate process
instead of an in-process call in the routine push.
"""
from __future__ import annotations

import logging
import traceback

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import chat, db, market_data_client, news
from app.narration import GROUPS, format_summary, llm_reasoning

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Insight Service")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


class NarrateRequest(BaseModel):
    group: str
    banner: str | None = None


class ChatRequest(BaseModel):
    chat_id: str
    message: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/narrate")
def narrate(req: NarrateRequest):
    if req.group not in GROUPS:
        raise HTTPException(404, f"unknown group {req.group!r}, expected one of {sorted(GROUPS)}")
    group = GROUPS[req.group]

    try:
        signals_resp = market_data_client.get_group_signals(req.group)
    except Exception as exc:
        raise HTTPException(502, f"market-data unavailable: {exc}")

    stats = signals_resp.get("sources") or {}
    if not stats:
        raise HTTPException(404, f"no price history yet for group {req.group!r}")

    headlines = news.context_headlines()
    try:
        reasoning = llm_reasoning(stats, group, headlines)
    except Exception:
        traceback.print_exc()
        reasoning = None

    summary_text = format_summary(stats, group, reasoning)

    conn = db.connect()
    try:
        db.save_analysis_run(conn, req.group, stats, reasoning, headlines, summary_text, req.banner)
    finally:
        conn.close()

    return {
        "group": req.group,
        "title": group["title"],
        "stats": stats,
        "reasoning": reasoning,
        "summary_text": summary_text,
        "headlines": headlines,
        "banner": req.banner,
    }


@app.get("/analysis/{group}")
def analysis(group: str):
    if group not in GROUPS:
        raise HTTPException(404, f"unknown group {group!r}, expected one of {sorted(GROUPS)}")
    conn = db.connect()
    try:
        run = db.latest_analysis_run(conn, group)
        if not run:
            raise HTTPException(404, f"no analysis saved yet for group {group!r}")
        return run
    finally:
        conn.close()


@app.get("/why-moved")
def why_moved(display: str, pct: float):
    return {"why": news.why_moved(display, pct)}


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    reply = chat.answer(req.chat_id, req.message)
    return {"chat_id": req.chat_id, "reply": reply}
