/** Thin HTTP client for the Market Data Service -- same service-boundary
 * rule as Insight's client: never touch its database, only its API. */
import { config } from "./config.js";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${config.marketDataUrl}${path}`);
  if (!res.ok) throw new Error(`market-data ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export interface SuddenMoveCheck {
  move: { source: string; pct: number } | null;
  window_min: number;
  threshold_pct: number;
}

export interface SourcesResponse {
  sources: Record<string, { display: string; unit_suffix: string }>;
  groups: Record<string, { sources: string[] }>;
}

export interface LatestPrice {
  sell: number;
  buyback: number;
  fetched_at: string;
}

export interface SourceSignal {
  signal: "BUY" | "SELL" | "WAIT";
  signal_reasons: string[];
}

export const getSuddenMoveCheck = () => getJson<SuddenMoveCheck>("/sudden-move-check");
export const getSources = () => getJson<SourcesResponse>("/sources");
export const getLatest = async () => (await getJson<{ sources: Record<string, LatestPrice> }>("/latest")).sources;
export const getGroupSignals = async (group: string) =>
  (await getJson<{ sources: Record<string, SourceSignal> }>(`/signals?group=${encodeURIComponent(group)}`)).sources;
