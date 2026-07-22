import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { marketData, type PricePoint } from "../api";

function shortDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function PriceChart({ source, color }: { source: string; color: string }) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketData
      .prices(source, 30)
      .then((res) => {
        if (!cancelled) setPoints(res.points);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) return <div className="chart-empty">chart unavailable</div>;
  if (!points) return <div className="chart-empty">loading chart...</div>;
  if (points.length === 0) return <div className="chart-empty">no history yet</div>;

  const data = points.map((p) => ({ x: shortDate(p.fetched_at), sell: p.sell }));

  return (
    <ResponsiveContainer width="100%" height={100}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="x" hide />
        <YAxis domain={["auto", "auto"]} hide />
        <Tooltip
          formatter={(value) => (typeof value === "number" ? value.toLocaleString("id-ID") : value)}
          labelFormatter={(label) => label}
          contentStyle={{ fontSize: 12, background: "var(--card-bg)", border: "1px solid var(--border)" }}
        />
        <Line type="monotone" dataKey="sell" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
