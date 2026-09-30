import { paths } from "../chart";

export function Sparkline({ values }: { values: number[] | undefined }) {
  return (
    <svg viewBox="0 0 90 24" className="sparkline" aria-hidden="true">
      {values && values.length > 1 && (
        <path d={paths(values, 90, 24, 2, 2).line} fill="none" stroke="var(--color-neutral-400)" strokeWidth="1.5" />
      )}
    </svg>
  );
}
