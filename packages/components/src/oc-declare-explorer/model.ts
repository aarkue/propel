import type { BinnedEdgeDurationStats } from "../oc-declare/edit/edit-context";

// Local view-models mirroring the generated `@r4pm/client` types of the OC-DECLARE explorer bindings.

export type ViolationKind = "too_few" | "too_many";

export interface ArcViolation {
  source: string;
  time_ms: number;
  kind: ViolationKind;
  found: number;
  objects: [string, string][];
  instead?: string | null;
}

export interface ArcViolations {
  sources: number;
  violating_sources: number;
  too_few: number;
  too_many: number;
  bindings: number;
  violating_bindings: number;
  found_histogram: { found: number; bindings: number; violating: boolean }[];
  over_time: { start_ms: number; sources: number; violations: number }[];
  bin_width_ms: number;
  instead: { name: string; violations: number }[];
  by_object_type: { name: string; violations: number }[];
  top_objects: { object_type: string; id: string; violations: number }[];
  examples: ArcViolation[];
}

export interface ObjectLane {
  object_type: string;
  id: string;
  events: { id: string; activity: string; time_ms: number }[];
}

/** Edge duration histogram, as the OC-DECLARE stats sheet takes it, with the number of durations. */
export type EdgeDurations = BinnedEdgeDurationStats & { total_count?: number };

/** Share of source events that violate the constraint; 0 without source events. */
export function violationRate(v: Pick<ArcViolations, "sources" | "violating_sources">): number {
  return v.sources === 0 ? 0 : v.violating_sources / v.sources;
}

/** The required number of target events in words, e.g., "exactly 1", "at least 2", "1 to 3". */
export function cardinalityText([min, max]: [number | null, number | null]): string {
  const lo = min ?? 0;
  if (max == null) return lo === 0 ? "any number" : `at least ${lo}`;
  if (lo === max) return max === 0 ? "none" : `exactly ${lo}`;
  if (lo === 0) return `at most ${max}`;
  return `${lo} to ${max}`;
}

export type LaneWindow = "focus" | "all";

/**
 * Time range of the violation timeline. "focus" spans the object with the fewest events (usually the
 * one the binding is about), so long-lived shared objects do not squeeze it into a few pixels.
 */
export function laneRange(lanes: ObjectLane[], sourceMs: number, mode: LaneWindow): [number, number] {
  const spanOf = (ls: ObjectLane[]): [number, number] => {
    let lo = sourceMs;
    let hi = sourceMs;
    for (const l of ls) {
      for (const e of l.events) {
        lo = Math.min(lo, e.time_ms);
        hi = Math.max(hi, e.time_ms);
      }
    }
    return [lo, hi];
  };
  const withEvents = lanes.filter((l) => l.events.length > 0);
  const [lo, hi] =
    mode === "all" || withEvents.length === 0
      ? spanOf(lanes)
      : spanOf([withEvents.reduce((a, b) => (b.events.length < a.events.length ? b : a))]);
  const pad = hi > lo ? (hi - lo) * 0.06 : 12 * 3_600_000;
  return [lo - pad, hi + pad];
}
