import { useState } from "react";
import { useApp } from "../appContext";
import { AreaChart } from "../components/AreaChart";
import { ChangeList, HoldingsEmpty, HoldingTile } from "../components/Pieces";
import { SignalTag } from "../components/SignalTag";
import { Sparkline } from "../components/Sparkline";
import { fmtJakarta, fmtJakartaDate, fmtJakartaTime, fmtPctOrDash, fmtRp } from "../format";
import { lastPointTime, priceStr, sinceLabel } from "../model";
import { changeColor } from "../signal";
import { groupLabel, type Asset } from "../useMarket";
import { useChanges, usePortfolio } from "../usePortfolio";
import { assetPath, go } from "../useRoute";
import { useSeries } from "../useSeries";

export function Overview() {
  return (
    <>
      <div className="overview-grid">
        <HoldingsCard />
        <BriefCard />
      </div>
      <AssetTable />
    </>
  );
}

function HoldingsCard() {
  const { positions, openHoldings } = useApp();
  const pf = usePortfolio();

  return (
    <div className="card elev-sm ov-card">
      <div className="card-head">
        <div className="card-kicker">My holdings</div>
        {positions.length > 0 && (
          <button className="btn btn-ghost card-head-btn" onClick={openHoldings}>
            <i className="ph ph-pencil-simple" />
            Edit
          </button>
        )}
      </div>
      {positions.length === 0 ? (
        <HoldingsEmpty />
      ) : (
        <>
          <div className="pf-value-row">
            <span className="pf-value">{fmtRp(pf.total)}</span>
            <span style={{ fontSize: 14, color: changeColor(pf.d7) }}>{fmtPctOrDash(pf.d7)} · 7d</span>
          </div>
          {pf.series.length > 1 ? (
            <>
              <AreaChart values={pf.series} height={110} />
              <div className="pf-caption">{sinceLabel(pf.since)}</div>
            </>
          ) : (
            <div className="pf-caption">Chart appears once price history loads.</div>
          )}
          <div className="holding-grid">
            {positions.map((p) => (
              <HoldingTile key={p.holding.source} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BriefCard() {
  const { market, openAsk } = useApp();
  const changes = useChanges();
  const canCompare = Object.values(market.runs).some((r) => r.length >= 2);
  const runsLoaded = market.groups.length > 0 && market.groups.every((g) => market.runs[g]);

  return (
    <div className="card elev-sm ov-card brief-card">
      <div className="card-head">
        <span className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ph ph-sparkle" />
          Today's brief
        </span>
        <span className="meta-text">{fmtJakartaDate(new Date())}</span>
      </div>
      <div className="brief-rows">
        {market.groups.map((g) => {
          const run = market.runs[g]?.[0];
          const text = run?.reasoning?.overview;
          return (
            <div key={g} className="brief-row">
              <span className="brief-label">
                {groupLabel(g)}
                <br />
                {run ? fmtJakartaTime(run.created_at) : market.runs[g] ? "no run yet" : ""}
              </span>
              {text ? (
                <span className="brief-text">{text}</span>
              ) : !market.runs[g] ? (
                <span className="brief-text brief-missing">Loading…</span>
              ) : (
                <span className="brief-text brief-missing">
                  No narration yet.{" "}
                  <button className="btn btn-ghost" disabled={market.narrating[g]} onClick={() => void market.narrate(g)}>
                    {market.narrating[g] ? "Generating…" : "Generate"}
                  </button>
                </span>
              )}
            </div>
          );
        })}
        {market.groups.length === 0 && (
          <span className="text-muted">{market.error ? "Market data unavailable." : "Loading…"}</span>
        )}
      </div>
      <div className="hr" style={{ margin: 0 }} />
      <div className="section-label">Since the previous run</div>
      {!runsLoaded ? (
        <span className="meta-text">{market.error && market.groups.length === 0 ? "—" : "Loading…"}</span>
      ) : !canCompare ? (
        <span className="meta-text">No earlier run to compare yet.</span>
      ) : changes.length === 0 ? (
        <span className="meta-text">Nothing changed between the last two runs.</span>
      ) : (
        <ChangeList changes={changes} />
      )}
      <div className="brief-foot">
        <span className="meta-text">Not financial advice — personal reference only.</span>
        <button className="btn btn-ghost" onClick={() => openAsk()}>
          Ask a follow-up
          <i className="ph ph-arrow-right" />
        </button>
      </div>
    </div>
  );
}

function AssetTable() {
  const { market, held } = useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const group = picked && market.groups.includes(picked) ? picked : market.defaultGroup;
  const list = market.assets.filter((a) => a.group === group);

  return (
    <>
      <div className="section-head">
        <h4>All assets</h4>
        <div className="seg">
          {market.groups.map((g) => (
            <label key={g} className="seg-opt">
              <input type="radio" name="grp-web" checked={g === group} onChange={() => setPicked(g)} />
              {groupLabel(g)} <span className="meta-text">{market.assets.filter((a) => a.group === g).length}</span>
            </label>
          ))}
        </div>
      </div>
      {market.error && <div className="banner error">{market.error}</div>}
      <table className="table asset-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Price</th>
            <th className="num">7d</th>
            <th>30d</th>
            <th>Signal</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <AssetRow key={a.source} a={a} owned={held.has(a.source)} />
          ))}
        </tbody>
      </table>
    </>
  );
}

function AssetRow({ a, owned }: { a: Asset; owned: boolean }) {
  const points = useSeries(a.source, 30, 60);
  const last = lastPointTime(points);
  const d7 = a.stats?.pct_change_7d;
  return (
    <tr onClick={() => go(assetPath(a.source))} style={{ cursor: "pointer" }}>
      <td style={{ padding: "10px 6px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href={`#${assetPath(a.source)}`}
            className="asset-link"
            onClick={(e) => e.stopPropagation()}
          >
            {a.meta.display}
          </a>
          {owned && (
            <span className="tag tag-accent" style={{ padding: "1px 7px", fontSize: 10 }}>
              Owned
            </span>
          )}
        </span>
      </td>
      <td className="num">{priceStr(a)}</td>
      <td className="num" style={{ color: changeColor(d7) }}>
        {fmtPctOrDash(d7)}
      </td>
      <td>
        <Sparkline values={points?.map((p) => p.sell)} />
      </td>
      <td>
        <SignalTag signal={a.stats?.signal} loading={a.loading} />
      </td>
      <td className="meta-text">{last ? fmtJakarta(last) : "—"}</td>
    </tr>
  );
}
