import { pointAlong } from "../ocel-type-graph/type-graph";
import {
  type Dfg,
  type DfgEdgeRef,
  type DfgNodeRef,
  type ElementStyle,
  type Layout,
  layoutModel,
  type ModelLayoutRequest,
  modelSvg,
  type OcDfg,
  type OcdfgNodeRef,
  type Point,
  rerouteModel,
  type Size,
  type StyleOverrides,
  type VizTransport,
} from "../viz";
import { flattenColor, mix } from "./util/colors";
import {
  computeMetricValue,
  DFG_END_ID,
  DFG_START_ID,
  type DfgArc,
  type DfgArcDuration,
  type DfgArcKind,
  type DfgCoverage,
  type DfgMetric,
  formatMetricValue,
  isPerformanceMetric,
} from "./util/dfg-model";
import { durationColor } from "./util/duration";
import type { DfArcDuration, DfPerformance, OcelDfPerformance } from "./util/performance-types";

/** What a DFG view shows: a DFG, or an OC-DFG drawn for the object types in `types`. */
export type DfgSource = { kind: "dfg"; data: Dfg } | { kind: "ocdfg"; data: OcDfg; types: string[] };

/** The model rust4pm lays out: the shown part of the source, and an OC-DFG's object types in
 *  group order. */
export type ShownDfg = DfgSource;

export type DfgRouting = "diagonal" | "orthogonal";

export function arcKey(group: string | undefined, kind: DfgArcKind, from: string, to: string): string {
  return [group ?? "", kind, from, to].join("\u0000");
}

const durationOf = (d: DfArcDuration): DfgArcDuration => ({
  mean_ms: d.mean_ms,
  median_ms: d.median_ms,
  p90_ms: d.p90_ms,
  min_ms: d.min_ms,
  max_ms: d.max_ms,
});

function arcsOf(dfg: Dfg, group: string | undefined, performance: DfArcDuration[] | undefined): DfgArc[] {
  const durations = new Map((performance ?? []).map((d) => [`${d.source}\u0000${d.target}`, d]));
  const arcs: DfgArc[] = [];
  for (const [[from, to], count] of dfg.directly_follows_relations) {
    const d = durations.get(`${from}\u0000${to}`);
    arcs.push({
      key: arcKey(group, "follows", from, to),
      kind: "follows",
      from,
      to,
      count,
      group,
      duration: d ? durationOf(d) : undefined,
    });
  }
  for (const [to, count] of Object.entries(dfg.start_activities)) {
    arcs.push({
      key: arcKey(group, "start", DFG_START_ID, to),
      kind: "start",
      from: DFG_START_ID,
      to,
      count,
      group,
    });
  }
  for (const [from, count] of Object.entries(dfg.end_activities)) {
    arcs.push({
      key: arcKey(group, "end", from, DFG_END_ID),
      kind: "end",
      from,
      to: DFG_END_ID,
      count,
      group,
    });
  }
  return arcs;
}

/** Every arc of a DFG, with its durations. */
export function caseArcs(dfg: Dfg, performance?: DfPerformance): DfgArc[] {
  return arcsOf(dfg, undefined, performance?.arcs);
}

/** Every arc of the given object types' DFGs, grouped by object type. */
export function ocArcs(ocdfg: OcDfg, types: string[], performance?: OcelDfPerformance): DfgArc[] {
  return types.flatMap((t) => {
    const dfg = ocdfg.object_type_to_dfg[t];
    return dfg ? arcsOf(dfg, t, performance?.arcs_per_object_type[t]) : [];
  });
}

/** How often each activity occurred in the given object types' DFGs, summed. */
export function ocActivityCounts(ocdfg: OcDfg, types: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of types) {
    for (const [act, c] of Object.entries(ocdfg.object_type_to_dfg[t]?.activities ?? {})) {
      out[act] = (out[act] ?? 0) + c;
    }
  }
  return out;
}

/** Edge cap for the initial view (across all groups), so dense graphs do not overload. The slider
 *  can widen past it. */
const MAX_INITIAL_EDGES = 25;

export interface ArcSelection {
  kept: DfgArc[];
  /** The top-N per group in effect. */
  slider: number;
  coverage: DfgCoverage;
}

const isTerminal = (id: string) => id === DFG_START_ID || id === DFG_END_ID;

/** The `slider` most frequent arcs of each group. Without a user choice, the largest N whose union
 *  stays within {@link MAX_INITIAL_EDGES} (at least 1, so every group shows an arc). */
export function selectArcs(
  arcs: DfgArc[],
  userSlider: number | null,
  activityCounts: Record<string, number>,
): ArcSelection {
  const byGroup = new Map<string, DfgArc[]>();
  for (const a of arcs) {
    const list = byGroup.get(a.group ?? "") ?? [];
    list.push(a);
    byGroup.set(a.group ?? "", list);
  }
  for (const list of byGroup.values()) list.sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
  const sizes = [...byGroup.values()].map((l) => l.length);
  const maxGroupSize = Math.max(1, ...sizes);

  let slider: number;
  if (userSlider === null) {
    const unionAt = (n: number) => sizes.reduce((s, len) => s + Math.min(n, len), 0);
    let seed = 1;
    for (let n = 1; n <= maxGroupSize; n++) {
      if (n > 1 && unionAt(n) > MAX_INITIAL_EDGES) break;
      seed = n;
    }
    slider = seed;
  } else {
    slider = userSlider;
  }
  const n = Math.min(Math.max(0, slider), maxGroupSize);
  const kept = [...byGroup.values()].flatMap((list) => list.slice(0, n));

  const keptActivities = new Set<string>();
  for (const a of kept) {
    for (const id of [a.from, a.to]) if (!isTerminal(id)) keptActivities.add(id);
  }
  const totalActs = Object.keys(activityCounts).length;
  const totalEvents = Object.values(activityCounts).reduce((s, v) => s + v, 0);
  const shownEvents = [...keptActivities].reduce((s, k) => s + (activityCounts[k] ?? 0), 0);
  const totalArcCount = arcs.reduce((s, a) => s + a.count, 0);
  const shownArcCount = kept.reduce((s, a) => s + a.count, 0);
  const pct = (all: boolean, shown: number, total: number) =>
    total > 0 ? (all ? 100 : Math.min(99, Math.round((100 * shown) / total))) : 0;
  return {
    kept,
    slider,
    coverage: {
      edges: {
        shown: kept.length,
        total: arcs.length,
        sliderMax: maxGroupSize,
        pct: pct(kept.length >= arcs.length, shownArcCount, totalArcCount),
      },
      activities: {
        shown: keptActivities.size,
        total: totalActs,
        pct: pct(keptActivities.size >= totalActs, shownEvents, totalEvents),
      },
    },
  };
}

function dfgOf(arcs: DfgArc[], activities: Record<string, number>): Dfg {
  const out: Dfg = {
    activities: {},
    directly_follows_relations: [],
    start_activities: {},
    end_activities: {},
  };
  const touch = (act: string) => {
    out.activities[act] = activities[act] ?? 0;
  };
  for (const a of arcs) {
    if (a.kind === "follows") {
      out.directly_follows_relations.push([[a.from, a.to], a.count]);
      touch(a.from);
      touch(a.to);
    } else if (a.kind === "start") {
      out.start_activities[a.to] = a.count;
      touch(a.to);
    } else {
      out.end_activities[a.from] = a.count;
      touch(a.from);
    }
  }
  return out;
}

/** The model of the kept arcs: their activities, relations and start and end counts. An object
 *  type without kept arcs is left out, so it draws no terminals. */
export function shownModel(source: DfgSource, kept: DfgArc[]): ShownDfg {
  if (source.kind === "dfg") return { kind: "dfg", data: dfgOf(kept, source.data.activities) };
  const object_type_to_dfg: Record<string, Dfg> = {};
  const types: string[] = [];
  for (const t of source.types) {
    const dfg = source.data.object_type_to_dfg[t];
    const mine = kept.filter((a) => a.group === t);
    if (!dfg || mine.length === 0) continue;
    object_type_to_dfg[t] = dfgOf(mine, dfg.activities);
    types.push(t);
  }
  return { kind: "ocdfg", data: { object_type_to_dfg }, types };
}

/** How often the source of an arc occurred, for `pct_source`: the activity's count, or for a start
 *  arc all start arcs of its group. */
export function sourceCounter(
  arcs: DfgArc[],
  activityCounts: Record<string, number>,
): (arc: DfgArc) => number {
  const starts = new Map<string, number>();
  for (const a of arcs) {
    if (a.kind === "start") starts.set(a.group ?? "", (starts.get(a.group ?? "") ?? 0) + a.count);
  }
  return (a) => (a.kind === "start" ? (starts.get(a.group ?? "") ?? 0) : (activityCounts[a.from] ?? 0));
}

/** The label, line width and heatmap color an arc is drawn with. */
export interface ArcLook {
  label: string;
  width: number;
  heat?: string;
}

/** rust4pm's line width for a count: `1.5 + 4.5 * sqrt(count / max)`. */
export const widthFromCount = (count: number, max: number) =>
  1.5 + 4.5 * Math.sqrt(Math.min(1, Math.max(0, count / Math.max(1, max))));

/** Each arc's label and width under `metric`. Counts are drawn as rust4pm draws them. A percentage
 *  or duration spreads the widths over its range, and with `heatmap` colors durations. An arc
 *  without a value (e.g., a start arc's duration) gets no label. */
export function arcLooks(
  arcs: DfgArc[],
  metric: DfgMetric,
  sourceCount: (arc: DfgArc) => number,
  opts: { formatDuration?: (ms: number) => string; heatmap?: boolean } = {},
): Map<string, ArcLook> {
  const values = new Map<string, number>();
  for (const a of arcs) {
    const v = computeMetricValue(a, metric, sourceCount(a));
    if (v != null) values.set(a.key, v);
  }
  const all = [...values.values()];
  const lo = all.length > 0 ? Math.min(...all) : 0;
  const hi = all.length > 0 ? Math.max(...all) : 1;
  const maxCount = Math.max(1, ...arcs.map((a) => a.count));
  const perf = isPerformanceMetric(metric);
  const out = new Map<string, ArcLook>();
  for (const a of arcs) {
    const v = values.get(a.key);
    if (v == null) {
      out.set(a.key, { label: "", width: 1.5 });
      continue;
    }
    const label = formatMetricValue(v, metric, opts.formatDuration);
    if (metric === "count") {
      out.set(a.key, { label, width: widthFromCount(a.count, maxCount) });
      continue;
    }
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    const heat = opts.heatmap && perf && a.duration != null ? durationColor(t) : undefined;
    out.set(a.key, { label, width: 1.5 + 4.5 * Math.sqrt(t), heat });
  }
  return out;
}

const nodeRef = (id: string): DfgNodeRef =>
  id === DFG_START_ID
    ? { kind: "start" }
    : id === DFG_END_ID
      ? { kind: "end" }
      : { kind: "activity", name: id };

export interface DfgView {
  direction: "TB" | "LR";
  routing?: DfgRouting;
}

/** rust4pm's build options (`DfgBuildOptions` / `OcdfgBuildOptions`): the view, the object types
 *  in group order, each activity's count under its name, and each arc's label and width. */
export function dfgBuildOptions(
  shown: ShownDfg,
  kept: DfgArc[],
  looks: Map<string, ArcLook>,
  activityCounts: Record<string, number>,
  view: DfgView,
): Record<string, unknown> {
  const edges = kept.map((a) => {
    const look = looks.get(a.key);
    const annotation = { label: look?.label ?? "", thickness: look?.width ?? 1.5 };
    const ends = [nodeRef(a.from), nodeRef(a.to)];
    return [shown.kind === "dfg" ? ends : [a.group ?? "", ...ends], annotation];
  });
  const activities = new Set<string>();
  const dfgs = shown.kind === "dfg" ? [shown.data] : Object.values(shown.data.object_type_to_dfg);
  for (const d of dfgs) for (const act of Object.keys(d.activities)) activities.add(act);
  const nodes = [...activities]
    .sort()
    .map((name) => [{ kind: "activity", name }, { label: (activityCounts[name] ?? 0).toLocaleString("en") }]);
  return {
    direction: view.direction === "LR" ? "leftright" : "topbottom",
    ...(shown.kind === "ocdfg" ? { object_types: shown.types } : {}),
    annotations: { nodes, edges },
    layout_patch: view.routing ? { routing: { style: view.routing } } : null,
  };
}

export type DfgNodeKind = "start" | "end" | "activity";

/** A graph node: an activity, or a START/END terminal (of object type `group` in an OC-DFG). */
export interface DfgGraphNode {
  id: string;
  kind: DfgNodeKind;
  /** The activity, or the object type of an OC-DFG terminal. */
  name: string;
  group?: string;
}

/** A graph edge, by the key of its arc and the ids of its nodes. */
export interface DfgGraphEdge {
  key: string;
  source: string;
  target: string;
  group?: string;
}

/** A shown model laid out. `request` re-routes it after a drag. There is none without rust4pm. */
export interface LaidDfg {
  nodes: DfgGraphNode[];
  edges: DfgGraphEdge[];
  layout: Layout;
  request?: ModelLayoutRequest<"dfg"> | ModelLayoutRequest<"ocdfg">;
}

const terminalId = (kind: "start" | "end", group?: string) =>
  group === undefined ? kind : `${kind}:${group}`;
const activityId = (name: string) => `act:${name}`;

export function graphNode(ref: DfgNodeRef | OcdfgNodeRef): DfgGraphNode {
  if (ref.kind === "activity") return { id: activityId(ref.name), kind: "activity", name: ref.name };
  const group = "name" in ref ? ref.name : undefined;
  return { id: terminalId(ref.kind, group), kind: ref.kind, name: group ?? "", group };
}

export function graphEdge(ref: DfgEdgeRef, group?: string): DfgGraphEdge {
  switch (ref.kind) {
    case "follows":
      return {
        key: arcKey(group, "follows", ref.from, ref.to),
        source: activityId(ref.from),
        target: activityId(ref.to),
        group,
      };
    case "start":
      return {
        key: arcKey(group, "start", DFG_START_ID, ref.activity),
        source: terminalId("start", group),
        target: activityId(ref.activity),
        group,
      };
    case "end":
      return {
        key: arcKey(group, "end", ref.activity, DFG_END_ID),
        source: activityId(ref.activity),
        target: terminalId("end", group),
        group,
      };
  }
}

/** Lay the shown model out with rust4pm, or without a transport stack its nodes in a column. */
export async function layoutDfg(
  viz: VizTransport | undefined,
  shown: ShownDfg,
  options: Record<string, unknown>,
  kept: DfgArc[],
): Promise<LaidDfg> {
  if (!viz) return columnLayout(kept);
  if (shown.kind === "dfg") {
    const laid = await layoutModel(viz, "dfg", shown.data, options);
    return {
      nodes: laid.nodes.map(graphNode),
      edges: laid.edges.map((e) => graphEdge(e)),
      layout: laid.layout,
      request: laid,
    };
  }
  const laid = await layoutModel(viz, "ocdfg", shown.data, options);
  return {
    nodes: laid.nodes.map(graphNode),
    edges: laid.edges.map((e) => graphEdge(e.edge, e.object_type)),
    layout: laid.layout,
    request: laid,
  };
}

/** rust4pm's DFG box sizes. */
const TERMINAL_SIZE: Size = { width: 80, height: 36 };
const activitySize = (name: string): Size => ({
  width: Math.min(260, Math.max(120, 8 * Array.from(name).length + 24)),
  height: 52,
});
const COLUMN_GAP = 40;

/** The engine-less fallback: the arcs' nodes in one column, starts first and ends last, with
 *  straight edges. */
export function columnLayout(kept: DfgArc[]): LaidDfg {
  const nodes = new Map<string, DfgGraphNode>();
  const endpoint = (id: string, group?: string): DfgGraphNode => {
    if (id === DFG_START_ID || id === DFG_END_ID) {
      const kind = id === DFG_START_ID ? "start" : "end";
      return { id: terminalId(kind, group), kind, name: group ?? "", group };
    }
    return { id: activityId(id), kind: "activity", name: id };
  };
  const edges: DfgGraphEdge[] = kept.map((a) => {
    const [s, t] = [endpoint(a.from, a.group), endpoint(a.to, a.group)];
    for (const n of [s, t]) if (!nodes.has(n.id)) nodes.set(n.id, n);
    return { key: a.key, source: s.id, target: t.id, group: a.group };
  });
  const rank = (n: DfgGraphNode) => (n.kind === "start" ? 0 : n.kind === "activity" ? 1 : 2);
  const ordered = [...nodes.values()].sort((a, b) => rank(a) - rank(b));
  const sizes = ordered.map((n) => (n.kind === "activity" ? activitySize(n.name) : TERMINAL_SIZE));
  const centers: Point[] = [];
  let y = 0;
  ordered.forEach((_, i) => {
    centers.push({ x: 0, y: y + sizes[i].height / 2 });
    y += sizes[i].height + COLUMN_GAP;
  });
  const index = new Map(ordered.map((n, i) => [n.id, i]));
  const routes = edges.map((e) => {
    const [s, t] = [index.get(e.source) ?? 0, index.get(e.target) ?? 0];
    const [cs, ct] = [centers[s], centers[t]];
    if (s === t) {
      const right = cs.x + sizes[s].width / 2;
      return [
        { x: right, y: cs.y - 8 },
        { x: right + 30, y: cs.y - 8 },
        { x: right + 30, y: cs.y + 8 },
        { x: right, y: cs.y + 8 },
      ];
    }
    const down = ct.y > cs.y ? 1 : -1;
    return [
      { x: cs.x, y: cs.y + (down * sizes[s].height) / 2 },
      { x: ct.x, y: ct.y - (down * sizes[t].height) / 2 },
    ];
  });
  const maxWidth = Math.max(0, ...sizes.map((s) => s.width));
  return {
    nodes: ordered,
    edges,
    layout: {
      bounds: {
        min: { x: -maxWidth / 2, y: 0 },
        max: { x: maxWidth / 2 + 30, y: Math.max(0, y - COLUMN_GAP) },
      },
      nodes: centers.map((center, i) => ({ center, size: sizes[i], order: 0, rank: i })),
      edges: routes.map((points) => ({ kind: "direct", points, label_anchor: null })),
      layer_count: ordered.length,
      reversed: [],
      stats: { dummy_count: 0 },
    },
  };
}

/** Re-route the edges over new node centres (one per graph node). Null without rust4pm. */
export async function rerouteDfg(
  viz: VizTransport | undefined,
  laid: LaidDfg,
  centres: Point[],
): Promise<Layout | null> {
  if (!viz || !laid.request) return null;
  return rerouteModel(viz, laid.request as ModelLayoutRequest<"dfg">, centres);
}

/** An edge's route and the node centres it was made for. */
export interface EdgeRoute {
  points: Point[];
  labelAnchor?: Point;
  sourceCentre: Point;
  targetCentre: Point;
}

/** The route of each graph edge in `layout`. */
export function edgeRoutes(laid: Pick<LaidDfg, "nodes" | "edges">, layout: Layout): EdgeRoute[] {
  const index = new Map(laid.nodes.map((n, i) => [n.id, i]));
  return laid.edges.map((e, i) => {
    const route = layout.edges[i];
    return {
      points: route?.points ?? [],
      labelAnchor: route?.label_anchor ?? undefined,
      sourceCentre: layout.nodes[index.get(e.source) ?? -1]?.center ?? { x: 0, y: 0 },
      targetCentre: layout.nodes[index.get(e.target) ?? -1]?.center ?? { x: 0, y: 0 },
    };
  });
}

/** The polyline an edge shows once its nodes moved since the route was made: each point moves by a
 *  blend of the two moves, so the ends stay on their (moved) borders and a self-loop moves along. */
export function shownRoute(
  route: EdgeRoute,
  source: Point,
  target: Point,
): { points: Point[]; labelAnchor?: Point; moved: boolean } {
  const sd = { x: source.x - route.sourceCentre.x, y: source.y - route.sourceCentre.y };
  const td = { x: target.x - route.targetCentre.x, y: target.y - route.targetCentre.y };
  const moved = [sd.x, sd.y, td.x, td.y].some((d) => Math.abs(d) > 0.5);
  if (!moved) return { points: route.points, labelAnchor: route.labelAnchor, moved };
  const last = Math.max(1, route.points.length - 1);
  const points = route.points.map((p, i) => {
    const t = i / last;
    return { x: p.x + (1 - t) * sd.x + t * td.x, y: p.y + (1 - t) * sd.y + t * td.y };
  });
  const labelAnchor = route.labelAnchor
    ? { x: route.labelAnchor.x + (sd.x + td.x) / 2, y: route.labelAnchor.y + (sd.y + td.y) / 2 }
    : undefined;
  return { points, labelAnchor, moved };
}

/** Where an edge's label goes: its anchor, else the middle of its polyline, as rust4pm draws it. */
export const labelPoint = (points: Point[], anchor?: Point): Point | undefined =>
  anchor ?? pointAlong(points, 0.5);

/** On-screen colors the export carries over. Each returns a color only where the screen differs
 *  from rust4pm's drawing. */
export interface DfgHostStyle {
  activityColor?: (activity: string) => string | undefined;
  typeColor?: (objectType: string) => string | undefined;
  heat?: (arcKey: string) => string | undefined;
}

/** Host activity colors tint the activity boxes, a host object-type color its terminals and arcs,
 *  and the heatmap colors arcs. */
export function dfgOverrides(laid: Pick<LaidDfg, "nodes" | "edges">, host: DfgHostStyle): StyleOverrides {
  const nodes: Record<number, ElementStyle> = {};
  laid.nodes.forEach((n, i) => {
    const color = n.kind === "activity" ? host.activityColor?.(n.name) : n.group && host.typeColor?.(n.group);
    if (!color) return;
    const hex = flattenColor(color);
    nodes[i] =
      n.kind === "activity" ? { fill: mix(hex, "#ffffff", 0.85), stroke: hex } : { fill: hex, stroke: hex };
  });
  const edges: Record<number, ElementStyle> = {};
  laid.edges.forEach((e, i) => {
    const color = host.heat?.(e.key) ?? (e.group ? host.typeColor?.(e.group) : undefined);
    if (color) edges[i] = { stroke: flattenColor(color) };
  });
  return { nodes, edges };
}

/** rust4pm's drawing of the shown model over the on-screen node centres and edge polylines. */
export async function dfgSvg(
  viz: VizTransport,
  shown: ShownDfg,
  options: Record<string, unknown>,
  laid: LaidDfg,
  screen: { centres: Point[]; edges: { points: Point[]; labelAnchor?: Point }[] },
  overrides: StyleOverrides,
): Promise<string> {
  const layout: Layout = {
    ...laid.layout,
    nodes: laid.layout.nodes.map((n, i) => ({ ...n, center: screen.centres[i] ?? n.center })),
    edges: laid.layout.edges.map((e, i) => ({
      ...e,
      points: screen.edges[i]?.points ?? e.points,
      label_anchor: screen.edges[i]?.labelAnchor ?? null,
    })),
  };
  return shown.kind === "dfg"
    ? modelSvg(viz, "dfg", shown.data, layout, { options, overrides })
    : modelSvg(viz, "ocdfg", shown.data, layout, { options, overrides });
}
