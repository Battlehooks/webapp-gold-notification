const COLORS: Record<string, string> = {
  BUY: "#1e9e5b",
  SELL: "#d64545",
  WAIT: "#c8952a",
};

export function SignalBadge({ signal }: { signal: "BUY" | "SELL" | "WAIT" }) {
  return (
    <span
      className="signal-badge"
      style={{ backgroundColor: COLORS[signal] ?? "#666" }}
    >
      {signal}
    </span>
  );
}
