/** Thin HTTP client for the Insight Service. */
import { config } from "./config.js";

export interface NarrateResult {
  group: string;
  title: string;
  stats: Record<string, unknown>;
  reasoning: { per_source: Record<string, string>; overview: string } | null;
  summary_text: string;
  headlines: string[];
  banner: string | null;
}

export async function narrate(group: string, banner?: string): Promise<NarrateResult> {
  const res = await fetch(`${config.insightUrl}/narrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group, banner: banner ?? null }),
  });
  if (!res.ok) throw new Error(`insight returned ${res.status}`);
  return res.json() as Promise<NarrateResult>;
}

export async function chat(chatId: string, message: string): Promise<string> {
  const res = await fetch(`${config.insightUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message }),
  });
  if (!res.ok) throw new Error(`insight returned ${res.status}`);
  const data = (await res.json()) as { reply: string };
  return data.reply;
}

export async function whyMoved(display: string, pct: number): Promise<string | null> {
  const res = await fetch(
    `${config.insightUrl}/why-moved?display=${encodeURIComponent(display)}&pct=${pct}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { why: string | null };
  return data.why;
}
