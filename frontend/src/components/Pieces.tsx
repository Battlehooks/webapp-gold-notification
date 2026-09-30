// Small presentational pieces shared by the web and phone layouts.
import { useApp } from "../appContext";
import { fmtPctOrDash, fmtRp, fmtRpSigned } from "../format";
import { priceStr, type Change, type Position } from "../model";
import { changeColor } from "../signal";
import type { Asset } from "../useMarket";
import { assetPath, go } from "../useRoute";
import { SignalTag } from "./SignalTag";

export function HoldingTile({ p, phone }: { p: Position; phone?: boolean }) {
  return (
    <button className={phone ? "holding-tile holding-tile-phone" : "holding-tile"} onClick={() => go(assetPath(p.asset.source))}>
      <span className="holding-tile-head">
        <span className="holding-tile-name">{p.asset.meta.display}</span>
        <SignalTag signal={p.asset.stats?.signal} loading={p.asset.loading} size="xs" />
      </span>
      <span className="holding-tile-qty">{p.qtyStr}</span>
      <span className="holding-tile-value">{p.value == null ? "—" : fmtRp(p.value)}</span>
      <span className="holding-tile-pl" style={{ color: changeColor(p.pl) }}>
        {p.pl == null ? "no price yet" : fmtRpSigned(p.pl)}
      </span>
    </button>
  );
}

export function HoldingsEmpty() {
  const { openHoldings } = useApp();
  return (
    <div className="holdings-empty">
      <i className="ph ph-wallet" />
      <span>Add what you hold to see its value, 7-day change and unrealised P/L here.</span>
      <button className="btn btn-primary" onClick={openHoldings}>
        <i className="ph ph-plus" />
        Add holdings
      </button>
    </div>
  );
}

export function ChangeList({ changes, compact }: { changes: Change[]; compact?: boolean }) {
  return (
    <div className={compact ? "change-list change-list-compact" : "change-list"}>
      {changes.map((c, i) => (
        <div key={i} className="change-item">
          <i className={`ph ${c.icon}`} />
          <span>
            <b>{c.name}</b> <span className="change-text">{c.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Phone list row: name/price · 7d · signal. */
export function AssetListRow({ a, owned }: { a: Asset; owned?: boolean }) {
  const d7 = a.stats?.pct_change_7d;
  return (
    <button className="asset-list-row" onClick={() => go(assetPath(a.source))}>
      <span className="asset-list-main">
        <span className="asset-list-name">
          {a.meta.display}
          {owned && <i className="ph-fill ph-star" style={{ color: "var(--color-accent)", fontSize: 11 }} />}
        </span>
        <span className="asset-list-price">{priceStr(a)}</span>
      </span>
      <span style={{ fontSize: 13, color: changeColor(d7) }}>{fmtPctOrDash(d7)}</span>
      <SignalTag signal={a.stats?.signal} loading={a.loading} />
    </button>
  );
}
