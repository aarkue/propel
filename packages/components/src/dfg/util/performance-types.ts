/** Local copies of the `DfArcDuration`/`OcelDfPerformance` shapes, structurally assignable to the generated bindings, to avoid a `@r4pm/client` dependency. */

/** Per-arc DF performance statistics (durations in milliseconds). */
export type DfArcDuration = {
  source: string;
  target: string;
  count: number;
  min_ms: number;
  max_ms: number;
  mean_ms: number;
  median_ms: number;
  p90_ms: number;
};

/** Per-object-type DF performance statistics: arc durations per object type, from individual object event sequences. */
export type OcelDfPerformance = {
  arcs_per_object_type: { [key in string]?: Array<DfArcDuration> };
};

/** Case-centric DF performance statistics: one entry per directly-follows arc. */
export type DfPerformance = {
  arcs: Array<DfArcDuration>;
};
