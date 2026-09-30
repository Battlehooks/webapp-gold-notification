// Signal colours from the Nocturne "Gold App" design. Deliberately not tokens:
// the design system has one accent and no semantic green/amber/red.
export type Signal = "BUY" | "SELL" | "WAIT";

export const SIG: Record<Signal, { fg: string; bg: string }> = {
  BUY: { fg: "oklch(0.82 0.12 155)", bg: "oklch(0.34 0.05 155)" },
  WAIT: { fg: "oklch(0.86 0.1 85)", bg: "oklch(0.36 0.04 85)" },
  SELL: { fg: "oklch(0.78 0.12 25)", bg: "oklch(0.34 0.05 25)" },
};

export const UP = "oklch(0.8 0.12 155)";
export const DOWN = "oklch(0.76 0.12 25)";

/** Colour for a % change / P&L value; null renders muted. */
export function changeColor(value: number | null | undefined): string {
  if (value == null) return "var(--color-neutral-500)";
  return value >= 0 ? UP : DOWN;
}
