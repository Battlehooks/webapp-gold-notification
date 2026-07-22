import { useEffect, useState } from "react";
import { AssetCard } from "../components/AssetCard";
import {
  insight,
  marketData,
  type AnalysisRun,
  type GroupSignalsResponse,
  type GroupsResponse,
} from "../api";

const GROUP_LABELS: Record<string, string> = {
  gold: "Gold (Pegadaian)",
  crypto: "Crypto & Treasury",
};

export function Dashboard() {
  const [sources, setSources] = useState<GroupsResponse | null>(null);
  const [group, setGroup] = useState("crypto");
  const [signals, setSignals] = useState<GroupSignalsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);

  useEffect(() => {
    marketData.sources().then(setSources).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSignals(null);
    setAnalysis(null);
    setError(null);

    marketData
      .groupSignals(group)
      .then((res) => {
        if (!cancelled) setSignals(res);
      })
      .catch((err) => !cancelled && setError(String(err)));

    insight
      .analysis(group)
      .then((res) => {
        if (!cancelled) setAnalysis(res);
      })
      .catch(() => {
        /* no narration saved yet -- fine, cards fall back to rule-engine reasons */
      });

    return () => {
      cancelled = true;
    };
  }, [group]);

  async function generateNarration() {
    setNarrating(true);
    try {
      const result = await insight.narrate(group);
      setAnalysis(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setNarrating(false);
    }
  }

  if (!sources) return <div className="page-loading">Loading...</div>;

  const groupSources = sources.groups[group]?.sources ?? [];

  return (
    <div>
      <div className="tabs">
        {Object.keys(sources.groups).map((g) => (
          <button
            key={g}
            className={g === group ? "tab active" : "tab"}
            onClick={() => setGroup(g)}
          >
            {GROUP_LABELS[g] ?? g}
          </button>
        ))}
      </div>

      {error && <div className="banner error">{error}</div>}

      {analysis?.reasoning?.overview && (
        <div className="banner overview">{analysis.reasoning.overview}</div>
      )}

      {!analysis?.reasoning && (
        <div className="banner muted">
          No LLM narration saved yet for this group.{" "}
          <button onClick={generateNarration} disabled={narrating}>
            {narrating ? "Generating..." : "Generate now"}
          </button>
        </div>
      )}

      <div className="card-grid">
        {groupSources.map((source) => {
          const stats = signals?.sources[source];
          const meta = sources.sources[source];
          if (!stats || !meta) return null;
          return (
            <AssetCard
              key={source}
              source={source}
              meta={meta}
              stats={stats}
              reasoning={analysis?.reasoning?.per_source[source]}
            />
          );
        })}
        {signals && groupSources.every((s) => !signals.sources[s]) && (
          <div className="banner muted">
            No price history yet for this group -- give the Market Data
            Service's ingestion scheduler a few minutes.
          </div>
        )}
      </div>
    </div>
  );
}
