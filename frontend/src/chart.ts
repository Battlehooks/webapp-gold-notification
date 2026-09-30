// SVG path helper ported from the design: maps values onto a W×H box
// (viewBox units) with top/bottom padding, returns line + closed-area paths.
export interface ChartPaths {
  line: string;
  area: string;
  X: (i: number) => number;
  Y: (v: number) => number;
  min: number;
  max: number;
}

export function paths(values: number[], W: number, H: number, padTop = 8, padBottom = 8): ChartPaths {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  const X = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const Y = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBottom);
  const line = values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const area = n ? `${line} L${X(n - 1).toFixed(1)} ${H} L${X(0).toFixed(1)} ${H} Z` : "";
  return { line, area, X, Y, min, max };
}
