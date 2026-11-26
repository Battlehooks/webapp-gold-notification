"""Rule-signal and registry tests. stdlib unittest only; no network calls.

Run from services/market-data:
    python -m unittest discover -s tests -v
"""
import unittest

import pandas as pd

from app import fetchers_crypto, signals


def _stats(**overrides) -> dict:
    base = {
        "pct_rank_30d": None,
        "price_vs_avg30_pct": None,
        "rsi_14": None,
        "days_of_data": 30,
    }
    base.update(overrides)
    return base


class PerSourceThresholdTests(unittest.TestCase):
    def test_usdt_band_is_tighter_than_default(self):
        # -1.5% is inside the default +-3% band but outside usdt's +-1%.
        s = _stats(pct_rank_30d=20, price_vs_avg30_pct=-1.5, rsi_14=50)
        usdt = signals.compute_rule_signal(dict(s), "usdt")
        self.assertEqual(usdt["signal"], "BUY")
        # Two votes fired: percentile rank and price vs average.
        self.assertEqual(len(usdt["signal_reasons"]), 2)
        for source in ("btc", None):
            with self.subTest(source=source):
                result = signals.compute_rule_signal(dict(s), source)
                self.assertEqual(result["signal"], "WAIT")
                # Only the percentile-rank vote fired; the price vote did not.
                self.assertEqual(len(result["signal_reasons"]), 1)

    def test_btc_and_usdt_both_vote_at_minus_3_5(self):
        s = _stats(pct_rank_30d=20, price_vs_avg30_pct=-3.5, rsi_14=50)
        for source in ("usdt", "btc"):
            with self.subTest(source=source):
                result = signals.compute_rule_signal(dict(s), source)
                self.assertEqual(result["signal"], "BUY")

    def test_default_behaviour_unchanged_for_sell(self):
        s = _stats(pct_rank_30d=80, price_vs_avg30_pct=3.0)
        for source in ("btc", None):
            with self.subTest(source=source):
                result = signals.compute_rule_signal(dict(s), source)
                self.assertEqual(result["signal"], "SELL")

    def test_fewer_than_two_indicators_is_wait_for_usdt_too(self):
        s = _stats(pct_rank_30d=None, price_vs_avg30_pct=None, rsi_14=50, days_of_data=10)
        for source in ("usdt", "btc"):
            with self.subTest(source=source):
                result = signals.compute_rule_signal(dict(s), source)
                self.assertEqual(result["signal"], "WAIT")
                self.assertEqual(len(result["signal_reasons"]), 1)
                self.assertIn("only 10 day(s) of history", result["signal_reasons"][0])


class ComputeStatsTests(unittest.TestCase):
    """In-memory frame through compute_stats: checks the per-source band is
    applied via the groupby key, with identical price data for both sources."""

    def test_usdt_band_applies_through_compute_stats(self):
        days = pd.date_range("2026-10-01", periods=30, freq="D")
        sells = [18000.0] * 29 + [17700.0]  # latest is ~1.6% below the 30d mean
        rows = [
            {"source": src, "sell": sell, "buyback": sell, "fetched_at": ts}
            for src in ("usdt", "btc")
            for ts, sell in zip(days, sells)
        ]
        stats = signals.compute_stats(pd.DataFrame(rows))

        usdt_reasons = stats["usdt"]["signal_reasons"]
        btc_reasons = stats["btc"]["signal_reasons"]
        self.assertTrue(any("below its 30d average" in r for r in usdt_reasons), usdt_reasons)
        self.assertFalse(any("below its 30d average" in r for r in btc_reasons), btc_reasons)
        self.assertEqual(stats["usdt"]["signal"], "BUY")


class RegistryTests(unittest.TestCase):
    def test_fx_group_contains_usdt(self):
        self.assertIn("fx", signals.GROUPS)
        self.assertEqual(signals.GROUPS["fx"]["sources"], ["usdt"])

    def test_usdt_is_meta_but_not_in_crypto(self):
        self.assertIn("usdt", signals.SOURCE_META)
        self.assertNotIn("usdt", signals.GROUPS["crypto"]["sources"])

    def test_usdt_fetcher_and_pair_registered(self):
        self.assertIn("usdt", fetchers_crypto.FETCHERS)
        self.assertEqual(fetchers_crypto.PAIRS["usdt"], "usdtidr")


if __name__ == "__main__":
    unittest.main()
