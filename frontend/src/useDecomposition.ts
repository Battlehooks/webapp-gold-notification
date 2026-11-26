import { useEffect, useState } from "react";
import { marketData, type Decomposition } from "./api";

const REFRESH_MS = 5 * 60_000;

/** Gold-vs-rupiah split for a per-gram gold asset. Null for any other asset,
 * on error or 404, and while the first response for this source is pending. */
export function useDecomposition(source: string, unitSuffix: string | undefined): Decomposition | null {
  const enabled = unitSuffix === "/g";
  // Tagged with its source so a previous asset's split is never shown.
  const [state, setState] = useState<{ source: string; data: Decomposition | null }>({ source: "", data: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      marketData.decomposition(source).then(
        (data) => !cancelled && setState({ source, data }),
        () => !cancelled && setState({ source, data: null })
      );
    void load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, source]);

  return enabled && state.source === source ? state.data : null;
}
