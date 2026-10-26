import type { Edge, Node } from "@xyflow/react";
import {
  type ElementStyle,
  type Layout,
  type ModelLayoutRequest,
  modelLayoutRequest,
  modelSvg,
  type OcDeclareEdgeRef,
  type Point,
  rerouteModel,
  type StyleOverrides,
  type VizTransport,
} from "../viz";
import { flattenColor, mix } from "../dfg/util/colors";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH } from "./ActivityNode";
import { normalizeLabel } from "./arc-convert";
import {
  deformPoints,
  roundedPointsToSvgPath,
  selfLoopPoints,
  snapEndpointsToNodeBorders,
} from "./layout-util";
import {
  type DeclareEdge,
  type DeclareEdgeRoute,
  type DeclareFlowModel,
  type DeclareNode,
  modelArcs,
  nodeDisplayName,
  TEMPLATE_TO_ARC,
  templateCounts,
} from "./model";
import type { ActivityNodeData, ConstraintEdgeData, ConstraintLabel } from "./types";

type FlowNode = Node<ActivityNodeData, "activity">;
type FlowEdge = Edge<ConstraintEdgeData, "constraint">;

export type InvolvementsMap = {
  [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
};

/** rust4pm's `OCDeclareBuildOptions`, as far as the viewer sets them. */
export type DeclareBuildOptions = {
  direction: "leftright" | "topbottom";
  labels: "names" | "dots";
  merge_mirrored_arcs: boolean;
  reverse_backward_arcs: boolean;
  involvements?: Record<string, Record<string, { min: number; max: number }>>;
  extra_activities?: string[];
};

/** The build options for the view settings. Backward arcs always rank backwards, so EP/DP arcs
 *  do not turn the drawing around. */
export function declareBuildOptions(view: {
  direction: "RIGHT" | "DOWN";
  textLabels: boolean;
  combineEfEp: boolean;
}): DeclareBuildOptions {
  return {
    direction: view.direction === "DOWN" ? "topbottom" : "leftright",
    labels: view.textLabels ? "names" : "dots",
    merge_mirrored_arcs: view.combineEfEp,
    reverse_backward_arcs: true,
  };
}

/** The involvements rust4pm draws under each activity: those of visible object types an event
 *  can have at all. */
export function visibleInvolvements(
  involvements: InvolvementsMap | undefined,
  hiddenObjectTypes: Set<string>,
): Record<string, Record<string, { min: number; max: number }>> {
  const out: Record<string, Record<string, { min: number; max: number }>> = {};
  for (const [activity, perType] of Object.entries(involvements ?? {})) {
    const kept: Record<string, { min: number; max: number }> = {};
    for (const [objectType, c] of Object.entries(perType ?? {})) {
      if (c && c.max > 0 && !hiddenObjectTypes.has(objectType)) kept[objectType] = { min: c.min, max: c.max };
    }
    if (Object.keys(kept).length > 0) out[activity] = kept;
  }
  return out;
}

/** The drawing data of a model edge, without geometry. */
export function constraintData(e: DeclareEdge, index: number): ConstraintEdgeData {
  return {
    arcType: TEMPLATE_TO_ARC[e.template].arc_type,
    counts: templateCounts(e.template, e.cardinality) as [number, number | null],
    label: normalizeLabel(e.label),
    rawLabel: e.label,
    template: e.template,
    cardinality: e.cardinality,
    violation: e.violation,
    bundleIndex: 0,
    bundleTotal: 1,
    constraintIndex: index,
  };
}

/** One flow edge per graph edge, in graph order. Each takes the id of the model edge of its arc. An
 *  EP (DP) arc merged into it is its `pair.backward`. */
export function refsToFlowEdges(
  model: DeclareFlowModel,
  refs: OcDeclareEdgeRef[],
  edgeIds: string[],
): FlowEdge[] {
  const indexById = new Map(model.edges.map((e, i) => [e.id, i]));
  const out: FlowEdge[] = [];
  for (const ref of refs) {
    const forwardId = edgeIds[ref.arc];
    const fi = indexById.get(forwardId);
    if (fi === undefined) continue;
    const forward = model.edges[fi];
    const data = constraintData(forward, fi);
    const backwardId = ref.mirrored == null ? undefined : edgeIds[ref.mirrored];
    if (backwardId !== undefined) {
      const backward = model.edges[indexById.get(backwardId) ?? -1];
      data.arcType = data.arcType === "DF" ? "DFDP" : "EFEP";
      data.pair = { forward: forwardId, backward: backwardId };
      data.pairViolation = { forward: forward.violation, backward: backward?.violation };
    }
    out.push({ id: forwardId, source: forward.source, target: forward.target, type: "constraint", data });
  }
  return out;
}

/** Top-left and size of each model node the layout placed, by model node id. */
export function placeNodes(
  model: DeclareFlowModel,
  laid: { nodes: string[]; layout: Layout },
): Map<string, { position: Point; width: number; height: number }> {
  const indexOf = new Map(laid.nodes.map((name, i) => [name, i]));
  const out = new Map<string, { position: Point; width: number; height: number }>();
  for (const n of model.nodes) {
    const p = laid.layout.nodes[indexOf.get(nodeDisplayName(n)) ?? -1];
    if (!p) continue;
    const { width, height } = p.size;
    out.set(n.id, { position: { x: p.center.x - width / 2, y: p.center.y - height / 2 }, width, height });
  }
  return out;
}

export type EdgeRouteData = Pick<
  ConstraintEdgeData,
  "routedPoints" | "routedPath" | "labelAnchor" | "layoutSourcePos" | "layoutTargetPos"
>;

/** The geometry of each graph edge, by the model edge of its arc. Drag deformation measures from
 *  the node positions the routes were made for, which are the layout's. */
export function layoutRoutes(
  model: DeclareFlowModel,
  laid: Pick<ModelLayoutRequest<"oc_declare">, "nodes" | "edges">,
  edgeIds: string[],
  layout: Layout,
): Map<string, EdgeRouteData> {
  const placed = placeNodes(model, { nodes: laid.nodes, layout });
  const byId = new Map(model.edges.map((e) => [e.id, e]));
  const out = new Map<string, EdgeRouteData>();
  laid.edges.forEach((ref, i) => {
    const id = edgeIds[ref.arc];
    const e = byId.get(id);
    const route = layout.edges[i];
    if (!e || !route) return;
    // Without a line, the edge drops its old route and is drawn straight.
    if (route.points.length < 2) {
      out.set(id, {
        routedPoints: undefined,
        routedPath: undefined,
        labelAnchor: undefined,
        layoutSourcePos: undefined,
        layoutTargetPos: undefined,
      });
      return;
    }
    const sourcePos = placed.get(e.source)?.position;
    const targetPos = placed.get(e.target)?.position;
    if (!sourcePos || !targetPos) return;
    out.set(id, {
      routedPoints: route.points,
      routedPath: roundedPointsToSvgPath(route.points, 16),
      labelAnchor: route.label_anchor ?? undefined,
      layoutSourcePos: sourcePos,
      layoutTargetPos: targetPos,
    });
  });
  return out;
}

/** The routes to save in the model, by model edge. A collapsed EF/EP pair is drawn as its forward
 *  arc, so its backward arc gets the same route, reversed. */
export function persistedRoutes(
  edges: readonly { id: string; data?: ConstraintEdgeData }[],
): Map<string, DeclareEdgeRoute> {
  const out = new Map<string, DeclareEdgeRoute>();
  for (const e of edges) {
    const d = e.data;
    if (!d?.routedPoints || !d.layoutSourcePos || !d.layoutTargetPos) continue;
    out.set(e.id, {
      points: d.routedPoints,
      sourcePos: d.layoutSourcePos,
      targetPos: d.layoutTargetPos,
      labelAnchor: d.labelAnchor,
    });
    if (d.pair) {
      out.set(d.pair.backward, {
        points: [...d.routedPoints].reverse(),
        sourcePos: d.layoutTargetPos,
        targetPos: d.layoutSourcePos,
        labelAnchor: d.labelAnchor,
      });
    }
  }
  return out;
}

/** A node box on screen: top-left and size. */
export interface NodeBox {
  position: Point;
  width: number;
  height: number;
}

export const nodeBox = (n: {
  position: Point;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
}): NodeBox => ({
  position: n.position,
  width: n.width ?? n.measured?.width ?? ACT_NODE_WIDTH,
  height: n.height ?? n.measured?.height ?? ACT_NODE_HEIGHT,
});

const centreOf = (b: NodeBox): Point => ({ x: b.position.x + b.width / 2, y: b.position.y + b.height / 2 });

/** The polyline an edge shows: its route, bent along while its nodes moved since the layout, or a
 *  straight border-to-border line without one. `labelAnchor` is the layout's while nothing moved. */
export function edgePolyline(
  data: ConstraintEdgeData,
  src: NodeBox,
  tgt: NodeBox,
  selfLoop: boolean,
): { points: Point[]; labelAnchor?: Point; moved: boolean } {
  const sc = centreOf(src);
  const tc = centreOf(tgt);
  if (data.routedPoints && data.routedPoints.length >= 2 && data.layoutSourcePos && data.layoutTargetPos) {
    const sourceDelta = {
      x: src.position.x - data.layoutSourcePos.x,
      y: src.position.y - data.layoutSourcePos.y,
    };
    const targetDelta = {
      x: tgt.position.x - data.layoutTargetPos.x,
      y: tgt.position.y - data.layoutTargetPos.y,
    };
    const moved = [sourceDelta.x, sourceDelta.y, targetDelta.x, targetDelta.y].some((d) => Math.abs(d) > 0.5);
    if (!moved) return { points: data.routedPoints, labelAnchor: data.labelAnchor, moved };
    const deformed = deformPoints(data.routedPoints, sourceDelta, targetDelta);
    // A self-loop moves with its node. Snapping would pull its ends towards the centre.
    if (selfLoop) return { points: deformed, moved };
    return { points: snapEndpointsToNodeBorders(deformed, sc, tc, src.width / 2, src.height / 2), moved };
  }
  if (selfLoop) return { points: selfLoopPoints(sc, src.width / 2, src.height / 2), moved: false };
  return {
    points: snapEndpointsToNodeBorders([sc, tc], sc, tc, src.width / 2, src.height / 2),
    moved: false,
  };
}

/** The object types an edge names. An O2O association names both of its types. */
function involvedTypes(label: ConstraintLabel): Set<string> {
  const out = new Set<string>();
  for (const refs of [label.each, label.any, label.all]) {
    for (const r of refs) {
      if (r.type === "O2O" && r.first && r.second) {
        out.add(r.first);
        out.add(r.second);
      } else if (r.object_type) out.add(r.object_type);
    }
  }
  return out;
}

/** Whether the filters leave an edge visible: its arc type is shown and so is one of its types. */
export function edgeVisible(
  data: ConstraintEdgeData,
  hiddenArcTypes: ReadonlySet<string>,
  hiddenObjectTypes: ReadonlySet<string>,
): boolean {
  if (hiddenArcTypes.has(data.arcType)) return false;
  const types = involvedTypes(data.label);
  return types.size === 0 || [...types].some((t) => !hiddenObjectTypes.has(t));
}

/** One decimal, so a handful of violations does not print as "0%". Exact 0 and 100 stay short. */
function formatViolationPct(pct: number): string {
  if (pct === 0 || pct === 100) return `${pct}%`;
  return `${pct.toFixed(1)}%`;
}

/** Point and tangent angle at arc-length fraction `t` of a polyline, shifted by `offsetPx` along it. */
export function placeOnCurve(points: Point[], t: number, offsetPx = 0): Point & { angle: number } {
  if (points.length < 2) return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, angle: 0 };
  const segs: { dx: number; dy: number; len: number; acc: number }[] = [];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    acc += len;
    segs.push({ dx, dy, len, acc });
  }
  if (acc === 0) return { x: points[0].x, y: points[0].y, angle: 0 };
  const target = Math.min(Math.max(t * acc + offsetPx, 0), acc);
  let startAcc = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (target <= seg.acc || i === segs.length - 1) {
      const st = seg.len > 0 ? (target - startAcc) / seg.len : 0;
      return {
        x: points[i].x + st * seg.dx,
        y: points[i].y + st * seg.dy,
        angle: Math.atan2(seg.dy, seg.dx) * (180 / Math.PI),
      };
    }
    startAcc = seg.acc;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

function violationColor(pct: number): string {
  return pct < 10 ? "#16a34a" : pct < 50 ? "#d97706" : "#dc2626";
}

export const BADGE_HEIGHT = 13;
export const BADGE_FONT_SIZE = 9;
const BADGE_GAP = 4;

/** A violation badge, centred at `x`/`y` in flow coordinates. */
export interface ViolationBadge {
  text: string;
  color: string;
  x: number;
  y: number;
  width: number;
  title?: string;
  /** Dimmed with its arc by focus. */
  dim?: boolean;
}

/** At 9px bold tabular digits, plus padding. */
function badgeWidth(text: string): number {
  return text.length * 5.4 + 8;
}

/** The arc length along `points` of the point on them nearest `p`. */
function lengthAt(points: Point[], p: Point): number {
  let best = Number.POSITIVE_INFINITY;
  let at = 0;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const dx = points[i].x - a.x;
    const dy = points[i].y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const u = len > 0 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len), 0), 1) : 0;
    const d = (a.x + u * dx - p.x) ** 2 + (a.y + u * dy - p.y) ** 2;
    if (d < best) {
      best = d;
      at = acc + u * len;
    }
    acc += len;
  }
  return at;
}

/** An evaluated arc's violation badges, on the arc itself, next to what sits at its middle: its
 *  dots, or its text label at `at`, `half` long each way. A collapsed EF/EP pair puts its forward
 *  badge after it and its backward one before it. Upright, so they stay readable on vertical
 *  segments. */
export function violationBadges(
  data: ConstraintEdgeData,
  points: Point[],
  middle: { half: number; at?: Point },
): ViolationBadge[] {
  const centre = middle.at ? lengthAt(points, middle.at) : undefined;
  const badge = (fraction: unknown, side: 1 | -1, title: string): ViolationBadge[] => {
    if (typeof fraction !== "number") return [];
    const pct = fraction * 100;
    const text = formatViolationPct(pct);
    const width = badgeWidth(text);
    const offset = side * (middle.half + BADGE_GAP + width / 2);
    const { x, y } =
      centre === undefined ? placeOnCurve(points, 0.5, offset) : placeOnCurve(points, 0, centre + offset);
    return [{ text, color: violationColor(pct), x, y, width, title }];
  };
  if (data.pair) {
    return [
      ...badge(data.pairViolation?.forward, 1, "Forward (EF/DF) violation fraction"),
      ...badge(data.pairViolation?.backward, -1, "Backward (EP/DP) violation fraction"),
    ];
  }
  return badge(data.violation, 1, "Violation fraction");
}

const svgNumber = (n: number) => n.toFixed(2);
const xmlText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The badges as SVG pills, as the screen draws them. */
function badgesSvg(badges: ViolationBadge[]): string {
  const pill = (b: ViolationBadge) =>
    `<g${b.dim ? ' opacity="0.1"' : ""}><rect x="${svgNumber(b.x - b.width / 2)}" y="${svgNumber(b.y - BADGE_HEIGHT / 2)}" width="${svgNumber(b.width)}" height="${BADGE_HEIGHT}" rx="4" fill="${b.color}" stroke="#ffffff" stroke-width="1.5"/><text x="${svgNumber(b.x)}" y="${svgNumber(b.y + 3.2)}" text-anchor="middle" font-size="${BADGE_FONT_SIZE}" font-weight="700" fill="#ffffff">${xmlText(b.text)}</text></g>`;
  return `<g data-violation-badges="">${badges.map(pill).join("")}</g>\n`;
}

/** On-screen state the export carries over. `nodes`/`edges` are the flow elements as shown,
 *  `hidden` flags included. */
export interface DeclareScreenState {
  model: DeclareFlowModel;
  nodes: FlowNode[];
  edges: FlowEdge[];
  options: DeclareBuildOptions;
  hiddenArcTypes: Set<string>;
  hiddenObjectTypes: Set<string>;
  focusedNodeId: string | null;
  involvements?: InvolvementsMap;
  /** A node's color where the host's differs from rust4pm's default. */
  hostColor?: (name: string, kind: DeclareNode["kind"]) => string | undefined;
  /** The violation badges as drawn, drawn over the arcs. */
  badges?: ViolationBadge[];
}

/** The flow node drawn for each graph node (`names` in graph order). */
function graphNodes(model: DeclareFlowModel, names: string[], nodes: FlowNode[]): (FlowNode | undefined)[] {
  const flowById = new Map(nodes.map((n) => [n.id, n]));
  const byName = new Map<string, FlowNode>();
  for (const m of model.nodes) {
    const f = flowById.get(m.id);
    const name = nodeDisplayName(m);
    if (f && !byName.has(name)) byName.set(name, f);
  }
  return names.map((name) => byName.get(name));
}

/** The on-screen centre of each graph node, for re-routing. */
export function nodeCentres(model: DeclareFlowModel, names: string[], nodes: FlowNode[]): Point[] {
  return graphNodes(model, names, nodes).map((n) => (n ? centreOf(nodeBox(n)) : { x: 0, y: 0 }));
}

/** Hidden elements get `opacity: 0`, focus dims the rest as on screen and host colors tint the nodes. */
export function exportOverrides(
  req: Pick<ModelLayoutRequest<"oc_declare">, "nodes" | "edges">,
  edgeIds: string[],
  s: DeclareScreenState,
): StyleOverrides {
  const overrides: { nodes: Record<number, ElementStyle>; edges: Record<number, ElementStyle> } = {
    nodes: {},
    edges: {},
  };
  graphNodes(s.model, req.nodes, s.nodes).forEach((n, i) => {
    if (!n) return;
    if (n.hidden) {
      overrides.nodes[i] = { opacity: 0 };
      return;
    }
    const style: ElementStyle = {};
    const color = s.hostColor?.(n.data.label, (n.data.kind as DeclareNode["kind"] | undefined) ?? "activity");
    if (color) {
      const hex = flattenColor(color);
      style.fill = mix(hex, "#ffffff", 0.85);
      style.stroke = hex;
    }
    if (s.focusedNodeId !== null && n.id !== s.focusedNodeId) style.opacity = 0.4;
    if (Object.keys(style).length > 0) overrides.nodes[i] = style;
  });
  const flowById = new Map(s.edges.map((e) => [e.id, e]));
  req.edges.forEach((ref, i) => {
    const e = flowById.get(edgeIds[ref.arc]);
    if (!e?.data) return;
    if (e.hidden || !edgeVisible(e.data, s.hiddenArcTypes, s.hiddenObjectTypes)) {
      overrides.edges[i] = { opacity: 0 };
      return;
    }
    const style: ElementStyle = {};
    const focus = s.focusedNodeId;
    if (focus !== null && e.source !== focus && e.target !== focus) style.opacity = 0.1;
    if (Object.keys(style).length > 0) overrides.edges[i] = style;
  });
  return overrides;
}

/** The on-screen drawing as rust4pm draws it: the model's graph over the current node positions
 *  and edge polylines. Null for an empty model. */
export async function declareSvg(viz: VizTransport, s: DeclareScreenState): Promise<string | null> {
  const { arcs, edgeIds, extraActivities } = modelArcs(s.model);
  if (arcs.length === 0 && extraActivities.length === 0) return null;
  const options = { ...s.options, extra_activities: extraActivities };
  const req = await modelLayoutRequest(viz, "oc_declare", arcs, options);
  // Re-routing gives a layout of the current graph over the shown centres. Its polylines are then
  // replaced by the shown ones, which a drag in progress has bent.
  const centres = nodeCentres(s.model, req.nodes, s.nodes);
  const layout = await rerouteModel(viz, req, centres);
  layout.nodes = layout.nodes.map((n, i) => ({ ...n, center: centres[i] }));
  const flowNodes = new Map(s.nodes.map((n) => [n.id, n]));
  const flowEdges = new Map(s.edges.map((e) => [e.id, e]));
  req.edges.forEach((ref, i) => {
    const e = flowEdges.get(edgeIds[ref.arc]);
    const src = e && flowNodes.get(e.source);
    const tgt = e && flowNodes.get(e.target);
    if (!e?.data || !src || !tgt) return;
    const shown = edgePolyline(e.data, nodeBox(src), nodeBox(tgt), e.source === e.target);
    layout.edges[i] = { ...layout.edges[i], points: shown.points, label_anchor: shown.labelAnchor ?? null };
  });
  const svg = await modelSvg(viz, "oc_declare", arcs, layout, {
    options: { ...options, involvements: visibleInvolvements(s.involvements, s.hiddenObjectTypes) },
    overrides: exportOverrides(req, edgeIds, s),
  });
  if (!s.badges?.length) return svg;
  const end = svg.lastIndexOf("</svg>");
  return `${svg.slice(0, end)}${badgesSvg(s.badges)}${svg.slice(end)}`;
}
