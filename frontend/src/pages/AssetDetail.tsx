import { useState } from "react";
import { useApp } from "../appContext";
import { PriceArea } from "../components/PriceArea";
import { SignalTag } from "../components/SignalTag";
import { fmtJakarta, fmtJakartaTime, fmtPctOrDash, fmtRp, fmtRpSigned, ordinal } from "../format";
import { lastPointTime, narrationFor, priceStr } from "../model";
import { changeColor, SIG } from "../signal";
import { groupLabel } from "../useMarket";
import { go } from "../useRoute";
import { useSeries } from "../useSeries";

const RANGES = [7, 30, 90] as const;

export function AssetDetail({ source, phone, onBack }: { source: string; phone?: boolean; onBack: () => void }) {
  const { market, positions, openAsk } = useApp();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const points = useSeries(source, range, 300);

  const asset = market.bySource[source];
  const back = (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>
        <i className="ph ph-arrow-left" />
        {phone ? "Back" : "Overview"}
      </button>
    </div>
  );
  if (!asset) {
    return (
      <div className="detail">
        {back}
        <p className="text-muted">{market.meta ? `Unknown asset "${source}".` : "Loading…"}</p>
      </div>
    );
  }

  const stats = asset.stats;
  const name = asset.meta.display;
  const run = market.runs[asset.group]?.[0];
  const pos = positions.find((p) => p.holding.source === source);
  const last = lastPointTime(points);
  const reason =
    narrationFor(asset, run) ??
    (stats?.signal_reasons.length ? stats.signal_reasons.join("; ") : null) ??
    (asset.loading ? "Loading…" : "No price history yet — the signal appears once market-data has collected some.");

  const prevPct = run?.stats[source]?.pct_rank_30d;
  const statCards = [
    {
      label: "30d range",
      value: stats ? fmtRp(stats.min_30d) : "—",
      note: stats ? `to ${priceStr(asset, stats.max_30d)}` : "",
    },
    {
      label: "Percentile (30d)",
      value: stats?.pct_rank_30d != null ? ordinal(stats.pct_rank_30d) : "—",
      note:
        run && prevPct != null && prevPct !== stats?.pct_rank_30d
          ? `was ${ordinal(prevPct)} at ${fmtJakartaTime(run.created_at)}`
          : "",
    },
    {
      label: "vs 30d average",
      value: fmtPctOrDash(stats?.price_vs_avg30_pct),
      note: "",
    },
    {
      label: "RSI 14",
      value: stats?.rsi_14 != null ? stats.rsi_14.toFixed(1) : "—",
      note: "",
    },
  ];
  if (stats && stats.days_of_data < 7) statCards[0].note = `only ${stats.days_of_data} day(s) of data`;

  const askQuestion = stats ? `What's driving ${name}'s ${stats.signal} signal?` : `What's happening with ${name}?`;
  const d7 = stats?.pct_change_7d;

  const chart = (
    <PriceArea
      points={points}
      avg={stats?.avg_30d}
      height={phone ? 170 : 280}
      interactive={!phone}
      daysOfData={stats?.days_of_data}
      format={(v) => priceStr(asset, v)}
    />
  );
  const rangeSeg = (
    <div className="seg" style={phone ? { display: "flex" } : undefined}>
      {RANGES.map((r) => (
        <label key={r} className="seg-opt" style={phone ? { flex: 1, justifyContent: "center" } : undefined}>
          <input type="radio" name={phone ? "rng-ph" : "rng-web"} checked={range === r} onChange={() => setRange(r)} />
          {r}D
        </label>
      ))}
    </div>
  );
  const why = (
    <div className={phone ? "card" : "card elev-sm"} style={{ padding: phone ? 14 : 18, gap: phone ? 8 : 10 }}>
      <div className="card-kicker">{stats ? `Why ${stats.signal}` : "Signal"}</div>
      <p className="why-text" style={{ fontSize: phone ? 14 : 15 }}>
        {reason}
      </p>
    </div>
  );
  const votes = (
    <div className={phone ? "card" : "card elev-sm"} style={{ padding: phone ? 14 : 18, gap: phone ? 10 : 12 }}>
      <div className="card-kicker">Model votes</div>
      {stats ? (
        <div className={phone ? "vote-row vote-row-phone" : "vote-row"}>
          <span style={{ color: "var(--color-neutral-300)" }}>Rule signal</span>
          <span style={{ fontWeight: 500, color: SIG[stats.signal].fg }}>{stats.signal}</span>
          {!phone && (
            <div className="vote-bar">
              <div style={{ width: "100%", background: SIG[stats.signal].fg }} />
            </div>
          )}
          <span className="vote-conf">rule</span>
        </div>
      ) : (
        <span className="meta-text">No rule signal yet.</span>
      )}
      <span className="meta-text">No ML models run for this group yet.</span>
    </div>
  );
  const position = pos && (
    <div className={phone ? "card" : "card elev-sm"} style={{ padding: phone ? 14 : 18, gap: phone ? 4 : 8 }}>
      <div className="card-kicker">My position</div>
      <span style={{ fontSize: phone ? 20 : 24, fontWeight: 500 }}>{pos.value == null ? "—" : fmtRp(pos.value)}</span>
      <span style={{ fontSize: phone ? 12 : 13, color: "var(--color-neutral-300)" }}>
        {pos.qtyStr} · avg {fmtRp(pos.holding.avg)}
        {asset.meta.unit_suffix}
      </span>
      {pos.pl != null && (
        <span style={{ fontSize: phone ? 13 : 14, color: changeColor(pos.pl) }}>{fmtRpSigned(pos.pl)} unrealised</span>
      )}
    </div>
  );

  if (phone) {
    return (
      <>
        {back}
        <div className="phone-detail-head">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{name}</span>
            <span className="phone-big">{priceStr(asset)}</span>
            <span style={{ fontSize: 13, color: changeColor(d7) }}>{fmtPctOrDash(d7)} · 7d</span>
          </div>
          <SignalTag signal={stats?.signal} loading={asset.loading} size="md" />
        </div>
        {rangeSeg}
        {chart}
        <div className="stat-grid-phone">
          {statCards.map((s) => (
            <div key={s.label} className="card" style={{ padding: "10px 12px", gap: 0 }}>
              <span className="stat-label" style={{ fontSize: 10 }}>
                {s.label}
              </span>
              <span style={{ fontSize: 17, fontWeight: 500 }}>{s.value}</span>
            </div>
          ))}
        </div>
        {why}
        {votes}
        {position}
        <button className="btn btn-primary" onClick={() => openAsk(askQuestion)}>
          <i className="ph ph-sparkle" />
          Ask about {name}
        </button>
      </>
    );
  }

  return (
    <div className="detail">
      {back}
      <div className="detail-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0 }}>{name}</h3>
            <button className="tag tag-neutral tag-btn" onClick={() => go("/")}>
              {groupLabel(asset.group)}
            </button>
            {pos && <span className="tag tag-accent">Owned</span>}
          </div>
          <div className="pf-value-row">
            <span className="detail-price">{priceStr(asset)}</span>
            <span style={{ fontSize: 15, color: changeColor(d7) }}>{fmtPctOrDash(d7)} · 7d</span>
          </div>
          <span className="meta-text">
            Live rule signal{last ? ` · last price ${fmtJakarta(last)}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => openAsk(askQuestion)}>
            <i className="ph ph-sparkle" />
            Ask about {name}
          </button>
          <SignalTag signal={stats?.signal} loading={asset.loading} size="lg" />
        </div>
      </div>

      <div className="card elev-sm" style={{ padding: "16px 18px", gap: 10 }}>
        <div className="chart-head">
          {rangeSeg}
          {stats && (
            <span className="avg-legend">
              <span />
              30d average
            </span>
          )}
        </div>
        {chart}
      </div>

      <div className="stat-grid">
        {statCards.map((s) => (
          <div key={s.label} className="card elev-sm" style={{ padding: "12px 14px", gap: 2 }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value">{s.value}</span>
            <span className="meta-text">{s.note}</span>
          </div>
        ))}
      </div>

      <div className="detail-cards">
        {why}
        {votes}
        {position}
      </div>
    </div>
  );
}
