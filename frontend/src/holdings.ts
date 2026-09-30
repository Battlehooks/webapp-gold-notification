import { useSyncExternalStore } from "react";

// No holdings API exists -- holdings are personal, per-browser, and never leave
// it except as per-turn `context` on an Ask request.
export interface Holding {
  source: string;
  qty: number;
  /** Average cost per unit, IDR. */
  avg: number;
}

const KEY = "gold-notification-web-holdings";
const listeners = new Set<() => void>();
let cache: Holding[] | null = null;

function read(): Holding[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed)
      ? parsed.filter(
          (h): h is Holding =>
            typeof h?.source === "string" && Number.isFinite(h?.qty) && Number.isFinite(h?.avg)
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function saveHoldings(next: Holding[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked -- keep the in-memory copy for this session */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useHoldings(): Holding[] {
  return useSyncExternalStore(subscribe, read);
}

/** Unit a quantity is counted in: grams for per-gram prices, else the ticker. */
export function holdingUnit(meta: { display: string; unit_suffix: string } | undefined): string {
  if (!meta) return "units";
  return meta.unit_suffix === "/g" ? "g" : meta.display;
}
