const MARKET_DATA_URL = import.meta.env.VITE_MARKET_DATA_URL || "http://localhost:8001";
const INSIGHT_URL = import.meta.env.VITE_INSIGHT_URL || "http://localhost:8002";
const NOTIFICATION_URL = import.meta.env.VITE_NOTIFICATION_URL || "http://localhost:3000";

export interface SourceMeta {
  display: string;
  unit_suffix: string;
}

export interface GroupsResponse {
  sources: Record<string, SourceMeta>;
  groups: Record<string, { sources: string[] }>;
}

export interface PricePoint {
  sell: number;
  buyback: number;
  fetched_at: string;
}

export interface SignalStats {
  latest_sell_idr: number;
  pct_change_7d: number | null;
  pct_change_30d: number | null;
  min_30d: number;
  max_30d: number;
  avg_30d: number;
  volatility_daily_pct: number | null;
  days_of_data: number;
  rsi_14: number | null;
  pct_rank_30d: number | null;
  price_vs_avg30_pct: number | null;
  signal: "BUY" | "SELL" | "WAIT";
  signal_reasons: string[];
}

export interface GroupSignalsResponse {
  group: string;
  sources: Record<string, SignalStats>;
}

export interface AnalysisRun {
  group_name: string;
  created_at: string;
  stats: Record<string, SignalStats>;
  reasoning: { per_source: Record<string, string>; overview: string } | null;
  headlines: string[];
  banner: string | null;
  summary_text: string;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const marketData = {
  sources: () => getJson<GroupsResponse>(`${MARKET_DATA_URL}/sources`),
  prices: (source: string, days = 30) =>
    getJson<{ source: string; points: PricePoint[] }>(
      `${MARKET_DATA_URL}/prices/${source}?days=${days}`
    ),
  groupSignals: (group: string, days = 30) =>
    getJson<GroupSignalsResponse>(`${MARKET_DATA_URL}/signals?group=${group}&days=${days}`),
};

export const insight = {
  analysis: (group: string) => getJson<AnalysisRun>(`${INSIGHT_URL}/analysis/${group}`),
  narrate: (group: string) =>
    getJson<AnalysisRun & { title: string }>(`${INSIGHT_URL}/narrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group }),
    }),
  chat: (chatId: string, message: string) =>
    getJson<{ chat_id: string; reply: string }>(`${INSIGHT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message }),
    }),
};

export interface Subscriber {
  chat_id: string;
  status: "pending" | "active" | "stopped";
  username: string | null;
  requested_at: string;
  decided_at: string | null;
}

export const notificationAdmin = {
  subscribers: (token: string) =>
    getJson<{ subscribers: Subscriber[] }>(`${NOTIFICATION_URL}/admin/subscribers`, {
      headers: { "x-admin-token": token },
    }),
  pending: (token: string) =>
    getJson<{ pending: Subscriber[] }>(`${NOTIFICATION_URL}/admin/subscribers/pending`, {
      headers: { "x-admin-token": token },
    }),
  approve: (chatId: string, token: string) =>
    getJson<{ ok: boolean }>(`${NOTIFICATION_URL}/admin/subscribers/${chatId}/approve`, {
      method: "POST",
      headers: { "x-admin-token": token },
    }),
  deny: (chatId: string, token: string) =>
    getJson<{ ok: boolean }>(`${NOTIFICATION_URL}/admin/subscribers/${chatId}/deny`, {
      method: "POST",
      headers: { "x-admin-token": token },
    }),
};
