import { useCallback, useEffect, useState } from "react";
import {
  insight,
  marketData,
  type AnalysisRun,
  type GroupsResponse,
  type SignalStats,
  type SourceMeta,
} from "./api";

const GROUP_LABELS: Record<string, string> = {
  gold: "Gold (Pegadaian)",
  crypto: "Crypto & Treasury",
};
const GROUP_SHORT: Record<string, string> = {
  gold: "Gold",
  crypto: "Crypto",
};

export const groupLabel = (g: string) => GROUP_LABELS[g] ?? g;
export const groupShort = (g: string) => GROUP_SHORT[g] ?? g;

export interface Asset {
  source: string;
  group: string;
  meta: SourceMeta;
  /** Live rule-engine stats from market-data; undefined until it has history. */
  stats?: SignalStats;
  /** True until the group's /signals response has arrived. */
  loading: boolean;
}

export interface Market {
  meta: GroupsResponse | null;
  groups: string[];
  assets: Asset[];
  bySource: Record<string, Asset>;
  /** Newest first, at most 2 per group; a group is missing until its history loads. */
  runs: Record<string, AnalysisRun[]>;
  /** Groups ordered largest first -- the default tab. */
  defaultGroup: string | undefined;
  error: string | null;
  narrating: Record<string, boolean>;
  narrate: (group: string) => Promise<void>;
}

const REFRESH_MS = 5 * 60_000;

export function useMarket(): Market {
  const [meta, setMeta] = useState<GroupsResponse | null>(null);
  const [signals, setSignals] = useState<Record<string, Record<string, SignalStats>>>({});
  const [runs, setRuns] = useState<Record<string, AnalysisRun[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [narrating, setNarrating] = useState<Record<string, boolean>>({});

  const loadHistory = useCallback((group: string) => {
    return insight
      .history(group, 2)
      .then((res) => setRuns((r) => ({ ...r, [group]: res.runs })))
      .catch(() => setRuns((r) => ({ ...r, [group]: r[group] ?? [] })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const m = await marketData.sources();
        if (cancelled) return;
        setMeta(m);
        setError(null);
        await Promise.all(
          Object.keys(m.groups).map((g) =>
            Promise.all([
              marketData
                .groupSignals(g)
                .then((res) => !cancelled && setSignals((s) => ({ ...s, [g]: res.sources })))
                .catch((err) => {
                  if (cancelled) return;
                  setError(String(err));
                  setSignals((s) => ({ ...s, [g]: s[g] ?? {} }));
                }),
              loadHistory(g),
            ])
          )
        );
      } catch (err) {
        if (!cancelled) setError(`Can't reach the market-data service — prices and signals are unavailable. (${String(err)})`);
      }
    }
    void refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loadHistory]);

  const narrate = useCallback(
    async (group: string) => {
      setNarrating((n) => ({ ...n, [group]: true }));
      try {
        await insight.narrate(group);
        await loadHistory(group);
      } catch (err) {
        setError(String(err));
      } finally {
        setNarrating((n) => ({ ...n, [group]: false }));
      }
    },
    [loadHistory]
  );

  const groups = meta ? Object.keys(meta.groups) : [];
  const assets: Asset[] = meta
    ? groups.flatMap((g) =>
        meta.groups[g].sources
          .filter((s) => meta.sources[s])
          .map((s) => ({
            source: s,
            group: g,
            meta: meta.sources[s],
            stats: signals[g]?.[s],
            loading: signals[g] === undefined,
          }))
      )
    : [];
  const bySource = Object.fromEntries(assets.map((a) => [a.source, a]));

  const defaultGroup = [...groups].sort(
    (a, b) => (meta?.groups[b].sources.length ?? 0) - (meta?.groups[a].sources.length ?? 0)
  )[0];

  return { meta, groups, assets, bySource, runs, defaultGroup, error, narrating, narrate };
}
