import { useEffect, useState } from "react";
import { marketData, type PricePoint } from "./api";

// Module-level cache so the table sparkline, the detail chart and the portfolio
// series share fetches. Entries go stale after a few minutes (crypto logs every minute).
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<PricePoint[]> }>();

function load(source: string, days: number, maxPoints: number): Promise<PricePoint[]> {
  const key = `${source}:${days}:${maxPoints}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = marketData.prices(source, days, maxPoints).then((r) => r.points);
  promise.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

export type SeriesMap = Record<string, PricePoint[] | undefined>;

/** Price series for several sources; a source is `undefined` until it loads
 * (and `[]` if it failed or has no history). */
export function useSeriesMap(sources: string[], days: number, maxPoints: number): SeriesMap {
  const reqKey = `${sources.join(",")}|${days}|${maxPoints}`;
  const [state, setState] = useState<{ reqKey: string; data: SeriesMap }>({ reqKey: "", data: {} });

  useEffect(() => {
    let cancelled = false;
    const [list] = reqKey.split("|");
    const put = (source: string, points: PricePoint[]) => {
      if (cancelled) return;
      setState((s) => ({ reqKey, data: { ...(s.reqKey === reqKey ? s.data : {}), [source]: points } }));
    };
    for (const source of list ? list.split(",") : []) {
      load(source, days, maxPoints).then(
        (points) => put(source, points),
        () => put(source, [])
      );
    }
    return () => {
      cancelled = true;
    };
  }, [reqKey, days, maxPoints]);

  return state.reqKey === reqKey ? state.data : {};
}

export function useSeries(source: string, days: number, maxPoints: number): PricePoint[] | undefined {
  return useSeriesMap([source], days, maxPoints)[source];
}
