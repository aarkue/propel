/** Converts the live on-screen OC-Declare graph into a generic `StyledGraph` for the `export_graph_svg`
 *  Rust binding; geometry/drag-deform math mirrors `ConstraintEdge.tsx` so the export matches pixel-for-pixel. */

import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH, PREFIX } from "./ActivityNode";
import type { DeclareNode } from "./model";
import { MARKER_COLOR } from "./ConstraintEdge";
import { exportBackgroundHex, flattenColor } from "../dfg/util/colors";
import { buildStyledGraph } from "../graph-svg/build-styled-graph";
import { deformPoints, snapEndpointsToNodeBorders } from "./layout-util";
import type { ActivityNodeData, ConstraintEdgeData } from "./types";
import type { ObjectTypeAssociation as ObjTA } from "./index";
import type { ColorResolver } from "./VizContext";
import type {
  EdgeDot,
  EdgeMarker,
  MarkingGroup,
  StyledEdge,
  StyledGraph,
  StyledNode,
} from "../graph-svg/styled-graph";

type Pt = { x: number; y: number };
type ActivityNode = {
  id: string;
  position: Pt;
  measured?: { width?: number; height?: number };
  data: ActivityNodeData;
};
type ConstraintEdge = { source: string; target: string; data?: ConstraintEdgeData };

function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

function nodeToStyled(
  n: ActivityNode,
  activityColor: ColorResolver,
  objectTypeColor: ColorResolver,
  bg: string,
): StyledNode {
  const w = n.measured?.width ?? ACT_NODE_WIDTH;
  const h = n.measured?.height ?? ACT_NODE_HEIGHT;
  // Object endpoints (`<init>`/`<exit>`) take the object-type color, prefixed label and a
  // dashed border, exactly like `ActivityNode`.
  const kind = (n.data.kind as DeclareNode["kind"] | undefined) ?? "activity";
  const isObject = kind !== "activity";
  const colorOf = isObject ? objectTypeColor : activityColor;
  const colorBase = colorOf(n.data.label, "normal");
  // Flattened to plain hex: the "foreground" mode is a color-mix()/CanvasText expression,
  // which SVG consumers outside the browser don't resolve.
  const colorFg = flattenColor(colorOf(n.data.label, "foreground"), bg);
  const display = `${PREFIX[kind]}${n.data.label}`;
  // Mirror the on-screen `MultiDot` clusters: r 4.33 dots overlapped at step 3.1, always ringed
  // (`border()` = 65% color toward CanvasText), dashed ring for optional (min 0) involvements.
  const marking: MarkingGroup[] = n.data.objectTypes.map((t) => {
    const color = objectTypeColor(t.name);
    return {
      kind: "dot" as const,
      color,
      count: t.max > 1 ? 3 : 1,
      dashed: t.min === 0,
      radius: 4.33,
      step: 3.1,
      stroke: flattenColor(`color-mix(in srgb, ${color} 65%, CanvasText)`, bg),
    };
  });
  // On-screen layout: label + dot strip center together as one 29px block (label 7px above center, strip 8.5px below).
  const hasDots = marking.length > 0;
  const sw = 2;
  return {
    cx: n.position.x + w / 2,
    cy: n.position.y + h / 2,
    // Inset by the stroke: CSS borders draw inside the box, SVG strokes center on the edge, so shrink by one stroke width to match.
    w: w - sw,
    h: h - sw,
    shape: { kind: "box", radius: 16 },
    fill: `${colorBase}26`,
    stroke: `${colorBase}cc`,
    stroke_width: sw,
    stroke_dash: isObject ? "8 5" : undefined,
    labels: [{ text: display, size: 12, weight: 600, color: colorFg, dy: hasDots ? -7 : 0 }],
    marking,
    marking_dy: 8.5,
  };
}

/** Arc-type classification, matching `ConstraintEdge.tsx`'s marker assignment exactly. */
function markerEnds(arcType: ConstraintEdgeData["arcType"]): { start: EdgeMarker; end: EdgeMarker } {
  switch (arcType) {
    case "EFEP":
    case "DFDP":
      return { start: "ball", end: "arrow_ball" };
    case "EP":
      return { start: "ball_arrow", end: "none" };
    case "DP":
      return { start: "ball_bar_arrow", end: "none" };
    case "EF":
      return { start: "ball", end: "arrow_centered" };
    case "DF":
      return { start: "ball", end: "arrow_bar" };
    default:
      return { start: "ball", end: "none" }; // AS
  }
}

/** Raw (pre-round) polyline for one edge: routed points deformed for drag, or a straight
 *  center-to-center fallback. Mirrors `ConstraintEdge.tsx` lines 206-256. */
function edgePoints(src: ActivityNode, tgt: ActivityNode, data: ConstraintEdgeData | undefined): Pt[] {
  const sw = src.measured?.width ?? ACT_NODE_WIDTH;
  const sh = src.measured?.height ?? ACT_NODE_HEIGHT;
  const tw = tgt.measured?.width ?? ACT_NODE_WIDTH;
  const th = tgt.measured?.height ?? ACT_NODE_HEIGHT;
  const srcCenter = { x: src.position.x + sw / 2, y: src.position.y + sh / 2 };
  const tgtCenter = { x: tgt.position.x + tw / 2, y: tgt.position.y + th / 2 };

  if (data?.routedPoints && data.layoutSourcePos && data.layoutTargetPos) {
    const sourceDelta = {
      x: src.position.x - data.layoutSourcePos.x,
      y: src.position.y - data.layoutSourcePos.y,
    };
    const targetDelta = {
      x: tgt.position.x - data.layoutTargetPos.x,
      y: tgt.position.y - data.layoutTargetPos.y,
    };
    const moved =
      Math.abs(sourceDelta.x) > 0.5 ||
      Math.abs(sourceDelta.y) > 0.5 ||
      Math.abs(targetDelta.x) > 0.5 ||
      Math.abs(targetDelta.y) > 0.5;
    if (!moved) return data.routedPoints;
    const deformed = deformPoints(data.routedPoints, sourceDelta, targetDelta);
    return snapEndpointsToNodeBorders(deformed, srcCenter, tgtCenter, sw / 2, sh / 2);
  }
  return [srcCenter, tgtCenter];
}

/** The dot badges drawn along an edge (each -> any -> all order), matching `ConstraintEdge.tsx`'s `dots`/`labelItems` layout. */
function edgeDots(
  data: ConstraintEdgeData,
  objectTypeColor: ColorResolver,
  totalLen: number,
  bg: string,
): EdgeDot[] {
  if (totalLen <= 0) return [];
  const items: { objectType: string; quantifier: "each" | "any" | "all" }[] = [
    ...data.label.each.map((r) => ({ objectType: r.object_type, quantifier: "each" as const })),
    ...data.label.any.map((r) => ({ objectType: r.object_type, quantifier: "any" as const })),
    ...data.label.all.map((r) => ({ objectType: r.object_type, quantifier: "all" as const })),
  ];
  const widths = items.map((it) => (it.quantifier === "each" ? 10 : 17));
  const totalWidth = widths.reduce((s, w) => s + w + 2, 0);
  let offset = -totalWidth / 2;
  const step = 3.1;
  const dots: EdgeDot[] = [];
  items.forEach((it, i) => {
    const center = offset + widths[i] / 2;
    offset += widths[i] + 2;
    const color = objectTypeColor(it.objectType);
    // Every on-screen `MultiDot` dot wears this ring (`border()` = 65% color toward CanvasText).
    const stroke = flattenColor(`color-mix(in srgb, ${color} 65%, CanvasText)`, bg);
    const at = (px: number) => Math.min(1, Math.max(0, 0.5 + (center + px) / totalLen));
    if (it.quantifier === "each") {
      dots.push({ at: at(0), color, filled: true, stroke });
    } else if (it.quantifier === "all") {
      dots.push({ at: at(-step), color, filled: true, stroke });
      dots.push({ at: at(0), color, filled: true, stroke });
      dots.push({ at: at(step), color, filled: true, stroke });
    } else {
      dots.push({ at: at(-step), color, filled: true, stroke });
      dots.push({ at: at(0), color, filled: false, stroke });
      dots.push({ at: at(step), color, filled: false, stroke });
    }
  });
  return dots;
}

/** The `∀ each  ALL(all)  ANY(any)` text notation as a single string (per-type coloring is not
 *  representable in a single `EdgeLabel`). Uses the O2O-lossless `rawLabel` when present. */
function notationString(data: ConstraintEdgeData): string {
  const raw = data.rawLabel as { each: ObjTA[]; all: ObjTA[]; any: ObjTA[] } | undefined;
  const assoc = (a: ObjTA) =>
    a.type === "Simple" ? a.object_type : `${a.first}${a.reversed ? "<" : ">"}${a.second}`;
  const grp = (g: "each" | "all" | "any") =>
    raw ? raw[g].map(assoc) : data.label[g].map((r) => r.object_type ?? "");
  const parts: string[] = [];
  const each = grp("each");
  if (each.length) parts.push(`∀ ${each.join(", ")}`);
  const all = grp("all");
  if (all.length) parts.push(`ALL(${all.join(", ")})`);
  const any = grp("any");
  if (any.length) parts.push(`ANY(${any.join(", ")})`);
  return parts.join("  ");
}

function edgeToStyled(
  src: ActivityNode,
  tgt: ActivityNode,
  edge: ConstraintEdge,
  objectTypeColor: ColorResolver,
  textLabels: boolean,
  bg: string,
): StyledEdge | null {
  const data = edge.data;
  if (!data) return null;
  const points = edgePoints(src, tgt, data);
  if (points.length < 2) return null;

  // Stroke paint, matching `ConstraintEdge`: single type = plain color, multiple = weighted gradient.
  const colorEntries: { key: string; color: string; weight: number }[] = [];
  const addRef = (objectType: string, weight: number) => {
    if (!objectType) return;
    const existing = colorEntries.find((e) => e.key === objectType);
    if (existing) existing.weight += weight;
    else colorEntries.push({ key: objectType, color: objectTypeColor(objectType), weight });
  };
  for (const r of data.label.each) addRef(r.object_type, 4);
  for (const r of data.label.all) addRef(r.object_type, 4);
  for (const r of data.label.any) addRef(r.object_type, 1);
  const totalWeight = colorEntries.reduce((s, e) => s + e.weight, 0) || 1;
  let acc = 0;
  const gradient = colorEntries.map((e) => {
    const stop = { offset: (acc + e.weight / 2) / totalWeight, color: e.color };
    acc += e.weight;
    return stop;
  });
  // Fallback single color: kept at the neutral gray for multi-type edges so label/marker color
  // defaults stay unchanged (the gradient overrides the path stroke itself).
  const color = colorEntries.length === 1 ? colorEntries[0].color : MARKER_COLOR;

  const { start, end } = markerEnds(data.arcType);
  const totalLen = polylineLength(points);
  const notation = textLabels ? notationString(data) : "";
  return {
    points: points.map((p) => [p.x, p.y]),
    color,
    gradient: colorEntries.length > 1 ? gradient : undefined,
    width: 2.5,
    marker_start: start,
    marker_end: end,
    // All markers in one neutral gray, sized to match `ConstraintEdge`'s on-screen marker proportions.
    marker_color: MARKER_COLOR,
    marker_size: 15,
    rounded: 16,
    dots: textLabels ? [] : edgeDots(data, objectTypeColor, totalLen, bg),
    labels: notation ? [{ text: notation, at: 0.5 }] : [],
  };
}

/** Convert the live OC-Declare graph into a `StyledGraph`. `nodes`/`edges` are the same React Flow
 *  state `OCDeclareViz` renders from (already reflect live drags). */
export function ocDeclareModelToStyledGraph(
  nodes: ActivityNode[],
  edges: ConstraintEdge[],
  activityColor: ColorResolver,
  objectTypeColor: ColorResolver,
  textLabels = false,
): StyledGraph | null {
  if (nodes.length === 0) return null;
  const bg = exportBackgroundHex();
  const graph = buildStyledGraph(nodes, edges, {
    id: (n) => n.id,
    source: (e) => e.source,
    target: (e) => e.target,
    nodeToStyled: (n) => nodeToStyled(n, activityColor, objectTypeColor, bg),
    edgeToStyled: (e, src, tgt) => edgeToStyled(src, tgt, e, objectTypeColor, textLabels, bg),
    padding: 40,
  });
  // Markers are centered on node borders and drawn above them on screen.
  if (graph) graph.edges_on_top = true;
  return graph;
}
