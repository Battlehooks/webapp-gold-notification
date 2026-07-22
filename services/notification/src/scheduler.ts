/**
 * Drives the routine narration broadcast and the sudden-move override, by
 * calling Market Data + Insight over HTTP and pushing the result via
 * Telegram. Ported from the root project's trend_summary.py cron
 * entrypoints (--group crypto every 4h, --group gold daily,
 * --check-sudden-move every 5 min), now run in-process via node-cron
 * instead of relying on host cron.
 */
import cron from "node-cron";
import { config } from "./config.js";
import * as db from "./db.js";
import * as insight from "./insightClient.js";
import * as marketData from "./marketDataClient.js";
import { broadcastMessage, recipients } from "./telegramBot.js";

const SUDDEN_MOVE_STATE_KEY = "sudden_move_crypto_last_sent";

async function runNarrationBroadcast(group: string, banner?: string): Promise<void> {
  try {
    const result = await insight.narrate(group, banner);
    const parts: string[] = [];
    if (banner) parts.push(banner);
    parts.push(`\u{1F4C8} ${result.title}`);
    parts.push(result.summary_text);
    parts.push("Not financial advice -- personal reference only.");
    await broadcastMessage(parts.join("\n\n"), recipients());
  } catch (err) {
    console.error(`narration broadcast failed for group=${group}`, err);
  }
}

async function checkSuddenMove(): Promise<void> {
  let check;
  try {
    check = await marketData.getSuddenMoveCheck();
  } catch (err) {
    console.error("sudden-move check failed", err);
    return;
  }
  if (!check.move) return;

  const lastSent = db.getState(SUDDEN_MOVE_STATE_KEY);
  if (lastSent) {
    const elapsedMin = (Date.now() - new Date(lastSent.replace(" ", "T") + "Z").getTime()) / 60000;
    if (elapsedMin < config.suddenMoveCooldownMin) return;
  }

  const { source, pct } = check.move;
  const arrow = pct > 0 ? "▲" : "▼";
  let banner = `\u{1F6A8} Sudden move alert -- ${source.toUpperCase()} ${arrow} ${Math.abs(pct).toFixed(1)}% in the last ${check.window_min} min`;
  const why = await insight.whyMoved(source.toUpperCase(), pct).catch(() => null);
  if (why) banner += `\n${why}`;

  await runNarrationBroadcast("crypto", banner);
  db.setState(SUDDEN_MOVE_STATE_KEY, new Date().toISOString().slice(0, 19).replace("T", " "));
}

export function start(): void {
  cron.schedule("0 */4 * * *", () => void runNarrationBroadcast("crypto"));
  cron.schedule("30 23 * * *", () => void runNarrationBroadcast("gold"));
  cron.schedule("*/5 * * * *", () => void checkSuddenMove());
  console.log("scheduler started: crypto=every 4h, gold=daily@23:30 UTC, sudden-move-check=every 5 min");
}

export const _internal = { runNarrationBroadcast, checkSuddenMove };
