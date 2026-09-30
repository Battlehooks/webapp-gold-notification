import { SIG, type Signal } from "../signal";

const SIZES = {
  xs: { padding: "1px 7px", fontSize: 10 },
  sm: {},
  lg: { fontSize: 18, fontWeight: 500, letterSpacing: ".04em", padding: "6px 18px", borderRadius: "var(--radius-md)" },
  md: { fontSize: 15, fontWeight: 500, padding: "5px 12px", borderRadius: "var(--radius-md)" },
} as const;

/** Displays the API's signal as-is. `undefined` = no stats (yet). */
export function SignalTag({
  signal,
  loading,
  size = "sm",
}: {
  signal: Signal | undefined;
  loading?: boolean;
  size?: keyof typeof SIZES;
}) {
  if (!signal) {
    return (
      <span className="tag tag-neutral" style={{ ...SIZES[size], justifyContent: "center", opacity: loading ? 0.6 : 1 }}>
        {loading ? "…" : "No data"}
      </span>
    );
  }
  const c = SIG[signal];
  return (
    <span className="tag" style={{ ...SIZES[size], justifyContent: "center", background: c.bg, color: c.fg }}>
      {signal}
    </span>
  );
}
