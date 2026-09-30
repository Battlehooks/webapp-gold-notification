import { useEffect, useState } from "react";
import { useApp } from "../appContext";
import { holdingUnit, saveHoldings, type Holding } from "../holdings";
import { groupLabel } from "../useMarket";

interface Row {
  source: string;
  qty: string;
  avg: string;
}

export function HoldingsDialog({ onClose }: { onClose: () => void }) {
  const { holdings, market } = useApp();
  const [rows, setRows] = useState<Row[]>(() =>
    holdings.map((h) => ({ source: h.source, qty: String(h.qty), avg: String(h.avg) }))
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const firstFree = market.assets.find((a) => !rows.some((r) => r.source === a.source))?.source;
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    const next: Holding[] = [];
    for (const r of rows) {
      const qty = Number(r.qty.replace(",", "."));
      // Whole rupiah; "2.380.000" (id-ID grouping) and "2380000" both parse.
      const avg = Math.round(Number(r.avg.replace(/[.\s]/g, "").replace(",", ".")));
      const name = market.bySource[r.source]?.meta.display ?? r.source;
      if (!(qty > 0)) return setError(`${name}: quantity must be a positive number.`);
      if (!(avg >= 0) || r.avg.trim() === "") return setError(`${name}: average cost must be a number (IDR per unit).`);
      if (next.some((h) => h.source === r.source)) return setError(`${name} is listed twice — combine them into one row.`);
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
          Stored only in this browser. They're sent along with your Ask questions so answers can refer to your
          position; nothing else reads them.
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

        {firstFree && (
          <div>
            <button className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { source: firstFree, qty: "", avg: "" }])}>
              <i className="ph ph-plus" />
              Add asset
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
