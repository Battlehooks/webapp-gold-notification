/**
 * Decides when to push. Three kinds of alert, each opted into per device:
 *
 *  - Take-profit / stop-loss: a holding's P/L, measured at the *buyback*
 *    price (what you'd actually get selling) against your average cost,
 *    crosses +takeProfitPct or -stopLossPct. Fires once per crossing, then
 *    re-arms only after the P/L comes back 1 point inside the threshold, so
 *    a price hovering right at the line doesn't buzz every minute.
 *  - Signal change: a source's rule signal (BUY/SELL/WAIT) differs from the
 *    last one seen.
 *  - Sudden move: sent from scheduler.ts when Market Data reports a +-5%
 *    hourly move (alongside the narration it already triggers).
 */
import * as db from "./db.js";
import * as marketData from "./marketDataClient.js";
import * as push from "./push.js";

const REARM_POINTS = 1;
const GROUPS = ["crypto", "gold"];

let meta: marketData.SourcesResponse["sources"] = {};
let metaAt = 0;

/** Display names / units from Market Data, refreshed hourly. */
async function sourceMeta() {
  if (Date.now() - metaAt > 3_600_000) {
    try {
      meta = (await marketData.getSources()).sources;
      metaAt = Date.now();
    } catch (err) {
      console.error("could not load source names from market-data", err);
    }
  }
  return meta;
}

export const display = (source: string) => meta[source]?.display ?? source.toUpperCase();
export const assetUrl = (source: string) => `#/asset/${encodeURIComponent(source)}`;

const rp = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");
const pctStr = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

/** Every minute: take-profit / stop-loss for every device's holdings. */
export async function checkPositions(): Promise<void> {
  if (!push.pushEnabled) return;
  const devices = (await db.listDevices()).filter(
    (d) => d.holdings.length > 0 && (d.rules.takeProfitPct != null || d.rules.stopLossPct != null)
  );
  if (devices.length === 0) return;
  const latest = await marketData.getLatest();
  await sourceMeta();

  for (const device of devices) {
    const state = { ...device.state };
    let changed = false;
    for (const h of device.holdings) {
      const p = latest[h.source];
      if (!p || !(h.avg > 0)) continue;
      const price = p.buyback > 0 ? p.buyback : p.sell;
      const pct = ((price - h.avg) / h.avg) * 100;
      const unit = meta[h.source]?.unit_suffix ?? ""; // "/g" for gold, "" for coins
      const amount = unit ? `${h.qty} ${unit.replace("/", "")}` : `${h.qty} ${display(h.source)}`;
      const detail =
        `Now ${pctStr(pct)} at the buyback price ${rp(price)}${unit} (your average ${rp(h.avg)}${unit}). ` +
        `Your ${amount} is worth ${rp(h.qty * price)}.`;

      const tp = device.rules.takeProfitPct;
      const tpKey = `tp:${h.source}`;
      if (tp != null) {
        if (!state[tpKey] && pct >= tp) {
          const ok = await push.send(device, {
            title: `${display(h.source)} hit your +${tp}% take-profit`,
            body: detail,
            url: assetUrl(h.source),
            tag: tpKey,
          });
          if (ok) {
            state[tpKey] = true;
            changed = true;
          }
        } else if (state[tpKey] && pct < tp - REARM_POINTS) {
          state[tpKey] = false;
          changed = true;
        }
      }

      const sl = device.rules.stopLossPct;
      const slKey = `sl:${h.source}`;
      if (sl != null) {
        if (!state[slKey] && pct <= -sl) {
          const ok = await push.send(device, {
            title: `${display(h.source)} hit your −${sl}% stop-loss`,
            body: detail,
            url: assetUrl(h.source),
            tag: slKey,
          });
          if (ok) {
            state[slKey] = true;
            changed = true;
          }
        } else if (state[slKey] && pct > -sl + REARM_POINTS) {
          state[slKey] = false;
          changed = true;
        }
      }
    }
    if (changed) await db.saveDeviceState(device.deviceId, state);
  }
}

/** Every 5 minutes: push when a source's BUY/SELL/WAIT signal flips. The
 * first time a source is seen its signal is only recorded, not announced. */
export async function checkSignals(): Promise<void> {
  await sourceMeta();
  for (const group of GROUPS) {
    const signals = await marketData.getGroupSignals(group);
    for (const [source, s] of Object.entries(signals)) {
      const key = `signal:${source}`;
      const previous = await db.getState(key);
      if (previous === s.signal) continue;
      await db.setState(key, s.signal);
      if (!previous) continue;
      const sent = await push.broadcast((d) => d.rules.signalChanges, {
        title: `${display(source)} signal: ${previous} → ${s.signal}`,
        body: s.signal_reasons[0] ?? "Open the app for the reasoning.",
        url: assetUrl(source),
        tag: `signal:${source}`,
        ttlSec: 6 * 3600,
      });
      console.log(`signal ${source} ${previous} -> ${s.signal}, pushed to ${sent} device(s)`);
    }
  }
}

/** Called by the scheduler after it detects a sudden move. */
export async function pushSuddenMove(source: string, pct: number, windowMin: number, why: string | null): Promise<void> {
  await sourceMeta();
  const arrow = pct > 0 ? "▲" : "▼";
  const sent = await push.broadcast((d) => d.rules.suddenMoves, {
    title: `${display(source)} ${arrow} ${Math.abs(pct).toFixed(1)}% in ${windowMin} min`,
    body: why ?? "Sudden move -- open the app for the latest analysis.",
    url: assetUrl(source),
    tag: `sudden:${source}`,
  });
  console.log(`sudden move ${source} ${pct}%, pushed to ${sent} device(s)`);
}
