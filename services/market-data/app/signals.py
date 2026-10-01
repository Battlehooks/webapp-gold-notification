"""Stats + deterministic BUY/SELL/WAIT signal engine. Ported from the root
project's trend_summary.py (the historical-price-only parts -- no LLM, no
chart, no delivery; narration lives in Insight, alerts in Notification).
"""
from __future__ import annotations

import sqlite3

import pandas as pd

LOOKBACK_DAYS = 30

SOURCE_META = {
    "pegadaian": {"display": "Pegadaian", "unit_suffix": "/g"},
    "treasury": {"display": "Treasury", "unit_suffix": "/g"},
    "btc": {"display": "BTC", "unit_suffix": ""},
    "eth": {"display": "ETH", "unit_suffix": ""},
    "sol": {"display": "SOL", "unit_suffix": ""},
}

GROUPS = {
    "gold": {"sources": ["pegadaian"]},
    "crypto": {"sources": ["btc", "eth", "sol", "treasury"]},
}


def load_frame(conn: sqlite3.Connection, sources: list[str], days: int = LOOKBACK_DAYS) -> pd.DataFrame:
    placeholders = ",".join("?" for _ in sources)
    return pd.read_sql_query(
        f"SELECT source, sell, buyback, fetched_at FROM prices "
        f"WHERE source IN ({placeholders}) AND fetched_at >= datetime('now', ?) "
        f"ORDER BY fetched_at",
        conn,
        params=(*sources, f"-{days} days"),
        parse_dates=["fetched_at"],
    )


def _rsi(returns: pd.Series, window: int = 14) -> float | None:
    if len(returns) < window:
        return None
    gains = returns.clip(lower=0)
    losses = -returns.clip(upper=0)
    avg_gain = gains.tail(window).mean()
    avg_loss = losses.tail(window).mean()
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def compute_rule_signal(s: dict) -> dict:
    """Deterministic BUY/SELL/WAIT from already-computed indicators. Three
    independent +-1 votes (RSI, 30d percentile rank, price vs 30d average).
    Score >=2 -> BUY, <=-2 -> SELL, otherwise WAIT."""
    score = 0
    reasons: list[str] = []
    available = 0

    if s["pct_rank_30d"] is not None:
        available += 1
        if s["pct_rank_30d"] <= 25:
            score += 1
            reasons.append(f"near its 30d low ({s['pct_rank_30d']:.0f}th percentile)")
        elif s["pct_rank_30d"] >= 75:
            score -= 1
            reasons.append(f"near its 30d high ({s['pct_rank_30d']:.0f}th percentile)")

    if s["price_vs_avg30_pct"] is not None:
        available += 1
        if s["price_vs_avg30_pct"] <= -3:
            score += 1
            reasons.append(f"{abs(s['price_vs_avg30_pct']):.1f}% below its 30d average")
        elif s["price_vs_avg30_pct"] >= 3:
            score -= 1
            reasons.append(f"{s['price_vs_avg30_pct']:.1f}% above its 30d average")

    if s["rsi_14"] is not None:
        available += 1
        if s["rsi_14"] < 30:
            score += 1
            reasons.append(f"RSI {s['rsi_14']:.0f} (oversold)")
        elif s["rsi_14"] > 70:
            score -= 1
            reasons.append(f"RSI {s['rsi_14']:.0f} (overbought)")

    if available < 2:
        return {
            "signal": "WAIT",
            "signal_reasons": [
                f"only {s['days_of_data']} day(s) of history so far -- "
                "not enough for a reliable signal"
            ],
        }
    if not reasons:
        reasons = ["no indicator crossed its threshold -- price sitting in a neutral zone"]
    if score >= 2:
        signal = "BUY"
    elif score <= -2:
        signal = "SELL"
    else:
        signal = "WAIT"
    return {"signal": signal, "signal_reasons": reasons}


def compute_stats(df: pd.DataFrame) -> dict:
    stats: dict[str, dict] = {}
    for source, grp in df.groupby("source"):
        daily = grp.set_index("fetched_at")["sell"].resample("D").last().dropna()
        if daily.empty:
            continue
        latest = float(daily.iloc[-1])

        def pct_change_over(days_back: int) -> float | None:
            cutoff = daily.index[-1] - pd.Timedelta(days=days_back)
            past = daily[daily.index <= cutoff]
            if past.empty:
                return None
            base = float(past.iloc[-1])
            return round((latest - base) / base * 100, 2) if base else None

        returns = daily.pct_change().dropna()
        min_30d = float(daily.min())
        max_30d = float(daily.max())
        avg_30d = round(float(daily.mean()), 2)

        s = {
            "latest_sell_idr": latest,
            "pct_change_7d": pct_change_over(7),
            "pct_change_30d": pct_change_over(30),
            "min_30d": min_30d,
            "max_30d": max_30d,
            "avg_30d": avg_30d,
            "volatility_daily_pct": (
                round(float(returns.std() * 100), 3) if len(returns) > 1 else None
            ),
            "days_of_data": int(len(daily)),
            "rsi_14": _rsi(returns),
            "pct_rank_30d": (
                round((latest - min_30d) / (max_30d - min_30d) * 100, 1)
                if len(daily) >= 3 and max_30d != min_30d
                else None
            ),
            "price_vs_avg30_pct": (
                round((latest - avg_30d) / avg_30d * 100, 2)
                if len(daily) >= 5 and avg_30d
                else None
            ),
        }
        s.update(compute_rule_signal(s))
        stats[source] = s
    return stats


def detect_sudden_move(
    conn: sqlite3.Connection, sources: list[str], pct_threshold: float, window_min: int
) -> dict | None:
    """Biggest qualifying move among `sources` over the last `window_min`
    minutes, or None if nothing crosses `pct_threshold`. Stateless -- cooldown
    tracking is the Notification service's job, not this service's."""
    from app import db

    best = None
    for source in sources:
        current = db.previous_price(conn, source)
        baseline = db.price_before(conn, source, window_min)
        if not current or not baseline or not baseline["sell"]:
            continue
        pct = (current["sell"] - baseline["sell"]) / baseline["sell"] * 100
        if abs(pct) >= pct_threshold and (best is None or abs(pct) > abs(best["pct"])):
            best = {"source": source, "pct": round(pct, 2)}
    return best
