import { useId } from "react";
import { paths } from "../chart";

/** Filled accent area used for the portfolio value (no axes, no hover). */
export function AreaChart({ values, height }: { values: number[]; height: number }) {
  const gid = "g" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const p = values.length > 1 ? paths(values, 600, 110, 6, 4) : null;
  return (
    <svg viewBox="0 0 600 110" preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {p && (
        <>
          <path d={p.area} fill={`url(#${gid})`} />
          <path d={p.line} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}
