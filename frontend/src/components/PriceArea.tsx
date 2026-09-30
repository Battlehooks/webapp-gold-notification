import { useId, useState } from "react";
import type { PricePoint } from "../api";
import { paths } from "../chart";
import { fmtJakarta } from "../format";

const W = 1000;
const H = 280;

/** Asset price chart: area + dashed 30d-average line; hover crosshair and tooltip when `interactive`. */
export function PriceArea({
  points,
  avg,
  height,
  interactive,
  daysOfData,
  format,
}: {
  points: PricePoint[] | undefined;
  avg: number | null | undefined;
  height: number;
  interactive: boolean;
  daysOfData: number | undefined;
  format: (v: number) => string;
}) {
  const gid = "g" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hov, setHov] = useState<number | null>(null);

  const vals = points?.map((p) => p.sell) ?? [];
  const n = vals.length;
  const p = n > 0 ? paths(vals, W, H, 44, 12) : null;
  const avgY = p && avg != null ? Math.max(0, Math.min(H, p.Y(avg))) : null;

  let overlay: string | null = null;
  if (!points) overlay = "Loading chart…";
  else if (n === 0) overlay = "No price history yet.";
  else if (daysOfData != null && daysOfData < 7)
    overlay = `Only ${daysOfData} day${daysOfData === 1 ? "" : "s"} of history so far. The chart fills in as data arrives.`;

  let tip = null;
  if (interactive && p && hov != null && n > 1) {
    const i = Math.round(hov * (n - 1));
    const x = p.X(i) / (W / 100);
    const y = (p.Y(vals[i]) / H) * 100;
    tip = (
      <>
        <div className="chart-crosshair" style={{ left: `${x}%` }} />
        <div className="chart-dot" style={{ left: `${x}%`, top: `${y}%` }} />
        <div
          className="chart-tip"
          style={{ left: `${x}%`, transform: x > 80 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
        >
          <div className="chart-tip-price">{format(vals[i])}</div>
          <div className="chart-tip-date">{fmtJakarta(points![i].fetched_at)}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        style={{ position: "relative", height }}
        onMouseMove={
          interactive
            ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHov(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
              }
            : undefined
        }
        onMouseLeave={interactive ? () => setHov(null) : undefined}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {p && n > 1 && <path d={p.area} fill={`url(#${gid})`} />}
          {avgY != null && (
            <line x1="0" x2={W} y1={avgY} y2={avgY} stroke="var(--color-neutral-500)" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          )}
          {p && n > 1 && (
            <path d={p.line} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {tip}
        {overlay && <div className="chart-overlay">{overlay}</div>}
      </div>
      {interactive && points && n > 0 && (
        <div className="chart-axis">
          <span>{fmtJakarta(points[0].fetched_at)}</span>
          <span>{fmtJakarta(points[n - 1].fetched_at)}</span>
        </div>
      )}
    </>
  );
}
