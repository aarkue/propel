import { flattenColor, mix } from "../dfg/util/colors";
import { layoutModel, type ModelLayout, type VizTransport } from "../viz";
import type { ElementStyle, Point, Size, StyleOverrides, OcTypeGraph } from "../viz/types";
import type { OcelTypeGraphEdge, OcelTypeGraphNode } from "./OcelTypeGraph";

/** The visible types and relations as rust4pm's `OcTypeGraph`, with the component id behind each of
 *  its nodes and edges. */
export interface IndexedTypeGraph {
  graph: OcTypeGraph;
  nodeIds: string[];
  edgeIds: string[];
}

/** A type graph laid out: the OcTypeGraph node and edge behind each graph node and edge, and the
 *  layout. */
export type LaidTypeGraph = Pick<ModelLayout<"oc_type_graph">, "nodes" | "edges" | "layout">;

/** `nodes` and the `edges` between two of them as an `OcTypeGraph`. rust4pm draws an edge from an
 *  object type as O2O and one from an event type as E2O. */
export function toTypeGraph(nodes: OcelTypeGraphNode[], edges: OcelTypeGraphEdge[]): IndexedTypeGraph {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const graph: OcTypeGraph = {
    nodes: nodes.map((n) => ({ kind: n.kind, label: n.label, count: n.count ?? null })),
    edges: [],
  };
  const edgeIds: string[] = [];
  for (const e of edges) {
    const source = index.get(e.source);
    const target = index.get(e.target);
    if (source === undefined || target === undefined) continue;
    graph.edges.push({ source, target, qualifier: e.qualifier ?? null });
    edgeIds.push(e.id);
  }
  return { graph, nodeIds: nodes.map((n) => n.id), edgeIds };
}

/** Lay the graph out with rust4pm, or without a transport put the event types in one row and the
 *  object types in the next. `routing` overrides rust4pm's edge routing style. */
export function layoutTypeGraph(
  viz: VizTransport | undefined,
  graph: OcTypeGraph,
  routing?: "diagonal" | "orthogonal",
): Promise<LaidTypeGraph> {
  if (!viz) return Promise.resolve(rowsLayout(graph));
  return layoutModel(
    viz,
    "oc_type_graph",
    graph,
    routing ? { layout_patch: { routing: { style: routing } } } : undefined,
  );
}

const NODE_HEIGHT = 44;
const GAP = 40;
const ROW_GAP = 120;

/** rust4pm's type box width: `clamp(8 * chars + 24, 120, 260)`. */
const nodeWidth = (label: string) => Math.min(260, Math.max(120, 8 * Array.from(label).length + 24));

/** Event types in one row, object types centred in the row below, edges straight between borders. */
export function rowsLayout(graph: OcTypeGraph): LaidTypeGraph {
  const sizes: Size[] = graph.nodes.map((n) => ({ width: nodeWidth(n.label), height: NODE_HEIGHT }));
  const rows = (["event", "object"] as const).map((kind) =>
    graph.nodes.flatMap((n, i) => (n.kind === kind ? [i] : [])),
  );
  const rowWidth = (row: number[]) =>
    row.reduce((w, i) => w + sizes[i].width, 0) + GAP * Math.max(0, row.length - 1);
  const widest = Math.max(...rows.map(rowWidth));
  const centers: Point[] = [];
  rows.forEach((row, r) => {
    let x = (widest - rowWidth(row)) / 2;
    for (const i of row) {
      centers[i] = { x: x + sizes[i].width / 2, y: r * (NODE_HEIGHT + ROW_GAP) };
      x += sizes[i].width + GAP;
    }
  });
  const edges = graph.edges.map((e) => {
    const [s, t] = [centers[e.source], centers[e.target]];
    if (e.source === e.target) {
      const right = s.x + sizes[e.source].width / 2;
      return [
        { x: right, y: s.y - 8 },
        { x: right + 30, y: s.y - 8 },
        { x: right + 30, y: s.y + 8 },
        { x: right, y: s.y + 8 },
      ];
    }
    return [borderPoint(s, sizes[e.source], t), borderPoint(t, sizes[e.target], s)];
  });
  return {
    nodes: graph.nodes.map((_, i) => i),
    edges: graph.edges.map((_, i) => i),
    layout: {
      bounds: {
        min: { x: 0, y: -NODE_HEIGHT / 2 },
        max: { x: widest, y: NODE_HEIGHT + ROW_GAP + NODE_HEIGHT / 2 },
      },
      nodes: centers.map((center, i) => ({
        center,
        size: sizes[i],
        order: i,
        rank: graph.nodes[i].kind === "event" ? 0 : 1,
      })),
      edges: edges.map((points) => ({ kind: "direct", points, label_anchor: null })),
      layer_count: 2,
      reversed: [],
      stats: { dummy_count: 0 },
    },
  };
}

/** Where the line from the centre of a box towards `to` leaves the box. */
function borderPoint(center: Point, size: Size, to: Point): Point {
  const dx = to.x - center.x;
  const dy = to.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : size.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : size.height / 2 / Math.abs(dy),
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** The point `fraction` of the way along a polyline. */
export function pointAlong(points: Point[], fraction: number): Point | undefined {
  if (points.length === 0) return undefined;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let rest = lengths.reduce((a, b) => a + b, 0) * fraction;
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] && lengths[i] > 0) {
      const t = rest / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    rest -= lengths[i];
  }
  return points[points.length - 1];
}

/** An SVG path through `points` with each corner rounded by up to `radius`, as rust4pm's drawing
 *  rounds them. */
export function roundedPath(points: Point[], radius: number): string {
  if (points.length === 0) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, p, b] = [points[i - 1], points[i], points[i + 1]];
    const l1 = Math.max(1, Math.hypot(p.x - a.x, p.y - a.y));
    const l2 = Math.max(1, Math.hypot(b.x - p.x, b.y - p.y));
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const from = { x: p.x - ((p.x - a.x) / l1) * r, y: p.y - ((p.y - a.y) / l1) * r };
    const to = { x: p.x + ((b.x - p.x) / l2) * r, y: p.y + ((b.y - p.y) / l2) * r };
    d += ` L${from.x},${from.y} Q${p.x},${p.y} ${to.x},${to.y}`;
  }
  if (points.length > 1) d += ` L${points[points.length - 1].x},${points[points.length - 1].y}`;
  return d;
}

/** What the host shows differently for one type or relation, by component id. */
export interface TypeGraphHostStyle {
  /** The type's color when it is not the one rust4pm picks for its name. */
  colorOf?: (id: string) => string | undefined;
  ringOf?: (id: string) => string | undefined;
  dimmed?: (id: string) => boolean;
  edgeStyle?: (id: string) => { color?: string; width?: number; dimmed?: boolean } | undefined;
}

export const DIMMED_NODE_OPACITY = 0.35;
export const DIMMED_EDGE_OPACITY = 0.3;

/** The on-screen host styling of a laid-out type graph as rust4pm style overrides: a host color
 *  as fill and stroke, a ring as stroke, dimming as opacity, and edge color, width and dimming. */
export function typeGraphOverrides(
  indexed: Pick<IndexedTypeGraph, "nodeIds" | "edgeIds">,
  laid: Pick<LaidTypeGraph, "nodes" | "edges">,
  host: TypeGraphHostStyle,
): StyleOverrides {
  const nodes: Record<number, ElementStyle> = {};
  laid.nodes.forEach((n, k) => {
    const id = indexed.nodeIds[n];
    const style: ElementStyle = {};
    const color = host.colorOf?.(id);
    if (color) {
      const hex = flattenColor(color);
      style.fill = mix(hex, "#ffffff", 0.85);
      style.stroke = hex;
    }
    const ring = host.ringOf?.(id);
    if (ring) style.stroke = flattenColor(ring);
    if (host.dimmed?.(id)) style.opacity = DIMMED_NODE_OPACITY;
    if (Object.keys(style).length > 0) nodes[k] = style;
  });
  const edges: Record<number, ElementStyle> = {};
  laid.edges.forEach((e, k) => {
    const o = host.edgeStyle?.(indexed.edgeIds[e]);
    if (!o) return;
    const style: ElementStyle = {};
    if (o.color) style.stroke = flattenColor(o.color);
    if (o.width != null) style.stroke_width = o.width;
    if (o.dimmed) style.opacity = DIMMED_EDGE_OPACITY;
    if (Object.keys(style).length > 0) edges[k] = style;
  });
  return { nodes, edges };
}
