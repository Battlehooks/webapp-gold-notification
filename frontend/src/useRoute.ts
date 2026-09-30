import { useSyncExternalStore } from "react";

// Tiny hash router: #/ · #/assets · #/ask · #/asset/<source> · #/admin · #/agent.
// Hash-based so the static nginx container needs no rewrite rules and the
// browser back button works.
export type Route =
  | { page: "home" }
  | { page: "assets" }
  | { page: "ask" }
  | { page: "asset"; source: string }
  | { page: "admin" }
  | { page: "agent" };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "assets":
      return { page: "assets" };
    case "ask":
      return { page: "ask" };
    case "admin":
      return { page: "admin" };
    case "agent":
      return { page: "agent" };
    case "asset":
      if (parts[1]) return { page: "asset", source: decodeURIComponent(parts[1]) };
      return { page: "home" };
    default:
      return { page: "home" };
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function go(path: string): void {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
  window.scrollTo(0, 0);
}

export const assetPath = (source: string) => `/asset/${encodeURIComponent(source)}`;
