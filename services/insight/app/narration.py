"""LLM narration of the (already-decided, historical-data-only) rule-based
signal computed by the Market Data Service. Ported from the root project's
trend_summary.py -- minus the chart/Telegram parts, which live in
Notification. The LLM explains the signal; it never gets to change it.
"""
from __future__ import annotations

import json

import requests

from app.config import SUMOPOD_API_KEY, SUMOPOD_BASE_URL, SUMOPOD_MODEL

GROUPS = {
    "gold": {
        "sources": ["pegadaian"],
        "title": "Daily Pegadaian gold update",
        "asset_desc": "Indonesian Pegadaian gold price (IDR per gram), sell side",
    },
    "crypto": {
        "sources": ["btc", "eth", "sol", "treasury"],
        "title": "Crypto & Treasury trend update",
        "asset_desc": (
            "BTC, ETH, and SOL prices in IDR per coin (Indodax) plus the "
            "Indonesian Treasury gold price in IDR per gram, sell side -- these "
            "are different units, compare each source's own % change, not the "
            "raw price levels across sources"
        ),
    },
}

SOURCE_META = {
    "pegadaian": {"display": "Pegadaian", "unit_suffix": "/g"},
    "treasury": {"display": "Treasury", "unit_suffix": "/g"},
    "btc": {"display": "BTC", "unit_suffix": ""},
    "eth": {"display": "ETH", "unit_suffix": ""},
    "sol": {"display": "SOL", "unit_suffix": ""},
}

SIGNAL_EMOJI = {"BUY": "\U0001f7e2", "SELL": "\U0001f534", "WAIT": "\U0001f7e1"}


def fmt_rp(value: float) -> str:
    return "Rp {:,.0f}".format(value).replace(",", ".")


def _parse_llm_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if "\n" in content:
            first_line, rest = content.split("\n", 1)
            content = rest if first_line.strip().lower() in ("json", "") else content
    parsed = json.loads(content)
    if "per_source" not in parsed or "overview" not in parsed:
        raise ValueError("LLM JSON response missing 'per_source' or 'overview'")
    return parsed


def llm_reasoning(stats: dict, group: dict, headlines: list[str]) -> dict:
    if not SUMOPOD_API_KEY:
        raise RuntimeError("SUMOPOD_API_KEY not set")
    headlines_block = "\n".join(f"- {h}" for h in headlines) or "(none available)"
    prompt = (
        f"Here are computed statistics and a rule-based BUY/SELL/WAIT signal "
        f"for {group['asset_desc']} over the last 30 days:\n\n"
        f"{json.dumps(stats, indent=2)}\n\n"
        "The 'signal' field per source is already decided by a fixed rule "
        "(based on RSI, 30-day percentile rank, and price vs 30-day average) "
        "-- do not change it or invent a different one.\n\n"
        f"Recent news (war, rates/inflation, politics/policy, Bitcoin and "
        f"gold developments) -- for context only, they do NOT change the "
        f"signal above; use one only if it plausibly explains a source's "
        f"move, ignore the rest:\n{headlines_block}\n\n"
        "Reply with ONLY a JSON object, no markdown fences, no extra text, "
        "shaped exactly like:\n"
        '{"per_source": {"<source_key>": "<one sentence, max 30 words, citing '
        'at least one concrete number from the stats, explaining why that '
        'signal makes sense>"}, "overview": "<max 60 words, plain text, '
        'overall direction across sources, anything notable about '
        'volatility>"}\n\n'
        "Null values mean not enough history yet -- for those sources just say "
        "so plainly. This is for a personal reference notification, not "
        "financial advice; do not add disclaimers, hedging phrases, or "
        "recommend consulting an advisor -- a disclaimer is appended "
        "separately."
    )
    resp = requests.post(
        f"{SUMOPOD_BASE_URL.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {SUMOPOD_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": SUMOPOD_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a concise assistant explaining "
                    "precomputed price signals for a personal notification. "
                    "Factual, grounded only in the given numbers, no advice.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_tokens": 1500,
            "temperature": 0.4,
        },
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return _parse_llm_json(content)


def format_summary(stats: dict, group: dict, reasoning: dict | None) -> str:
    blocks = []
    for source in group["sources"]:
        s = stats.get(source)
        if not s:
            continue
        meta = SOURCE_META[source]
        price_line = f"{fmt_rp(s['latest_sell_idr'])}{meta['unit_suffix']}"
        if s.get("pct_change_7d") is not None:
            price_line += f", {s['pct_change_7d']:+.2f}% over 7d"
        reason_text = None
        if reasoning:
            reason_text = reasoning.get("per_source", {}).get(source)
        if not reason_text:
            reason_text = "; ".join(s["signal_reasons"])
        emoji = SIGNAL_EMOJI[s["signal"]]
        blocks.append(
            f"{meta['display']}: {price_line}\n{emoji} {s['signal']} -- {reason_text}"
        )
    body = "\n\n".join(blocks)
    overview = reasoning.get("overview") if reasoning else None
    if overview:
        body += f"\n\n{overview}"
    return body
