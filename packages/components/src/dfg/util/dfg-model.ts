import { formatDurationMs } from "./duration";

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

/** `sourceCount` is how often the arc's source occurred, for `pct_source`. */
export function computeMetricValue(
  arc: { count: number; duration?: DfgArcDuration },
  metric: DfgMetric,
  sourceCount: number,
): number | null {
  switch (metric) {
    case "count":
      return arc.count;
    case "pct_source":
      return sourceCount > 0 ? (arc.count / sourceCount) * 100 : null;
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

/** The source of a start arc and the target of an end arc. */
export const DFG_START_ID = "__START";
export const DFG_END_ID = "__END";

export type DfgArcKind = "follows" | "start" | "end";

/** One edge of a (per object type) DFG: a directly-follows relation, or a start or end arc. */
export interface DfgArc {
  key: string;
  kind: DfgArcKind;
  /** The source activity, {@link DFG_START_ID} for a start arc. */
  from: string;
  /** The target activity, {@link DFG_END_ID} for an end arc. */
  to: string;
  count: number;
  /** The object type of an OC-DFG arc. The edge slider ranks arcs per group. */
  group?: string;
  duration?: DfgArcDuration;
}

/** Coverage stats shown next to the edge slider. */
export interface DfgCoverage {
  edges: { shown: number; total: number; sliderMax: number; pct: number };
  activities: { shown: number; total: number; pct: number };
}
