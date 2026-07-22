import type { SignalStats, SourceMeta } from "../api";
import { fmtPct, fmtRp } from "../format";
import { PriceChart } from "./PriceChart";
import { SignalBadge } from "./SignalBadge";

const CHART_COLORS: Record<string, string> = {
  pegadaian: "#00754a",
  treasury: "#b8860b",
  btc: "#f7931a",
  eth: "#627eea",
  sol: "#9945ff",
};

export function AssetCard({
  source,
  meta,
  stats,
  reasoning,
}: {
  source: string;
  meta: SourceMeta;
  stats: SignalStats;
  reasoning?: string;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h3>{meta.display}</h3>
        <SignalBadge signal={stats.signal} />
      </div>
      <div className="card-price">
        {fmtRp(stats.latest_sell_idr)}
        {meta.unit_suffix}
      </div>
      <div className="card-delta">
        7d: {fmtPct(stats.pct_change_7d)} &middot; 30d: {fmtPct(stats.pct_change_30d)}
      </div>
      <PriceChart source={source} color={CHART_COLORS[source] ?? "#888"} />
      <p className="card-reason">
        {reasoning || stats.signal_reasons.join("; ")}
      </p>
    </div>
  );
}
