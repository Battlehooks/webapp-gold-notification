"""Gold-vs-rupiah decomposition tests. stdlib unittest + in-memory pandas only.

Run from services/market-data:
    python -m unittest discover -s tests -v
"""
import unittest

import pandas as pd

from app import signals

START = pd.Timestamp("2026-11-01")


def _series(values: list[float], start: pd.Timestamp = START) -> pd.Series:
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="D"), dtype="float64")


def _day(offset: int) -> str:
    return (START + pd.Timedelta(days=offset)).date().isoformat()


def _identity_gap(w: dict) -> float:
    # Percent-space form of (1+idr)=(1+gold_usd)(1+usdidr).
    expected = w["gold_usd_pct"] + w["usdidr_pct"] + w["gold_usd_pct"] * w["usdidr_pct"] / 100
    return abs(w["idr_pct"] - expected)


class WorkedExampleTests(unittest.TestCase):
    def setUp(self):
        gold = _series([2_000_000.0] * 7 + [1_850_000.0])
        fx = _series([16_000.0] * 7 + [16_228.8])
        self.result = signals.compute_decomposition(gold, fx)

    def test_seven_day_window_matches_worked_example(self):
        w = self.result["windows"]["7d"]
        self.assertEqual(w["base_date"], _day(0))
        self.assertEqual(w["idr_pct"], -7.5)
        self.assertEqual(w["usdidr_pct"], 1.43)
        self.assertAlmostEqual(w["gold_usd_pct"], -8.8, delta=0.05)

    def test_identity_holds_on_worked_example(self):
        self.assertAlmostEqual(_identity_gap(self.result["windows"]["7d"]), 0.0, delta=0.02)

    def test_latest_values_are_last_day(self):
        self.assertEqual(self.result["as_of"], _day(7))
        self.assertEqual(self.result["latest"]["gold_idr"], 1_850_000.0)
        self.assertEqual(self.result["latest"]["usdidr"], 16_228.8)
        self.assertEqual(self.result["latest"]["gold_usd"], 113.99)

    def test_thirty_day_window_absent_with_eight_days(self):
        self.assertIsNone(self.result["windows"]["30d"])


class IdentityTests(unittest.TestCase):
    def test_identity_on_rising_gold_falling_fx(self):
        gold = _series([1_000_000.0 + 10_000.0 * i for i in range(11)])
        fx = _series([17_000.0 - 100.0 * i for i in range(11)])
        result = signals.compute_decomposition(gold, fx)
        w = result["windows"]["7d"]
        self.assertGreater(w["idr_pct"], 0)
        self.assertLess(w["usdidr_pct"], 0)
        self.assertGreater(w["gold_usd_pct"], 0)
        self.assertAlmostEqual(_identity_gap(w), 0.0, delta=0.02)


class InsufficientDataTests(unittest.TestCase):
    def assert_all_none(self, result: dict):
        self.assertIsNone(result["as_of"])
        self.assertIsNone(result["latest"])
        self.assertEqual(result["windows"], {"7d": None, "30d": None})

    def test_no_overlap_means_all_none(self):
        gold = _series([2_000_000.0] * 5)
        fx = _series([16_000.0] * 5, start=START + pd.Timedelta(days=100))
        self.assert_all_none(signals.compute_decomposition(gold, fx))

    def test_single_aligned_day_means_all_none(self):
        gold = _series([2_000_000.0])
        fx = _series([16_000.0])
        self.assert_all_none(signals.compute_decomposition(gold, fx))

    def test_empty_series_means_all_none(self):
        empty = pd.Series(dtype="float64")
        self.assert_all_none(signals.compute_decomposition(empty, _series([16_000.0, 16_100.0])))


class ShortHistoryTests(unittest.TestCase):
    def test_seven_day_window_present_thirty_day_absent(self):
        gold = _series([2_000_000.0 + 1_000.0 * i for i in range(10)])
        fx = _series([16_000.0 + 10.0 * i for i in range(10)])
        result = signals.compute_decomposition(gold, fx)
        self.assertIsNotNone(result["windows"]["7d"])
        self.assertEqual(result["windows"]["7d"]["base_date"], _day(2))
        self.assertIsNone(result["windows"]["30d"])


class MissingDayTests(unittest.TestCase):
    def test_missing_gold_day_is_skipped_and_base_falls_back(self):
        # Latest day is 10; the 7d cutoff is day 3, which has no gold price.
        gold_values = [2_000_000.0] * 11
        gold_values[10] = 1_850_000.0
        gold = _series(gold_values).drop(START + pd.Timedelta(days=3))
        fx_values = [16_000.0] * 11
        fx_values[10] = 16_228.8
        fx = _series(fx_values)

        result = signals.compute_decomposition(gold, fx)
        w = result["windows"]["7d"]
        self.assertEqual(w["base_date"], _day(2))
        self.assertEqual(w["idr_pct"], -7.5)
        self.assertEqual(result["as_of"], _day(10))


class LatestTests(unittest.TestCase):
    def test_as_of_and_latest_follow_last_aligned_day(self):
        gold = _series([2_000_000.0, 2_100_000.0, 2_200_000.0])
        fx = _series([16_000.0, 16_000.0, 16_000.0])
        result = signals.compute_decomposition(gold, fx)
        self.assertEqual(result["as_of"], _day(2))
        self.assertEqual(result["latest"]["gold_idr"], 2_200_000.0)
        self.assertEqual(result["latest"]["gold_usd"], 137.5)


class IdenticalGrowthTests(unittest.TestCase):
    def test_gold_tracking_fx_means_no_gold_move_in_dollars(self):
        fx = _series([16_000.0, 16_100.0, 16_300.0, 16_200.0, 16_400.0, 16_500.0, 16_450.0, 16_600.0])
        gold = fx * 125.0
        result = signals.compute_decomposition(gold, fx)
        w = result["windows"]["7d"]
        self.assertAlmostEqual(w["gold_usd_pct"], 0.0, places=2)
        self.assertAlmostEqual(w["idr_pct"], w["usdidr_pct"], delta=0.01)


class DailyClosesTests(unittest.TestCase):
    def test_last_sell_per_day_and_empty_for_missing_source(self):
        df = pd.DataFrame(
            {
                "source": ["pegadaian", "pegadaian", "pegadaian", "usdt"],
                "sell": [2_000_000.0, 2_010_000.0, 2_020_000.0, 16_000.0],
                "fetched_at": pd.to_datetime(
                    ["2026-11-01 09:00:00", "2026-11-01 18:00:00", "2026-11-02 09:00:00", "2026-11-01 09:00:00"]
                ),
            }
        )
        gold = signals.daily_closes(df, "pegadaian")
        self.assertEqual(gold.tolist(), [2_010_000.0, 2_020_000.0])
        self.assertTrue(signals.daily_closes(df, "indogold").empty)


if __name__ == "__main__":
    unittest.main()
