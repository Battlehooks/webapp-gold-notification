"""Fetchers for Indonesian gold prices (Pegadaian, Treasury). Ported from the
root project's gold_price.py -- endpoints reverse-engineered from
iamutaki/logam-mulia-api.

Both fetchers return the same normalized shape:
    {"source": str, "sell": float, "buyback": float, "source_updated_at": str}
with prices in IDR per gram.
"""
from __future__ import annotations

import json

import requests

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": BROWSER_UA, "Accept": "application/json"}

PEGADAIAN_URL = "https://sahabat.pegadaian.co.id/gold/prices/chart"
TREASURY_URL = "https://api.treasury.id/api/v1/antigrvty/gold/rate"


class StalePriceError(RuntimeError):
    """Latest Pegadaian price point doesn't match the series' updateDate."""


def _date_part(value: str) -> str:
    return value.strip().replace("T", " ").split(" ")[0]


def fetch_pegadaian(timeout: int = 30) -> dict:
    resp = requests.get(
        PEGADAIAN_URL,
        params={"interval": 7, "isRequest": "true"},
        headers=HEADERS,
        timeout=timeout,
        allow_redirects=True,
    )
    resp.raise_for_status()
    all_grafik = resp.json()["data"]["allGrafik"]

    prices: dict[str, float] = {}
    updated = None
    for grafik in all_grafik:
        tipe = grafik.get("tipe")
        if tipe not in ("jual", "beli") or tipe in prices:
            continue
        fluktuasi = grafik.get("jsonFluktuasi")
        if isinstance(fluktuasi, str):
            fluktuasi = json.loads(fluktuasi)
        price_list = (fluktuasi or {}).get("priceList") or []
        if not price_list:
            continue
        latest = price_list[0]
        if _date_part(latest.get("lastUpdate", "")) != _date_part(grafik.get("updateDate", "")):
            raise StalePriceError(
                f"pegadaian {tipe}: lastUpdate={latest.get('lastUpdate')!r} "
                f"!= updateDate={grafik.get('updateDate')!r}"
            )
        unit = float(latest.get("unit") or 0.01)
        prices[tipe] = float(latest["harga"]) / unit
        updated = latest.get("lastUpdate")

    if "jual" not in prices or "beli" not in prices:
        raise ValueError(f"pegadaian: incomplete series, got {sorted(prices)}")

    return {
        "source": "pegadaian",
        "sell": prices["jual"],
        "buyback": prices["beli"],
        "source_updated_at": updated,
    }


def fetch_treasury(timeout: int = 30) -> dict:
    resp = requests.post(TREASURY_URL, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()["data"]
    return {
        "source": "treasury",
        "sell": float(data["buying_rate"]),
        "buyback": float(data["selling_rate"]),
        "source_updated_at": data.get("updated_at"),
    }


FETCHERS = {"pegadaian": fetch_pegadaian, "treasury": fetch_treasury}
