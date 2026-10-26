import type { OCDeclareArc } from "./index";
import type { DeclareFlowModel } from "./model";
import { constraintData, edgeVisible } from "./viz-layout";

/** The view-state key under which `OCDeclareViewer` keeps the hidden (projected away) activities. */
export const OC_DECLARE_HIDDEN_ACTIVITIES_KEY = "hiddenActivities";

const isSynthetic = (name: string) => name.startsWith("<");

/** `data` if it is an arc list, else none: a viewer can be handed other values, e.g., a saved model file. */
export function arcList(data: unknown): OCDeclareArc[] {
  return Array.isArray(data) ? (data as OCDeclareArc[]) : [];
}

const activitiesOf = (arcs: OCDeclareArc[]) => {
  const out = new Set<string>();
  for (const a of arcs) for (const name of [a.from, a.to]) if (!isSynthetic(name)) out.add(name);
  return out;
};

/** The names `project_oc_arcs` keeps: the activities of `arcs` that are not hidden, plus every
 *  `<init>`/`<exit>` endpoint, which cannot be hidden. */
export function projectionTargets(arcs: OCDeclareArc[], hidden: Iterable<string>): string[] {
  const hiddenSet = new Set(hidden);
  const out = new Set<string>();
  for (const a of arcs) {
    for (const name of [a.from, a.to]) if (isSynthetic(name) || !hiddenSet.has(name)) out.add(name);
  }
  return [...out];
}

/** Whether hiding `hidden` changes the model: some hidden name is an activity of `arcs`. Names it
 *  lacks (left over from an earlier discovery) project nothing away. */
export function isProjected(arcs: OCDeclareArc[], hidden: Iterable<string>): boolean {
  const hiddenSet = new Set(hidden);
  return [...activitiesOf(arcs)].some((a) => hiddenSet.has(a));
}

/** The activities to hide so that only `activity` and those with an arc to or from it remain. */
export function focusHidden(arcs: OCDeclareArc[], activity: string): string[] {
  const kept = new Set([activity]);
  for (const a of arcs) {
    if (a.from === activity && a.to !== activity) kept.add(a.to);
    if (a.to === activity && a.from !== activity) kept.add(a.from);
  }
  return [...activitiesOf(arcs)].filter((name) => !kept.has(name));
}

/** The constraints of `model` the display filters leave visible. A merged EF/EP pair counts twice. */
export function visibleArcCount(
  model: DeclareFlowModel,
  hiddenArcTypes: ReadonlySet<string>,
  hiddenObjectTypes: ReadonlySet<string>,
): number {
  return model.edges.filter((e, i) => edgeVisible(constraintData(e, i), hiddenArcTypes, hiddenObjectTypes))
    .length;
}
