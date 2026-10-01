import { useEffect, useState } from "react";
import { disableAlerts, enableAlerts, sendTestAlert, useAlerts } from "../alerts";
import type { AlertRules } from "../api";
import { useApp } from "../appContext";

/** "" -> null (that alert off); otherwise a positive number or NaN. */
const parsePct = (s: string): number | null => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function AlertsDialog({ onClose }: { onClose: () => void }) {
  const { holdings } = useApp();
  const { status, rules } = useAlerts();
  const [takeProfit, setTakeProfit] = useState(rules.takeProfitPct == null ? "" : String(rules.takeProfitPct));
  const [stopLoss, setStopLoss] = useState(rules.stopLossPct == null ? "" : String(rules.stopLossPct));
  const [signalChanges, setSignalChanges] = useState(rules.signalChanges);
  const [suddenMoves, setSuddenMoves] = useState(rules.suddenMoves);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: () => Promise<void>, done: string | null, close = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (close) onClose();
      else setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const tp = parsePct(takeProfit);
    const sl = parsePct(stopLoss);
    if (tp != null && !(tp > 0 && tp <= 1000)) return setError("Take-profit must be a percentage between 0 and 1000, or empty.");
    if (sl != null && !(sl > 0 && sl < 100)) return setError("Stop-loss must be a percentage between 0 and 100, or empty.");
    const next: AlertRules = { takeProfitPct: tp, stopLossPct: sl, signalChanges, suddenMoves };
    // Saving while on closes the dialog; turning on keeps it open so "Send test" is right there.
    void run(() => enableAlerts(holdings, next), "Alerts are on — try “Send test”.", status === "on");
  }

  const on = status === "on";
  const canUse = status !== "unsupported";

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog alerts-dialog" role="dialog" aria-modal="true" aria-labelledby="al-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title" id="al-title">
          Price alerts {on && <span className="alerts-on">· on</span>}
        </div>
        <div className="dialog-body">
          Desktop notifications from this browser — they arrive even with the web app closed.
        </div>

        {status === "unsupported" && (
          <div className="banner error">
            This page can't receive push notifications. It needs HTTPS (or localhost) and a browser with Web Push —
            on iPhone, add the app to your home screen first.
          </div>
        )}
        {status === "blocked" && (
          <div className="banner error">
            Notifications are blocked for this site. Allow them in the browser's site settings (the icon left of the
            address), then turn alerts on.
          </div>
        )}

        <fieldset className="alerts-fields" disabled={!canUse || busy}>
          <div className="alert-thresholds">
            <div className="field">
              <label htmlFor="al-tp">Take-profit at (+%)</label>
              <input id="al-tp" className="input" inputMode="decimal" placeholder="off" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="al-sl">Stop-loss at (−%)</label>
              <input id="al-sl" className="input" inputMode="decimal" placeholder="off" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
            </div>
          </div>
          <div className="form-note">
            {holdings.length === 0
              ? "Add holdings first — profit and loss are measured against your average cost."
              : `Checked every minute for your ${holdings.length} holding${holdings.length === 1 ? "" : "s"}, at the buyback price (what you'd get selling). Leave a box empty to turn that alert off.`}
          </div>

          <label className="check">
            <input type="checkbox" checked={signalChanges} onChange={(e) => setSignalChanges(e.target.checked)} />
            <span>
              Signal changes
              <small>When an asset's BUY / SELL / WAIT signal flips.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={suddenMoves} onChange={(e) => setSuddenMoves(e.target.checked)} />
            <span>
              Sudden moves
              <small>When BTC, ETH or SOL moves 5% or more within an hour.</small>
            </span>
          </label>
        </fieldset>

        <div className="form-note">
          While alerts are on, your holdings are also kept by the server so it can check them. Turning alerts off
          deletes them there.
        </div>
        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-ok">{notice}</div>}

        <div className="dialog-actions">
          {on ? (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void run(disableAlerts, null, true)}>
                Turn off
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void run(sendTestAlert, "Test sent — it should pop up in a few seconds.")}
              >
                Send test
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>
                Save
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!canUse || busy} onClick={save}>
                <i className="ph ph-bell-ringing" />
                Turn on alerts
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
