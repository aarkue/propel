/**
 * Converts the live on-screen OC-Declare graph (activity nodes + constraint edges, the same
 * `nodes`/`edges` React Flow state `ConstraintEdge`/`ActivityNode` draw from) into a generic
 * `StyledGraph`, ready for the `export_graph_svg` Rust binding. Geometry/drag-deform math mirrors
 * `ConstraintEdge.tsx` exactly (`deformPoints`/`snapEndpointsToNodeBorders`/`roundedPointsToSvgPath`
 * corner radius 16) so the export matches the screen pixel-for-pixel.
 *
 * Lossy simplifications (the generic `StyledEdge` marker/dot vocabulary is coarser than the
 * hand-authored SVG markers here):
 * - DF/DP's extra perpendicular "direct succession" bar has no `EdgeMarker` equivalent and is
 *   dropped (DF -> `arrow`, DP -> `arrow_ball`, same as EF/EP).
 * - Multi-object-type gradient strokes collapse to the single highest-weight color (no gradient
 *   support in `StyledEdge.color`).
 */

import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH } from "./ActivityNode";
import { buildStyledGraph } from "../graph-svg/build-styled-graph";
import { deformPoints, snapEndpointsToNodeBorders } from "./layout-util";
import type { ActivityNodeData, ConstraintEdgeData } from "./types";
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
): StyledNode {
  const w = n.measured?.width ?? ACT_NODE_WIDTH;
  const h = n.measured?.height ?? ACT_NODE_HEIGHT;
  const colorBase = activityColor(n.data.label, "normal");
  const colorFg = activityColor(n.data.label, "foreground");
  const marking: MarkingGroup[] = n.data.objectTypes.map((t) => ({
    kind: "dot",
    color: objectTypeColor(t.name),
    count: t.min === 1 && t.max === 1 ? 1 : 3,
  }));
  return {
    cx: n.position.x + w / 2,
    cy: n.position.y + h / 2,
    w,
    h,
    shape: { kind: "box", radius: 16 },
    fill: `${colorBase}26`,
    stroke: `${colorBase}cc`,
    stroke_width: 2,
    labels: [{ text: n.data.label, size: 12, weight: 600, color: colorFg }],
    marking,
  };
}

/** Arc-type classification, matching `ConstraintEdge.tsx`'s `isEFEP`/`isEF`/`isEP`/`isDirect`. */
function markerEnds(arcType: ConstraintEdgeData["arcType"]): { start: EdgeMarker; end: EdgeMarker } {
  const isEFEP = arcType === "EFEP" || arcType === "DFDP";
  const isEF = isEFEP || arcType === "EF" || arcType === "DF";
  const isEP = isEFEP || arcType === "EP" || arcType === "DP";
  if (isEFEP) return { start: "ball", end: "arrow_ball" };
  if (isEP) return { start: "arrow_ball", end: "none" };
  if (isEF) return { start: "ball", end: "arrow" };
  return { start: "ball", end: "none" }; // AS
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

/** The dot badges drawn along an edge (each -> any -> all order), matching `ConstraintEdge.tsx`'s
 *  `dots`/`labelItems` layout: same-width slots (10px `each`, 17px `any`/`all`) centered on the
 *  curve midpoint, each badge's 1 or 3 sub-dots spaced 3.1px apart (`MultiDot`'s `step`). */
function edgeDots(data: ConstraintEdgeData, objectTypeColor: ColorResolver, totalLen: number): EdgeDot[] {
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
    const at = (px: number) => Math.min(1, Math.max(0, 0.5 + (center + px) / totalLen));
    if (it.quantifier === "each") {
      dots.push({ at: at(0), color, filled: true });
    } else if (it.quantifier === "all") {
      dots.push({ at: at(-step), color, filled: true });
      dots.push({ at: at(0), color, filled: true });
      dots.push({ at: at(step), color, filled: true });
    } else {
      dots.push({ at: at(-step), color, filled: true });
      dots.push({ at: at(0), color, filled: false });
      dots.push({ at: at(step), color, filled: false });
    }
  });
  return dots;
}

function edgeToStyled(
  src: ActivityNode,
  tgt: ActivityNode,
  edge: ConstraintEdge,
  objectTypeColor: ColorResolver,
): StyledEdge | null {
  const data = edge.data;
  if (!data) return null;
  const points = edgePoints(src, tgt, data);
  if (points.length < 2) return null;

  const weightOf = (q: "each" | "any" | "all") => (q === "any" ? 1 : 4);
  const weights = new Map<string, number>();
  for (const [refs, q] of [
    [data.label.each, "each"],
    [data.label.any, "any"],
    [data.label.all, "all"],
  ] as const) {
    for (const r of refs) weights.set(r.object_type, (weights.get(r.object_type) ?? 0) + weightOf(q));
  }
  let color: string | undefined;
  let bestWeight = -1;
  for (const [ot, w] of weights) {
    const c = objectTypeColor(ot);
    if (w > bestWeight) {
      bestWeight = w;
      color = c;
    }
  }

  const { start, end } = markerEnds(data.arcType);
  const totalLen = polylineLength(points);
  return {
    points: points.map((p) => [p.x, p.y]),
    color: color ?? "#4b5563",
    width: 2.5,
    marker_start: start,
    marker_end: end,
    rounded: 16,
    dots: edgeDots(data, objectTypeColor, totalLen),
  };
}

/** Convert the live OC-Declare graph into a `StyledGraph`. `nodes`/`edges` are the same React Flow
 *  state `OCDeclareViz` renders from (already reflect live drags). */
export function ocDeclareModelToStyledGraph(
  nodes: ActivityNode[],
  edges: ConstraintEdge[],
  activityColor: ColorResolver,
  objectTypeColor: ColorResolver,
): StyledGraph | null {
  if (nodes.length === 0) return null;
  return buildStyledGraph(nodes, edges, {
    id: (n) => n.id,
    source: (e) => e.source,
    target: (e) => e.target,
    nodeToStyled: (n) => nodeToStyled(n, activityColor, objectTypeColor),
    edgeToStyled: (e, src, tgt) => edgeToStyled(src, tgt, e, objectTypeColor),
    padding: 40,
  });
}
