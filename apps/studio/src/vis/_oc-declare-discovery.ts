import type {
  BackendContext,
  OCDeclareArc as ClientArc,
  OCDeclareDiscoveryOptions,
  SlimLinkedOCELHandle,
} from "@r4pm/client";
import type { DiscoveryOptions, OCDeclareArc } from "@r4pm/components";
import type { PanelViewState } from "./define-vis";

// OC-DECLARE calls and settings of the OC-DECLARE panel and the output viewer. `_`-prefixed so the
// vis registry glob skips it.

export const OC_DECLARE_DISCOVER =
  "process_mining::discovery::object_centric::oc_declare::discover_behavior_constraints" as const;
export const OC_DECLARE_PROJECT =
  "process_mining::discovery::object_centric::oc_declare::project_oc_arcs" as const;
export const OC_DECLARE_CONFORMANCE =
  "process_mining::conformance::object_centric::oc_declare::oc_declare_conformance" as const;
export const OCEL_TYPE_STATS = "process_mining::bindings::ocel_type_stats" as const;
export const OCEL_INVOLVEMENTS = "app_bindings::ocel::get_ocel_activity_object_involvements" as const;

export const OC_DECLARE_DEFAULTS: OCDeclareDiscoveryOptions = {
  noise_threshold: 0.2,
  o2o_mode: "None",
  acts_to_use: null,
  object_types_to_use: null,
  counts_for_generation: [1, 20],
  counts_for_filter: [1, 20],
  reduction: "Lossless",
  refinement: true,
  considered_arrow_types: ["AS", "EF", "EP"],
};

const O2O = ["None", "Direct", "Reversed", "Bidirectional"];
const REDUCTIONS = ["None", "Lossless", "Lossy"];
const ARROWS = ["AS", "EF", "EP", "DF", "DP"];

const isCounts = (v: unknown): v is [number | null, number | null] =>
  Array.isArray(v) && v.length === 2 && v.every((x) => x === null || (typeof x === "number" && x >= 0));
const isNames = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Stored controls as discovery options. Anything in another shape falls back to the defaults. */
export function ocDeclareDiscovery(raw: unknown): OCDeclareDiscoveryOptions {
  const c = (raw ?? {}) as Record<string, unknown>;
  const d = OC_DECLARE_DEFAULTS;
  const noise = c.noise_threshold;
  const arrows = isNames(c.considered_arrow_types)
    ? c.considered_arrow_types.filter((a) => ARROWS.includes(a))
    : [];
  return {
    noise_threshold: typeof noise === "number" && noise >= 0 && noise <= 1 ? noise : d.noise_threshold,
    o2o_mode: O2O.includes(c.o2o_mode as string)
      ? (c.o2o_mode as OCDeclareDiscoveryOptions["o2o_mode"])
      : d.o2o_mode,
    acts_to_use: isNames(c.acts_to_use) ? c.acts_to_use : null,
    object_types_to_use: isNames(c.object_types_to_use) ? c.object_types_to_use : null,
    counts_for_generation: isCounts(c.counts_for_generation)
      ? c.counts_for_generation
      : d.counts_for_generation,
    counts_for_filter: isCounts(c.counts_for_filter) ? c.counts_for_filter : d.counts_for_filter,
    reduction: REDUCTIONS.includes(c.reduction as string)
      ? (c.reduction as OCDeclareDiscoveryOptions["reduction"])
      : d.reduction,
    refinement: typeof c.refinement === "boolean" ? c.refinement : d.refinement,
    considered_arrow_types:
      arrows.length > 0
        ? (arrows as OCDeclareDiscoveryOptions["considered_arrow_types"])
        : d.considered_arrow_types,
  };
}

/** The form's options (`@r4pm/components`) in the binding's shape. */
export function toBindingOptions(o: DiscoveryOptions): OCDeclareDiscoveryOptions {
  return ocDeclareDiscovery(o);
}

/** The binding's options in the form's shape. A missing minimum count reads as 1. */
export function toFormOptions(o: OCDeclareDiscoveryOptions): DiscoveryOptions {
  return {
    ...o,
    acts_to_use: o.acts_to_use ?? null,
    object_types_to_use: o.object_types_to_use ?? null,
    counts_for_generation: [o.counts_for_generation[0] ?? 1, o.counts_for_generation[1]],
    counts_for_filter: [o.counts_for_filter[0] ?? 1, o.counts_for_filter[1]],
  };
}

export function hiddenActivitiesOf(view: PanelViewState): string[] {
  const h = view.state.hiddenActivities;
  return isNames(h) ? h : [];
}

/** The activities Show offers, with their event counts: those of the discovered model once
 *  discovery ran, else the log's. */
export function showActivityCounts(
  arcs: { from: string; to: string }[] | undefined,
  counts: Record<string, number>,
): Record<string, number> {
  if (!arcs) return counts;
  const out: Record<string, number> = {};
  for (const a of arcs) {
    for (const name of [a.from, a.to]) {
      if (!name.startsWith("<init> ") && !name.startsWith("<exit> ")) out[name] = counts[name] ?? 0;
    }
  }
  return out;
}

/** The Show button's text. Hidden names that are not in `activities` do not count. */
export function showLabel(activities: string[], hidden: string[]): string {
  const hiddenSet = new Set(hidden);
  const shown = activities.filter((a) => !hiddenSet.has(a)).length;
  return shown === activities.length
    ? `All ${activities.length} activities`
    : `${shown} of ${activities.length} activities`;
}

/** Each arc's fraction of violating events on `ocel`. */
export async function violationFractions(
  backend: Pick<BackendContext, "callBinding">,
  ocel: string,
  arcs: OCDeclareArc[],
): Promise<number[]> {
  const handle = ocel as SlimLinkedOCELHandle;
  const conformance = await Promise.all(
    arcs.map((arc) =>
      backend.callBinding(OC_DECLARE_CONFORMANCE, { ocel: handle, arc: arc as unknown as ClientArc }),
    ),
  );
  return conformance.map((c) => 1 - c);
}

/** The OCEL's event and object type counts and activity involvements, for the OC-DECLARE panel. */
export async function ocDeclarePanelExtras(backend: Pick<BackendContext, "callBinding">, ocel: string) {
  const handle = ocel as SlimLinkedOCELHandle;
  const [stats, activityInvolvements] = await Promise.all([
    backend.callBinding(OCEL_TYPE_STATS, { ocel: handle }),
    backend.callBinding(OCEL_INVOLVEMENTS, { ocel: handle }),
  ]);
  return {
    eventTypeCounts: stats.event_type_counts,
    objectTypeCounts: stats.object_type_counts,
    activityInvolvements,
  };
}
