import type { OCDeclareArc as ClientArc, OCDeclareDiscoveryOptions } from "@r4pm/client";
import {
  type DeclareFlowModel,
  modelArcs,
  nodeDisplayName,
  OC_DECLARE_HIDDEN_ACTIVITIES_KEY,
  type OCDeclareArc,
  toArcs,
} from "@r4pm/components";

// What the OC-DECLARE panel decides, kept free of React so it can be tested. `_`-prefixed so the
// vis registry glob skips it.

/** Where the panel's model came from: a replace only asks when it is not the last discovery's result. */
export type ModelOrigin = "discovered" | "edited" | "loaded";
export type PanelMode = "view" | "edit";
export interface DiscoveryRun {
  ocel: string;
  options: OCDeclareDiscoveryOptions;
}

const ORIGINS: ModelOrigin[] = ["discovered", "edited", "loaded"];

const sortedLabel = (arc: OCDeclareArc) => {
  const sort = (l: unknown[]) => l.map((x) => JSON.stringify(x)).sort();
  return { each: sort(arc.label.each), any: sort(arc.label.any), all: sort(arc.label.all) };
};

/** One key per constraint, from its endpoints, type, counts and object involvement. */
export function arcKey(arc: OCDeclareArc | ClientArc): string {
  const a = arc as OCDeclareArc;
  return JSON.stringify([a.from, a.to, a.arc_type, a.counts, sortedLabel(a)]);
}

/** The model's content, order-free: its constraints and node names. Positions and routes do not count. */
export function contentKey(model: DeclareFlowModel): string {
  const arcs = toArcs(model).map(arcKey).sort();
  const nodes = model.nodes.map(nodeDisplayName).sort();
  return JSON.stringify([arcs, nodes]);
}

export function originAfterChange(
  prev: DeclareFlowModel,
  next: DeclareFlowModel,
  origin: ModelOrigin,
): ModelOrigin {
  return contentKey(prev) === contentKey(next) ? origin : "edited";
}

const hasNodes = (m: unknown) =>
  typeof m === "object" &&
  m !== null &&
  Array.isArray((m as DeclareFlowModel).nodes) &&
  (m as DeclareFlowModel).nodes.length > 0;

/** The origin of the model a panel starts with: stored, else "loaded" for a given model or file. */
export function initialOrigin(params: { origin?: unknown; model?: unknown; doc?: unknown }): ModelOrigin {
  if (ORIGINS.includes(params.origin as ModelOrigin)) return params.origin as ModelOrigin;
  return hasNodes(params.model) || params.doc !== undefined ? "loaded" : "discovered";
}

const sameRun = (a: DiscoveryRun, b: DiscoveryRun) =>
  a.ocel === b.ocel && JSON.stringify(a.options) === JSON.stringify(b.options);

export function discoverButton(
  ran: DiscoveryRun | null,
  current: DiscoveryRun | null,
  origin: ModelOrigin,
  hasModel: boolean,
): "discover" | "rerun" | "up-to-date" {
  if (!hasModel || !ran || !current || origin === "loaded") return "discover";
  if (!sameRun(ran, current)) return "rerun";
  // An edited model is not what the run produced, so discovery stays available to replace or extend it.
  return origin === "discovered" ? "up-to-date" : "discover";
}

export function asksBeforeReplace(origin: ModelOrigin, hasModel: boolean): boolean {
  return hasModel && origin !== "discovered";
}

/** The view state for entering Edit: the full model is edited, so nothing stays projected away. */
export function viewStateForEdit(viewState: Record<string, unknown>): Record<string, unknown> {
  return { ...viewState, [OC_DECLARE_HIDDEN_ACTIVITIES_KEY]: [] };
}

/** Violations per constraint (`arcKey`), for the model with content `key` on the log `ocel`. */
export interface Evaluation {
  key: string;
  ocel: string;
  violations: Record<string, number>;
}

/** The model with violation marks, when the evaluation was made for exactly this model and log. */
export function withEvaluation(
  model: DeclareFlowModel,
  evaluation: Evaluation | null,
  ocel: string | undefined,
): DeclareFlowModel {
  if (!evaluation || evaluation.ocel !== ocel || evaluation.key !== contentKey(model)) {
    return evaluation ? { ...model, edges: model.edges.map((e) => ({ ...e, violation: undefined })) } : model;
  }
  const { arcs, edgeIds } = modelArcs(model);
  const byEdge = new Map(arcs.map((a, i) => [edgeIds[i], evaluation.violations[arcKey(a)]]));
  return { ...model, edges: model.edges.map((e) => ({ ...e, violation: byEdge.get(e.id) })) };
}

/** The discovered constraints the model does not have yet, for "Add to model". */
export function newArcs(model: DeclareFlowModel, found: OCDeclareArc[]): OCDeclareArc[] {
  const known = new Set(toArcs(model).map(arcKey));
  return found.filter((a) => !known.has(arcKey(a)));
}

const NO_NAMES: string[] = [];

/** The viewer's display settings in the panel's view state (same keys as `OCDeclareViewer`). */
export function viewSettings(viewState: Record<string, unknown>): {
  direction: "RIGHT" | "DOWN";
  textLabels: boolean;
  hiddenArcTypes: string[];
  hiddenObjectTypes: string[];
} {
  // A shared empty list keeps the props stable while nothing is hidden.
  const names = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : NO_NAMES;
  return {
    direction: viewState.layoutDirection === "DOWN" ? "DOWN" : "RIGHT",
    textLabels: viewState.showTextLabels === true,
    hiddenArcTypes: names(viewState.hiddenArcTypes),
    hiddenObjectTypes: names(viewState.hiddenObjectTypes),
  };
}
