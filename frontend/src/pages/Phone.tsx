import { useRef, useState } from "react";
import { useApp } from "../appContext";
import { AreaChart } from "../components/AreaChart";
import { AskThread } from "../components/AskPanel";
import { AssetListRow, ChangeList, HoldingsEmpty, HoldingTile } from "../components/Pieces";
import { fmtJakarta, fmtJakartaTime, fmtPctOrDash, fmtRp } from "../format";
import { latestRunTime, OVERVIEW_CHIPS } from "../model";
import { changeColor } from "../signal";
import { groupLabel, groupShort } from "../useMarket";
import { useChanges, usePortfolio } from "../usePortfolio";
import { go, type Route } from "../useRoute";
import { AssetDetail } from "./AssetDetail";

type Tab = "home" | "assets" | "ask";
const TABS: [Tab, string, string][] = [
  ["home", "Home", "ph-house"],
  ["assets", "Assets", "ph-list-bullets"],
  ["ask", "Ask", "ph-sparkle"],
];

export function Phone({ route }: { route: Route }) {
  // Which tab a detail screen was opened from, for Back and the tab highlight.
  const lastTab = useRef<Tab>("home");
  if (route.page === "home" || route.page === "assets" || route.page === "ask") lastTab.current = route.page;
  const active = lastTab.current;

  return (
    <div className="phone">
      <div className="phone-body">
        {route.page === "asset" ? (
          <AssetDetail source={route.source} phone onBack={() => go(lastTab.current === "home" ? "/" : `/${lastTab.current}`)} />
        ) : route.page === "assets" ? (
          <PhoneAssets />
        ) : route.page === "ask" ? (
          <>
            <span className="phone-title">
              <i className="ph ph-sparkle" style={{ color: "var(--color-accent)" }} />
              Ask
            </span>
            <AskThread chips={OVERVIEW_CHIPS} phone />
          </>
        ) : (
          <PhoneHome />
        )}
      </div>
      <nav className="phone-tabs">
        {TABS.map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => go(k === "home" ? "/" : `/${k}`)}
            style={{ color: active === k ? "var(--color-accent)" : "var(--color-neutral-400)" }}
            aria-current={active === k ? "page" : undefined}
          >
            <i className={`ph ${icon}`} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function PhoneHome() {
  const { market, positions, held, openHoldings } = useApp();
  const pf = usePortfolio();
  const changes = useChanges();
  const [briefOpen, setBriefOpen] = useState(false);
  const updated = latestRunTime(market.runs);

  // Lead with a group that has narration; empty ones go behind the fold.
  const briefs = market.groups
    .map((g) => ({ g, run: market.runs[g]?.[0] }))
    .sort((a, b) => Number(!!b.run?.reasoning?.overview) - Number(!!a.run?.reasoning?.overview));
  const [lead, ...rest] = briefs;
  const nonWait = market.assets.filter((a) => a.stats && a.stats.signal !== "WAIT");
  const watch = nonWait.length ? nonWait : market.assets;
  const canCompare = Object.values(market.runs).some((r) => r.length >= 2);

  return (
    <>
      <div className="phone-header">
        <span className="phone-brand">
          <i className="ph ph-coins" style={{ color: "var(--color-accent)" }} />
          gold-notification
        </span>
        <span className="meta-text" style={{ fontSize: 11 }}>
          {updated ? fmtJakarta(updated) : ""}
        </span>
      </div>

      {positions.length === 0 ? (
        <HoldingsEmpty />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>My holdings</span>
            <span className="phone-total">{fmtRp(pf.total)}</span>
            <span style={{ fontSize: 13, color: changeColor(pf.d7) }}>{fmtPctOrDash(pf.d7)} · 7d</span>
          </div>
          {pf.series.length > 1 && <AreaChart values={pf.series} height={64} />}
        </>
      )}

      <div className="card phone-brief">
        <button className="phone-brief-toggle" onClick={() => setBriefOpen((o) => !o)} aria-expanded={briefOpen}>
          <span className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ph ph-sparkle" />
            Today's brief
          </span>
          <i className={`ph ${briefOpen ? "ph-caret-up" : "ph-caret-down"}`} style={{ color: "var(--color-neutral-400)" }} />
        </button>
        {lead && <BriefText g={lead.g} lead />}
        {briefOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rest.map(({ g }) => (
              <BriefText key={g} g={g} />
            ))}
            <span className="section-label" style={{ fontSize: 10, marginTop: 4 }}>
              Since the previous run
            </span>
            {!canCompare ? (
              <span className="meta-text">No earlier run to compare yet.</span>
            ) : changes.length === 0 ? (
              <span className="meta-text">Nothing changed between the last two runs.</span>
            ) : (
              <ChangeList changes={changes} compact />
            )}
          </div>
        )}
        <span className="meta-text" style={{ fontSize: 11 }}>
          {briefOpen
            ? "Not financial advice — personal reference only."
            : `+${rest.length} group ${rest.length === 1 ? "summary" : "summaries"} · ${changes.length} change${changes.length === 1 ? "" : "s"} since last run`}
        </span>
      </div>

      {positions.length > 0 && (
        <>
          <div className="holding-strip">
            {positions.map((p) => (
              <HoldingTile key={p.holding.source} p={p} phone />
            ))}
          </div>
          <div style={{ marginTop: -6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={openHoldings}>
              <i className="ph ph-pencil-simple" />
              Edit holdings
            </button>
          </div>
        </>
      )}

      <div className="phone-section-head">
        <span style={{ fontWeight: 500 }}>Signals to watch</span>
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => go("/assets")}>
          See all
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {watch.map((a) => (
          <AssetListRow key={a.source} a={a} owned={held.has(a.source)} />
        ))}
      </div>
      {market.error && <div className="banner error">{market.error}</div>}

      <div className="phone-links">
        <a href="#/admin">Admin</a>
        <span>·</span>
        <a href="#/agent">Agent</a>
      </div>
    </>
  );
}

function BriefText({ g, lead }: { g: string; lead?: boolean }) {
  const { market } = useApp();
  const run = market.runs[g]?.[0];
  const text = run?.reasoning?.overview;
  const label = `${groupLabel(g)} · ${run ? fmtJakartaTime(run.created_at) : "no run yet"}`;
  if (!text) {
    return (
      <span style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>
        {label} — no narration yet.{" "}
        <button className="btn btn-ghost" style={{ fontSize: 13 }} disabled={market.narrating[g]} onClick={() => void market.narrate(g)}>
          {market.narrating[g] ? "Generating…" : "Generate"}
        </button>
      </span>
    );
  }
  if (lead) return <span style={{ fontSize: 14, lineHeight: 1.45 }}>{text}</span>;
  return (
    <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-300)" }}>
      <span className="meta-text">{label} — </span>
      {text}
    </span>
  );
}

function PhoneAssets() {
  const { market, held } = useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const group = picked && market.groups.includes(picked) ? picked : market.defaultGroup;
  return (
    <>
      <span className="phone-title">All assets</span>
      <div className="seg" style={{ display: "flex" }}>
        {market.groups.map((g) => (
          <label key={g} className="seg-opt" style={{ flex: 1, justifyContent: "center", padding: "7px 4px", fontSize: 12 }}>
            <input type="radio" name="grp-ph" checked={g === group} onChange={() => setPicked(g)} />
            {groupShort(g)}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {market.assets
          .filter((a) => a.group === group)
          .map((a) => (
            <AssetListRow key={a.source} a={a} owned={held.has(a.source)} />
          ))}
      </div>
    </>
  );
}
