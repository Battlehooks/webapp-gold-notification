import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 720px)";

function subscribe(listener: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", listener);
  return () => mql.removeEventListener("change", listener);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
