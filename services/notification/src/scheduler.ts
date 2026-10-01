/**
 * The service's clock. Two jobs:
 *
 *  - Narration: has Insight write the routine AI analysis the dashboard
 *    shows (crypto every 4h, gold daily) -- ported from the root project's
 *    trend_summary.py cron entrypoints, now in-process via node-cron.
 *  - Alerts (alerts.ts): holdings P/L every minute, signal flips and sudden
 *    moves every 5 minutes, delivered as Web Push to every browser that
 *    turned alerts on.
 *
 * Every job catches its own errors: an unhandled rejection would take the
 * whole process down.
 */
import cron from "node-cron";
import * as alerts from "./alerts.js";
import { config } from "./config.js";
import * as db from "./db.js";
import * as insight from "./insightClient.js";
import * as marketData from "./marketDataClient.js";

const SUDDEN_MOVE_STATE_KEY = "sudden_move_crypto_last_sent";

async function runNarration(group: string, banner?: string): Promise<void> {
  const result = await insight.narrate(group, banner);
  console.log(`narration stored for group=${group}: ${result.title}`);
}

async function checkSuddenMove(): Promise<void> {
  const check = await marketData.getSuddenMoveCheck();
  if (!check.move) return;

  const lastSent = await db.getState(SUDDEN_MOVE_STATE_KEY);
  if (lastSent) {
    const elapsedMin = (Date.now() - new Date(lastSent.replace(" ", "T") + "Z").getTime()) / 60000;
    if (elapsedMin < config.suddenMoveCooldownMin) return;
  }

  const { source, pct } = check.move;
  const arrow = pct > 0 ? "▲" : "▼";
  const why = await insight.whyMoved(source.toUpperCase(), pct).catch(() => null);
  let banner = `\u{1F6A8} Sudden move alert -- ${source.toUpperCase()} ${arrow} ${Math.abs(pct).toFixed(1)}% in the last ${check.window_min} min`;
  if (why) banner += `\n${why}`;

  // Cooldown first: a failing narration or push must not re-fire every 5 min.
  await db.setState(SUDDEN_MOVE_STATE_KEY, new Date().toISOString().slice(0, 19).replace("T", " "));
  await alerts.pushSuddenMove(source, pct, check.window_min, why);
  await runNarration("crypto", banner).catch((err) => console.error("sudden-move narration failed", err));
}

function every(expr: string, name: string, job: () => Promise<void>): void {
  cron.schedule(expr, () => {
    job().catch((err) => console.error(`${name} failed`, err));
  });
}

export function start(): void {
  every("0 */4 * * *", "crypto narration", () => runNarration("crypto"));
  every("30 23 * * *", "gold narration", () => runNarration("gold"));
  every("*/5 * * * *", "sudden-move check", checkSuddenMove);
  every("*/5 * * * *", "signal check", alerts.checkSignals);
  every("* * * * *", "holdings check", alerts.checkPositions);
  console.log(
    "scheduler started: narration crypto=4h gold=daily@23:30 UTC; alerts holdings=1min signals+sudden-move=5min"
  );
}

export const _internal = { runNarration, checkSuddenMove };
