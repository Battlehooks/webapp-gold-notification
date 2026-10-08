import { useSyncExternalStore } from "react";

// Holdings are personal and per-browser. They leave it only as per-turn
// `context` on an Ask request, and -- while push alerts are on -- as a copy the
// Notification service keeps to check take-profit/stop-loss (see alerts.ts).
export interface Holding {
  source: string;
  qty: number;
  /** Average cost per unit, IDR. */
  avg: number;
}

// Stored rows are purchases ("lots"), so the same asset can appear more than once
// (bought twice at different prices). Everything outside the holdings dialog sees
// one merged position per asset: summed quantity, quantity-weighted average cost.
const KEY = "gold-notification-web-holdings";
const listeners = new Set<() => void>();
let cache: Holding[] | null = null;
let merged: Holding[] | null = null;

function read(): Holding[] {
  if (cache) return cache;
  merged = null;
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

function readMerged(): Holding[] {
  const lots = read();
  if (merged) return merged;
  const bySource = new Map<string, Holding>();
  for (const lot of lots) {
    const h = bySource.get(lot.source);
    if (!h) {
      bySource.set(lot.source, { ...lot });
      continue;
    }
    const qty = h.qty + lot.qty;
    h.avg = (h.qty * h.avg + lot.qty * lot.avg) / qty;
    h.qty = qty;
  }
  merged = [...bySource.values()];
  return merged;
}

export function saveHoldings(next: Holding[]): void {
  cache = next;
  merged = null;
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

/** One merged position per asset. */
export function useHoldings(): Holding[] {
  return useSyncExternalStore(subscribe, readMerged);
}

/** The stored purchase rows, as entered -- for the holdings dialog. */
export function useHoldingLots(): Holding[] {
  return useSyncExternalStore(subscribe, read);
}

/** Unit a quantity is counted in: grams for per-gram prices, else the ticker. */
export function holdingUnit(meta: { display: string; unit_suffix: string } | undefined): string {
  if (!meta) return "units";
  return meta.unit_suffix === "/g" ? "g" : meta.display;
}
