"""News/context fetchers for LLM grounding. Ported unchanged from the root
project's news.py.

- context_headlines(): GNews + Google News RSS, searched by macro theme
  (war, rates/inflation, politics, plus targeted Bitcoin/gold developments)
  rather than bare asset name, since theme search is predictive and
  asset-name search is only reactive after-the-fact coverage.
- why_moved(): Tavily's synthesized answer, used for the sudden-move alert's
  one-line "why".

Every fetcher fails soft (empty list / None) -- a flaky or unconfigured news
provider must never break narration.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET

import requests

from app.config import GNEWS_API_KEY, TAVILY_API_KEY

GNEWS_ENDPOINT = "https://gnews.io/api/v4/search"
RSS_ENDPOINT = "https://news.google.com/rss/search"
TAVILY_ENDPOINT = "https://api.tavily.com/search"

QUERY_THEMES = [
    "war OR military conflict OR geopolitical crisis",
    "inflation OR interest rate decision OR central bank policy",
    "election OR government policy OR sanctions OR trade war",
    "Bitcoin regulation OR Bitcoin ETF OR Bitcoin adoption OR crypto crackdown",
    "gold reserves OR gold demand OR central bank gold buying",
]


def _fetch_gnews(query: str, max_results: int) -> list[str]:
    if not GNEWS_API_KEY:
        return []
    try:
        resp = requests.get(
            GNEWS_ENDPOINT,
            params={"q": query, "lang": "en", "max": max_results, "apikey": GNEWS_API_KEY},
            timeout=15,
        )
        resp.raise_for_status()
        return [a["title"] for a in resp.json().get("articles", []) if a.get("title")]
    except Exception:
        return []


def _fetch_google_news_rss(query: str, max_results: int) -> list[str]:
    try:
        resp = requests.get(
            RSS_ENDPOINT,
            params={"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"},
            timeout=15,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        titles = [item.findtext("title") for item in root.findall(".//item")]
        return [t.strip() for t in titles[:max_results] if t and t.strip()]
    except Exception:
        return []


def context_headlines(max_results: int = 10) -> list[str]:
    seen: set[str] = set()
    per_theme: list[list[str]] = []
    for query in QUERY_THEMES:
        titles = []
        for title in _fetch_gnews(query, 3) + _fetch_google_news_rss(query, 3):
            key = title.lower()
            if key not in seen:
                seen.add(key)
                titles.append(title)
        per_theme.append(titles)

    out: list[str] = []
    row = 0
    while len(out) < max_results and row < max((len(t) for t in per_theme), default=0):
        for titles in per_theme:
            if row < len(titles):
                out.append(titles[row])
                if len(out) >= max_results:
                    break
        row += 1
    return out


def why_moved(display: str, pct: float) -> str | None:
    if not TAVILY_API_KEY:
        return None
    direction = "surged" if pct > 0 else "dropped"
    query = f"why did {display} price {direction} {abs(pct):.0f}% today"
    try:
        resp = requests.post(
            TAVILY_ENDPOINT,
            headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
            json={
                "query": query,
                "search_depth": "basic",
                "include_answer": "basic",
                "max_results": 3,
                "topic": "news",
            },
            timeout=20,
        )
        resp.raise_for_status()
        answer = resp.json().get("answer")
        return answer.strip() if answer else None
    except Exception:
        return None
