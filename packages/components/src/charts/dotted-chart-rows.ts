import type { DottedChartData } from "./dotted-chart";

/** `start` is the engine's order: by first event timestamp. */
export type DottedChartCaseOrder = "start" | "end" | "span" | "events";

/** Ties keep the engine's order. */
export function orderRows(data: DottedChartData, order: DottedChartCaseOrder): string[] {
  if (order === "start") return data.y_values;
  const n = data.y_values.length;
  const min = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const max = new Float64Array(n).fill(Number.NEGATIVE_INFINITY);
  const count = new Uint32Array(n);
  for (const { x, y } of Object.values(data.dots_per_color)) {
    for (let i = 0; i < y.length; i++) {
      const r = y[i];
      if (x[i] < min[r]) min[r] = x[i];
      if (x[i] > max[r]) max[r] = x[i];
      count[r]++;
    }
  }
  const key = (r: number) => (order === "end" ? max[r] : order === "span" ? max[r] - min[r] : count[r]);
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => key(a) - key(b) || a - b);
  return idx.map((i) => data.y_values[i]);
}

/** Plot position of each `y_values` index, given the category order shown on the axis. */
export function rowPositions(data: DottedChartData, categories: string[]): Int32Array {
  const indexOf = new Map(data.y_values.map((v, i) => [v, i]));
  const pos = new Int32Array(data.y_values.length);
  categories.forEach((v, p) => {
    const i = indexOf.get(v);
    if (i !== undefined) pos[i] = p;
  });
  return pos;
}

/** Dots inside the zoomed ranges (null: the whole axis). `xScale` maps data x to axis units. */
export function countVisibleDots(
  data: DottedChartData,
  rowPos: Int32Array,
  xScale: number,
  xRange: [number, number] | null,
  yRange: [number, number] | null,
): number {
  let n = 0;
  for (const { x, y } of Object.values(data.dots_per_color)) {
    if (!xRange && !yRange) {
      n += y.length;
      continue;
    }
    for (let i = 0; i < y.length; i++) {
      const xv = x[i] * xScale;
      const yv = rowPos[y[i]];
      if (xRange && (xv < xRange[0] || xv > xRange[1])) continue;
      if (yRange && (yv < yRange[0] || yv > yRange[1])) continue;
      n++;
    }
  }
  return n;
}

/** About the spacing `visibleDots` would have if spread evenly over `areaPx`. */
export function autoDotSize(areaPx: number, visibleDots: number, scale = 1): number {
  return Math.min(9, Math.max(2, scale * 1.1 * Math.sqrt(areaPx / Math.max(1, visibleDots))));
}

/** A Plotly date-axis value (epoch ms, or a zone-less UTC date string) as epoch ms. */
export function parsePlotlyDate(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // Plotly reports date ranges as zone-less UTC strings, which Date.parse reads as local time.
    const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/.exec(v);
    const t = m ? Date.parse(`${m[1]}T${m[2] ?? "00:00"}Z`) : Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}
