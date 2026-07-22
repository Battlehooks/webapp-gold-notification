export function fmtRp(value: number): string {
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}

export function fmtPct(value: number | null): string {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
