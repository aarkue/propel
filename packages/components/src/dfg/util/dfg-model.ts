import { formatDurationMs } from "./duration";

export type GraphMode = "frequency" | "performance";

export type DfgMetric = "count" | "pct_source" | "mean" | "median" | "p90" | "min" | "max";

export interface DfgArcDuration {
  mean_ms: number;
  median_ms: number;
  p90_ms: number;
  min_ms: number;
  max_ms: number;
}

export function isPerformanceMetric(m: DfgMetric): boolean {
  return m === "mean" || m === "median" || m === "p90" || m === "min" || m === "max";
}

export function computeMetricValue(
  arc: { count: number; from: string; duration?: DfgArcDuration },
  metric: DfgMetric,
  activityCounts: Record<string, number>,
): number | null {
  switch (metric) {
    case "count":
      return arc.count;
    case "pct_source": {
      const src = activityCounts[arc.from] ?? 0;
      return src > 0 ? (arc.count / src) * 100 : null;
    }
    case "mean":
      return arc.duration?.mean_ms ?? null;
    case "median":
      return arc.duration?.median_ms ?? null;
    case "p90":
      return arc.duration?.p90_ms ?? null;
    case "min":
      return arc.duration?.min_ms ?? null;
    case "max":
      return arc.duration?.max_ms ?? null;
  }
}

export function formatMetricValue(
  value: number,
  metric: DfgMetric,
  fmtDuration: (ms: number) => string = formatDurationMs,
): string {
  if (metric === "count") return value.toLocaleString("en");
  if (metric === "pct_source") return `${value.toFixed(0)}%`;
  return fmtDuration(value);
}

/** Synthetic node ids representing process start / end. */
export const DFG_START_ID = "__START";
export const DFG_END_ID = "__END";
export const TERM_NODE_SIZE = 36;

// Kept in sync so OCEL and case-centric DFG panels render identical cards.
export const OCEL_NODE_WIDTH = 150;
export const OCEL_NODE_HEIGHT = 58;

/** Read-only view of an arc as the graph expects it from the data source.
 *  Multiple arcs with the same `(from, to)` are allowed: they render as
 *  separate parallel edges, each with their own color and label. Callers
 *  must provide a stable `key` per arc (used as the React-Flow edge id). */
export interface DfgArc {
  key: string;
  from: string;
  to: string;
  count: number;
  /** Stroke / arrowhead color. Defaults to mid-gray. */
  color?: string;
  /** Hover title shown to the user, e.g. the contributing object type. */
  title?: string;
  /** Full duration statistics for performance metrics. */
  duration?: DfgArcDuration;
  /**
   * Frequency-filter group. When set, the frequency slider computes its
   * cutoff per-group so arcs from a sparse group are not dominated by arcs
   * from a dense group. Typically the object type name for OCEL DFGs.
   */
  group?: string;
  /** ELK-routed polyline; carried through to the SVG exporter. */
  routing?: {
    points: { x: number; y: number }[];
    srcPos: { x: number; y: number };
    tgtPos: { x: number; y: number };
  };
  /** Pre-computed stroke width from the live UI. */
  strokeWidth?: number;
}

/** Coverage stats shown next to the edge slider. */
export interface DfgCoverage {
  edges: { shown: number; total: number; sliderMax: number; pct: number };
  activities: { shown: number; total: number; pct: number };
}
