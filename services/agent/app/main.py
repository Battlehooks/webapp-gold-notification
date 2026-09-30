"""Agent Service -- owner-only, tool-equipped ops agent with real shell
access to wherever this process runs. Kept entirely separate from Insight
(which has zero auth and wide-open CORS, meant for public price-chat) so a
bug or prompt-injection risk there can never reach shell tools here.

See README.md for why this service must be deployed bare-metal on the VPS,
not inside docker-compose.
"""
from __future__ import annotations

import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import agent_loop
from app.auth import require_agent_token
from app.config import CORS_ALLOW_ORIGINS

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str
    message: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", dependencies=[Depends(require_agent_token)])
def chat_endpoint(req: ChatRequest):
    reply = agent_loop.answer(req.session_id, req.message)
    return {"session_id": req.session_id, "reply": reply}
