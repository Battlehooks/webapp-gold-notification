"""Fetchers for Indonesian gold prices: Pegadaian (JSON API, endpoint
reverse-engineered from iamutaki/logam-mulia-api) and IndoGold (Antam retail
price, scraped from its harga-emas-hari-ini page).

Both fetchers return the same normalized shape:
    {"source": str, "sell": float, "buyback": float, "source_updated_at": str}
with prices in IDR per gram.
"""
from __future__ import annotations

import json
import re
from html import unescape

import requests

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": BROWSER_UA, "Accept": "application/json"}

PEGADAIAN_URL = "https://sahabat.pegadaian.co.id/gold/prices/chart"
INDOGOLD_URL = "https://www.indogold.id/harga-emas-hari-ini"

_INDOGOLD_PRICE_RE = re.compile(
    r"Harga Beli Rp ([\d.,]+)/gram, Harga Jual/Buyback Rp ([\d.,]+)/gram"
)
_INDOGOLD_DATE_RE = re.compile(
    r"(?:Senin|Selasa|Rabu|Kamis|Jumat|Jum'?at|Sabtu|Minggu), (\d{1,2}) ([A-Za-z]+) (\d{4})"
)
_ID_MONTHS = {
    name.lower(): i
    for i, name in enumerate(
        [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember",
        ],
        start=1,
    )
}


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


def _parse_idr(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def fetch_indogold(timeout: int = 30) -> dict:
    resp = requests.get(INDOGOLD_URL, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    text = unescape(resp.text)

    price = _INDOGOLD_PRICE_RE.search(text)
    if not price:
        raise ValueError("indogold: price pattern not found in page")

    date = _INDOGOLD_DATE_RE.search(text)
    month = _ID_MONTHS.get(date.group(2).lower()) if date else None
    if not date or month is None:
        raise ValueError("indogold: page date not found")
    day, year = int(date.group(1)), int(date.group(3))

    return {
        "source": "indogold",
        "sell": _parse_idr(price.group(1)),
        "buyback": _parse_idr(price.group(2)),
        "source_updated_at": f"{year:04d}-{month:02d}-{day:02d}",
    }


FETCHERS = {"pegadaian": fetch_pegadaian, "indogold": fetch_indogold}
