import { createContext, useContext } from "react";
import type { Holding } from "./holdings";
import type { Position } from "./model";
import type { Ask } from "./useAsk";
import type { Market } from "./useMarket";

export interface AppCtx {
  market: Market;
  holdings: Holding[];
  positions: Position[];
  held: Set<string>;
  ask: Ask;
  /** Web: open the slide-over. Phone: switch to the Ask tab. Optionally sends a question. */
  openAsk: (question?: string) => void;
  openHoldings: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}
