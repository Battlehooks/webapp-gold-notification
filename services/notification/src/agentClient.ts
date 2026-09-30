/** Thin HTTP client for the Agent Service (owner-only ops agent with real
 * shell access). Mirrors insightClient.ts. */
import { config } from "./config.js";

export async function chat(sessionId: string, message: string): Promise<string> {
  const res = await fetch(`${config.agentUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agent-token": config.agentToken },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.ok) throw new Error(`agent returned ${res.status}`);
  const data = (await res.json()) as { reply: string };
  return data.reply;
}
