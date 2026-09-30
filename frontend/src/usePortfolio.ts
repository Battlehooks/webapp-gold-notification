import { useApp } from "./appContext";
import { changes, portfolio, type Change, type Portfolio } from "./model";
import { useSeriesMap } from "./useSeries";

export function usePortfolio(): Portfolio {
  const { positions } = useApp();
  const series = useSeriesMap(
    positions.map((p) => p.holding.source),
    30,
    120
  );
  return portfolio(positions, series);
}

export function useChanges(): Change[] {
  const { market, held } = useApp();
  return changes(market.runs, market.bySource, held);
}
