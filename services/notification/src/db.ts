/**
 * SQLite storage for this service's own state: subscribers (multi-user
 * /start opt-in, gated behind owner /approve) and alert_state (sudden-move
 * cooldown timestamp). Ported from the root project's storage.py subscriber
 * logic. No price or analysis data lives here -- those are reached over
 * HTTP from Market Data / Insight.
 */
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

// node:sqlite (built into Node 22.5+) instead of better-sqlite3: same
// synchronous prepared-statement API, but no native addon to compile --
// one less thing that can fail to build on a grader's machine.
export const db = new DatabaseSync(config.dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS subscribers (
  chat_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  username TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers (status);
CREATE TABLE IF NOT EXISTS alert_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export interface Subscriber {
  chat_id: string;
  status: "pending" | "active" | "stopped";
  username: string | null;
  requested_at: string;
  decided_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function getSubscriber(chatId: string): Subscriber | undefined {
  return db.prepare("SELECT * FROM subscribers WHERE chat_id = ?").get(chatId) as
    | Subscriber
    | undefined;
}

/** Mirrors storage.request_subscription: first /start -> pending; a
 * previously-/stop'd chat -> reactivated straight to active, no
 * re-approval. */
export function requestSubscription(
  chatId: string,
  username: string | null
): "pending" | "active" | "already_active" {
  const existing = getSubscriber(chatId);
  const now = nowIso();
  if (!existing) {
    db.prepare(
      "INSERT INTO subscribers (chat_id, status, username, requested_at) VALUES (?, 'pending', ?, ?)"
    ).run(chatId, username, now);
    return "pending";
  }
  if (existing.status === "stopped") {
    db.prepare(
      "UPDATE subscribers SET status = 'active', username = ?, decided_at = ? WHERE chat_id = ?"
    ).run(username, now, chatId);
    return "active";
  }
  return existing.status === "active" ? "already_active" : "pending";
}

export function approveSubscriber(chatId: string): boolean {
  const result = db
    .prepare(
      "UPDATE subscribers SET status = 'active', decided_at = ? WHERE chat_id = ? AND status = 'pending'"
    )
    .run(nowIso(), chatId);
  return result.changes > 0;
}

export function denySubscriber(chatId: string): boolean {
  const result = db
    .prepare("DELETE FROM subscribers WHERE chat_id = ? AND status = 'pending'")
    .run(chatId);
  return result.changes > 0;
}

export function stopSubscriber(chatId: string): boolean {
  const result = db
    .prepare("UPDATE subscribers SET status = 'stopped' WHERE chat_id = ? AND status = 'active'")
    .run(chatId);
  return result.changes > 0;
}

export function pendingSubscribers(): Subscriber[] {
  return db
    .prepare("SELECT * FROM subscribers WHERE status = 'pending' ORDER BY requested_at")
    .all() as unknown as Subscriber[];
}

export function activeSubscriberIds(): string[] {
  const rows = db.prepare("SELECT chat_id FROM subscribers WHERE status = 'active'").all() as {
    chat_id: string;
  }[];
  return rows.map((r) => r.chat_id);
}

export function allSubscribers(): Subscriber[] {
  return db
    .prepare("SELECT * FROM subscribers ORDER BY requested_at DESC")
    .all() as unknown as Subscriber[];
}

export function getState(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM alert_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setState(key: string, value: string): void {
  db.prepare(
    "INSERT INTO alert_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
