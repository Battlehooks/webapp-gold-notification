/** Thin HTTP client for the Market Data Service -- same service-boundary
 * rule as Insight's client: never touch its database, only its API. */
import { config } from "./config.js";

export interface SuddenMoveCheck {
  move: { source: string; pct: number } | null;
  window_min: number;
  threshold_pct: number;
}

export async function getSuddenMoveCheck(): Promise<SuddenMoveCheck> {
  const res = await fetch(`${config.marketDataUrl}/sudden-move-check`);
  if (!res.ok) throw new Error(`market-data returned ${res.status}`);
  return res.json() as Promise<SuddenMoveCheck>;
}
