import { useSyncExternalStore } from "react";
import { pushAlerts, type AlertRules } from "./api";
import type { Holding } from "./holdings";

// Push alerts for this browser. Turning them on subscribes the browser to Web
// Push and hands the Notification service the subscription, the holdings and
// the alert rules, so it can check them every minute and notify even while
// no tab is open. Turning them off deletes all of that server-side.

const DEVICE_KEY = "gold-notification-web-device-id";
const RULES_KEY = "gold-notification-web-alert-rules";

export const DEFAULT_RULES: AlertRules = { takeProfitPct: 10, stopLossPct: 5, signalChanges: true, suddenMoves: true };

/** unsupported: this browser/page can't do Web Push (needs HTTPS or localhost).
 * blocked: the user denied notification permission for this site. */
export type AlertStatus = "unsupported" | "blocked" | "off" | "on";

interface AlertsState {
  status: AlertStatus;
  rules: AlertRules;
}

const listeners = new Set<() => void>();
let state: AlertsState = { status: pushSupported() ? "off" : "unsupported", rules: loadRules() };

function set(patch: Partial<AlertsState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useAlerts(): AlertsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked -- this session still works */
  }
}

function loadRules(): AlertRules {
  try {
    return { ...DEFAULT_RULES, ...JSON.parse(storageGet(RULES_KEY) ?? "{}") };
  } catch {
    return DEFAULT_RULES;
  }
}

/** Random per-browser id; it's what lets this browser update or delete its own alerts. */
function deviceId(): string {
  let id = storageGet(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    storageSet(DEVICE_KEY, id);
  }
  return id;
}

function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Called once at startup: installs the service worker and works out whether
 * alerts are already on in this browser. */
export async function initAlerts(): Promise<void> {
  if (!pushSupported()) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
    if (Notification.permission === "denied") return set({ status: "blocked" });
    set({ status: (await currentSubscription()) && storageGet(DEVICE_KEY) ? "on" : "off" });
  } catch (err) {
    console.warn("service worker registration failed", err);
    set({ status: "unsupported" });
  }
}

/** Turn alerts on, or save new rules while they're on. Throws with a
 * user-facing message if it can't. */
export async function enableAlerts(holdings: Holding[], rules: AlertRules): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    set({ status: permission === "denied" ? "blocked" : "off" });
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in the browser's site settings, then try again."
        : "Notification permission wasn't granted."
    );
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { publicKey } = await pushAlerts.publicKey();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  await pushAlerts.save(deviceId(), { subscription: subscription.toJSON(), holdings, rules });
  storageSet(RULES_KEY, JSON.stringify(rules));
  set({ status: "on", rules });
}

/** Keep the server's copy of the holdings current while alerts are on.
 * Safe to call often: the server only resets alert memory when something changed. */
export async function syncAlerts(holdings: Holding[]): Promise<void> {
  if (state.status !== "on") return;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return set({ status: "off" });
    await pushAlerts.save(deviceId(), { subscription: subscription.toJSON(), holdings, rules: state.rules });
  } catch (err) {
    console.warn("couldn't sync alert holdings", err);
  }
}

export async function disableAlerts(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
  await pushAlerts.remove(deviceId()).catch(() => undefined);
  set({ status: Notification.permission === "denied" ? "blocked" : "off" });
}

export async function sendTestAlert(): Promise<void> {
  await pushAlerts.test(deviceId());
}
