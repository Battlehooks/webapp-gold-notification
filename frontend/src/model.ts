// Plain-data derivations shared by the web and phone layouts. Nothing here
// decides a signal -- signals always come from market-data's rule engine.
import type { AnalysisRun, PricePoint } from "./api";
import { fmtJakarta, fmtJakartaTime, fmtPct, fmtQty, fmtRp, ordinal, parseUtc } from "./format";
import { holdingUnit, type Holding } from "./holdings";
import type { Asset } from "./useMarket";
import type { SeriesMap } from "./useSeries";

export interface Position {
  holding: Holding;
  asset: Asset;
  unit: string;
  qtyStr: string;
  /** Null until market-data has a price for the source. */
  price: number | null;
  value: number | null;
  pl: number | null;
}

export function positions(holdings: Holding[], bySource: Record<string, Asset>): Position[] {
  return holdings
    .filter((h) => bySource[h.source])
    .map((h) => {
      const asset = bySource[h.source];
      const unit = holdingUnit(asset.meta);
      const price = asset.stats?.latest_sell_idr ?? null;
      const value = price == null ? null : h.qty * price;
      return {
        holding: h,
        asset,
        unit,
        qtyStr: fmtQty(h.qty, unit),
        price,
        value,
        pl: value == null ? null : value - h.qty * h.avg,
      };
    });
}

export interface Portfolio {
  total: number;
  /** % change over 7 days, from each asset's own pct_change_7d; null if any is unknown. */
  d7: number | null;
  series: number[];
  since: Date | null;
}

const GRID = 120;
const DAY_MS = 86_400_000;

export function portfolio(pos: Position[], series: SeriesMap): Portfolio {
  const priced = pos.filter((p) => p.value != null);
  const total = priced.reduce((t, p) => t + (p.value ?? 0), 0);

  let weekAgo = 0;
  let d7Known = priced.length > 0;
  for (const p of priced) {
    const pct = p.asset.stats?.pct_change_7d;
    if (pct == null) d7Known = false;
    else weekAgo += (p.value ?? 0) / (1 + pct / 100);
  }
  const d7 = d7Known && weekAgo > 0 ? (total / weekAgo - 1) * 100 : null;

  // Σ qty × price on a shared time grid; each asset forward-filled onto it,
  // back-filled before its first point.
  const withPts = priced
    .map((p) => ({ p, pts: (series[p.holding.source] ?? []).map((x) => ({ t: parseUtc(x.fetched_at).getTime(), v: x.sell })) }))
    .filter((x) => x.pts.length > 0);
  if (withPts.length === 0) return { total, d7, series: [], since: null };

  const end = Date.now();
  const earliest = Math.min(...withPts.map((x) => x.pts[0].t));
  const start = Math.max(earliest, end - 30 * DAY_MS);
  const grid: number[] = new Array(GRID).fill(0);
  for (const { p, pts } of withPts) {
    let j = 0;
    for (let i = 0; i < GRID; i++) {
      const t = start + ((end - start) * i) / (GRID - 1);
      while (j + 1 < pts.length && pts[j + 1].t <= t) j++;
      grid[i] += p.holding.qty * pts[j].v;
    }
  }
  // Holdings without any series yet contribute their current value flat.
  const flat = priced.filter((p) => !withPts.some((x) => x.p === p)).reduce((t, p) => t + (p.value ?? 0), 0);
  return { total, d7, series: grid.map((v) => v + flat), since: new Date(start) };
}

export interface Change {
  icon: string;
  name: string;
  text: string;
}

/** "Since the previous run": diff of the two newest analysis snapshots per group. */
export function changes(
  runs: Record<string, AnalysisRun[]>,
  bySource: Record<string, Asset>,
  heldSources: Set<string>
): Change[] {
  const flips: Change[] = [];
  const pctMoves: Change[] = [];
  const moves: { delta: number; change: Change }[] = [];

  for (const groupRuns of Object.values(runs)) {
    if (groupRuns.length < 2) continue;
    const [cur, prev] = groupRuns;
    const time = fmtJakartaTime(cur.created_at);
    for (const [source, now] of Object.entries(cur.stats)) {
      const before = prev.stats[source];
      if (!before) continue;
      const name = bySource[source]?.meta.display ?? source;
      if (before.signal !== now.signal) {
        flips.push({ icon: "ph-arrows-left-right", name, text: `flipped ${before.signal} → ${now.signal} (${time})` });
      }
      if (
        heldSources.has(source) &&
        before.pct_rank_30d != null &&
        now.pct_rank_30d != null &&
        before.pct_rank_30d !== now.pct_rank_30d
      ) {
        pctMoves.push({
          icon: "ph-star",
          name,
          text: `30d percentile ${ordinal(before.pct_rank_30d)} → ${ordinal(now.pct_rank_30d)}`,
        });
      }
      if (before.pct_change_7d != null && now.pct_change_7d != null) {
        const delta = now.pct_change_7d - before.pct_change_7d;
        moves.push({
          delta,
          change: {
            icon: delta >= 0 ? "ph-trend-up" : "ph-trend-down",
            name,
            text: `7d ${fmtPct(before.pct_change_7d)} → ${fmtPct(now.pct_change_7d)}`,
          },
        });
      }
    }
  }
  moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return [...flips, ...pctMoves, ...moves.filter((m) => m.delta !== 0).slice(0, 2).map((m) => m.change)];
}

/** Per-turn Ask context: one line per holding. Facts only, no instructions. */
export function holdingsContext(pos: Position[]): string {
  if (pos.length === 0) return "";
  return pos
    .map(
      (p) =>
        `${p.asset.meta.display}: ${p.qtyStr}, avg cost ${fmtRp(p.holding.avg)}` +
        (p.value == null ? "" : `, current value ${fmtRp(p.value)}`)
    )
    .join("\n");
}

/** Narration for one asset, but only if it was written about the signal the
 * rule engine shows now -- a stale explanation of a different signal must not
 * be displayed next to the live one. */
export function narrationFor(asset: Asset, run: AnalysisRun | undefined): string | null {
  const text = run?.reasoning?.per_source?.[asset.source];
  if (!text || !asset.stats) return null;
  return run?.stats[asset.source]?.signal === asset.stats.signal ? text : null;
}

export function latestRunTime(runs: Record<string, AnalysisRun[]>): string | null {
  const times = Object.values(runs)
    .map((r) => r[0]?.created_at)
    .filter((t): t is string => !!t)
    .sort();
  return times.at(-1) ?? null;
}

export function lastPointTime(points: PricePoint[] | undefined): string | null {
  return points && points.length ? points[points.length - 1].fetched_at : null;
}

export function priceStr(asset: Asset, value?: number): string {
  const v = value ?? asset.stats?.latest_sell_idr;
  return v == null ? "—" : fmtRp(v) + asset.meta.unit_suffix;
}

/** Caption under the portfolio chart. */
export function sinceLabel(since: Date | null): string {
  if (!since) return "";
  return Date.now() - since.getTime() > 29 * DAY_MS ? "Last 30 days" : `Since ${fmtJakarta(since)}`;
}

/** Ask suggestion chips when no specific asset is in view. */
export const OVERVIEW_CHIPS = [
  "Should I add to my gold?",
  "Which of my assets are near a 30d low?",
  "What changed since the last run?",
];
