/**
 * Local copies of the `DfArcDuration` and `OcelDfPerformance` shapes, kept here so
 * this component has no `@r4pm/client` dependency. Structurally assignable to/from
 * the generated bindings. Fed via the optional
 * `performance` prop on viewers; absent = overlay not shown.
 */

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

/**
 * Per-object-type DF performance statistics: for each object type, a list of
 * arc durations computed from the event sequences of individual objects.
 */
export type OcelDfPerformance = {
  arcs_per_object_type: { [key in string]?: Array<DfArcDuration> };
};

/** Case-centric DF performance statistics: one entry per directly-follows arc. */
export type DfPerformance = {
  arcs: Array<DfArcDuration>;
};
