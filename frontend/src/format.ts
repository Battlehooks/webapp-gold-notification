export function fmtRp(value: number): string {
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}

export function fmtPct(value: number | null): string {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Like fmtPct but with the design's em-dash placeholder. */
export function fmtPctOrDash(value: number | null | undefined): string {
  return value == null ? "—" : fmtPct(value);
}

/** Signed rupiah amount, e.g. P/L: "+Rp 1.200" / "−Rp 300". */
export function fmtRpSigned(value: number): string {
  return (value >= 0 ? "+" : "−") + fmtRp(Math.abs(value));
}

export function ordinal(value: number): string {
  const n = Math.round(value);
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** API timestamps are naive UTC 'YYYY-MM-DD HH:MM:SS'. */
export function parseUtc(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z");
}

const JAKARTA = "Asia/Jakarta";

// en-US for the month ("Sep"; en-GB now prints "Sept"), assembled day-first.
function jakartaParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: JAKARTA }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** "30 Sep, 11:30" in Jakarta time. */
export function fmtJakarta(s: string | Date): string {
  const d = typeof s === "string" ? parseUtc(s) : s;
  const { day, month } = jakartaParts(d);
  return `${day} ${month}, ${fmtJakartaTime(d)}`;
}

/** "11:30" in Jakarta time. */
export function fmtJakartaTime(s: string | Date): string {
  const d = typeof s === "string" ? parseUtc(s) : s;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: JAKARTA });
}

/** "30 Sep 2026" in Jakarta time. */
export function fmtJakartaDate(d: Date): string {
  const { day, month, year } = jakartaParts(d);
  return `${day} ${month} ${year}`;
}

export function fmtQty(qty: number, unit: string): string {
  return `${qty.toLocaleString("id-ID", { maximumFractionDigits: 8 })} ${unit}`;
}
