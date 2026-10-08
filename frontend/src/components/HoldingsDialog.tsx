import { useEffect, useState } from "react";
import { useApp } from "../appContext";
import { fmtRp } from "../format";
import { holdingUnit, saveHoldings, useHoldingLots, type Holding } from "../holdings";
import { groupLabel } from "../useMarket";

interface Row {
  source: string;
  qty: string;
  avg: string;
}

const parseQty = (s: string) => Number(s.replace(",", "."));
// Whole rupiah; "2.380.000" (id-ID grouping) and "2380000" both parse.
const parseAvg = (s: string) => (s.trim() === "" ? NaN : Math.round(Number(s.replace(/[.\s]/g, "").replace(",", "."))));

export function HoldingsDialog({ onClose }: { onClose: () => void }) {
  const { market } = useApp();
  // Rows are purchases: the same asset may be listed more than once at different
  // costs, and the rest of the app sees them merged (see holdings.ts).
  const lots = useHoldingLots();
  const [rows, setRows] = useState<Row[]>(() =>
    lots.map((h) => ({ source: h.source, qty: String(h.qty), avg: String(h.avg) }))
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nextSource = (market.assets.find((a) => !rows.some((r) => r.source === a.source)) ?? market.assets[0])?.source;
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    const next: Holding[] = [];
    for (const r of rows) {
      const qty = parseQty(r.qty);
      const avg = parseAvg(r.avg);
      const name = market.bySource[r.source]?.meta.display ?? r.source;
      if (!(qty > 0)) return setError(`${name}: quantity must be a positive number.`);
      if (!(avg >= 0)) return setError(`${name}: average cost must be a number (IDR per unit).`);
      next.push({ source: r.source, qty, avg });
    }
    saveHoldings(next);
    onClose();
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog holdings-dialog" role="dialog" aria-modal="true" aria-labelledby="hd-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title" id="hd-title">
          My holdings
        </div>
        <div className="dialog-body">
          Stored in this browser. They're sent along with your Ask questions so answers can refer to your
          position, and kept by the server only while price alerts are on.
        </div>

        {rows.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>No holdings yet.</div>}
        {rows.map((r, i) => {
          const unit = holdingUnit(market.bySource[r.source]?.meta);
          return (
            <div key={i} className="holding-row">
              <div className="field">
                <label htmlFor={`hd-src-${i}`}>Asset</label>
                <select id={`hd-src-${i}`} className="input" value={r.source} onChange={(e) => update(i, { source: e.target.value })}>
                  {market.groups.map((g) => (
                    <optgroup key={g} label={groupLabel(g)}>
                      {market.assets
                        .filter((a) => a.group === g)
                        .map((a) => (
                          <option key={a.source} value={a.source}>
                            {a.meta.display}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`hd-qty-${i}`}>Quantity ({unit})</label>
                <input id={`hd-qty-${i}`} className="input" inputMode="decimal" value={r.qty} onChange={(e) => update(i, { qty: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`hd-avg-${i}`}>Avg cost (Rp/{unit})</label>
                <input id={`hd-avg-${i}`} className="input" inputMode="numeric" value={r.avg} onChange={(e) => update(i, { avg: e.target.value })} />
              </div>
              <button
                className="btn btn-secondary btn-icon holding-remove"
                aria-label="Remove"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <i className="ph ph-trash" />
              </button>
            </div>
          );
        })}

        {combined(rows).map(({ source, qty, avg }) => {
          const meta = market.bySource[source]?.meta;
          const unit = holdingUnit(meta);
          return (
            <div key={source} className="text-muted" style={{ fontSize: 13 }}>
              {meta?.display ?? source} combined: {qty.toLocaleString("id-ID", { maximumFractionDigits: 8 })} {unit} at an
              average of {fmtRp(avg)}/{unit}
            </div>
          );
        })}

        {nextSource && (
          <div>
            <button className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { source: nextSource, qty: "", avg: "" }])}>
              <i className="ph ph-plus" />
              Add purchase
            </button>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Assets listed on more than one row, merged the way the rest of the app sees
 * them. Skipped while any of that asset's rows doesn't parse yet. */
function combined(rows: Row[]): Holding[] {
  const out: Holding[] = [];
  for (const source of new Set(rows.map((r) => r.source))) {
    const mine = rows.filter((r) => r.source === source).map((r) => ({ qty: parseQty(r.qty), avg: parseAvg(r.avg) }));
    if (mine.length < 2 || mine.some((l) => !(l.qty > 0) || !(l.avg >= 0))) continue;
    const qty = mine.reduce((t, l) => t + l.qty, 0);
    out.push({ source, qty, avg: mine.reduce((t, l) => t + l.qty * l.avg, 0) / qty });
  }
  return out;
}
