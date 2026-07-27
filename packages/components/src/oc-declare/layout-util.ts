import type { Edge, Node } from "@xyflow/react";
import type { ConstraintEdgeData } from "./types";

type Point = { x: number; y: number };

/** Options for a {@link DeclareLayoutFn}. `seed`/`reroute` drive the stable on-drop relayout (Rust engine; ELK keeps its live edge-deform). */
export type DeclareLayoutOptions<N extends Node> = {
  direction?: "RIGHT" | "DOWN";
  seed?: (node: N) => { x: number; y: number; pinned?: boolean } | undefined;
  reroute?: boolean;
  /** Size edge labels for the wider text notation instead of the dot badges, so nodes space apart enough to avoid overlap. */
  textLabels?: boolean;
};

/** A pluggable OC-declare layout: positions `nodes` and writes routed-edge data. */
export type DeclareLayoutFn = <N extends Node>(
  nodes: N[],
  edges: Edge[],
  options?: DeclareLayoutOptions<N>,
) => Promise<{ nodes: N[]; edges: Edge[] }>;

/** Engine-agnostic fallback: stacks nodes in a column, edges unrouted. Import an engine bundle
 *  (`@r4pm/components/elk-layout` or `@r4pm/components/rust-layout/wasm`) for a real layout. */
export const noopDeclareLayout: DeclareLayoutFn = async (nodes, edges) => ({
  nodes: nodes.map((n, i) => ({ ...n, position: { x: 0, y: i * 80 } })),
  edges,
});

/** Route a self-loop (the layout engines skip these) as a rounded box exiting the right side and
 *  re-entering the top of the node. Points are in flow coordinates. */
export function selfLoopPoints(center: Point, halfW: number, halfH: number): Point[] {
  return [
    { x: center.x + halfW, y: center.y },
    { x: center.x + halfW + 36, y: center.y },
    { x: center.x + halfW + 36, y: center.y - halfH - 26 },
    { x: center.x, y: center.y - halfH - 26 },
    { x: center.x, y: center.y - halfH },
  ];
}

/** Render plain waypoints (the Rust engine) as a polyline with circular-arc rounded corners,
 *  matching the Rust SVG. `r` is the max corner radius. */
export function roundedPointsToSvgPath(points: Point[], r: number): string {
  if (points.length === 0) return "";
  if (points.length <= 2) {
    return points.length === 1
      ? `M${points[0].x},${points[0].y}`
      : `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }
  const parts: string[] = [`M${points[0].x},${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const l1 = Math.hypot(p0.x - p1.x, p0.y - p1.y) || 1;
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = { x: p1.x + ((p0.x - p1.x) / l1) * rr, y: p1.y + ((p0.y - p1.y) / l1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * rr, y: p1.y + ((p2.y - p1.y) / l2) * rr };
    parts.push(`L${a.x},${a.y} Q${p1.x},${p1.y} ${b.x},${b.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L${last.x},${last.y}`);
  return parts.join(" ");
}

/** Project from rect center toward a target point, returning the boundary intersection of a rounded rectangle. */
const NODE_BORDER_RADIUS = 16; // matches CSS rounded-2xl
function rectBorderPoint(center: Point, halfW: number, halfH: number, towards: Point): Point {
  const dx = towards.x - center.x;
  const dy = towards.y - center.y;
  if (dx === 0 && dy === 0) return { x: center.x + halfW, y: center.y };

  const r = Math.min(NODE_BORDER_RADIUS, halfW, halfH);
  // Ray hits a flat side if it crosses outside the corner-inset zone, else the corner arc.
  const flatHalfW = halfW - r;
  const flatHalfH = halfH - r;

  const angle = Math.atan2(dy, dx);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Try flat sides first (top/bottom or left/right).
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Hit right/left flat side?
  if (absDx > 1e-9) {
    const tSide = halfW / absDx;
    const yAtSide = absDy * tSide;
    if (yAtSide <= flatHalfH) {
      // Hits flat vertical side within the non-rounded zone.
      const sx = Math.sign(dx);
      return { x: center.x + sx * halfW, y: center.y + (dy / absDx) * halfW };
    }
  }

  // Hit top/bottom flat side?
  if (absDy > 1e-9) {
    const tSide = halfH / absDy;
    const xAtSide = absDx * tSide;
    if (xAtSide <= flatHalfW) {
      // Hits flat horizontal side within the non-rounded zone.
      const sy = Math.sign(dy);
      return { x: center.x + (dx / absDy) * halfH, y: center.y + sy * halfH };
    }
  }

  // Hits a corner arc: intersect the ray from center through (dx,dy) with the circle of radius r at the corner.
  const cornerCx = center.x + Math.sign(dx) * flatHalfW;
  const cornerCy = center.y + Math.sign(dy) * flatHalfH;
  const ocx = center.x - cornerCx;
  const ocy = center.y - cornerCy;
  const a = 1; // cos^2+sin^2 = 1
  const b = 2 * (ocx * cos + ocy * sin);
  const c = ocx * ocx + ocy * ocy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    // Shouldn't happen geometrically, but fall back to rect.
    const sx = Math.sign(dx);
    return { x: center.x + sx * halfW, y: center.y + (dy / absDx) * halfW };
  }
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  return { x: center.x + t * cos, y: center.y + t * sin };
}

/** Strictly inside the node box (border-coincident points count as outside). */
function insideBox(p: Point, center: Point, halfW: number, halfH: number): boolean {
  return Math.abs(p.x - center.x) < halfW && Math.abs(p.y - center.y) < halfH;
}

/** Snap a routed polyline's endpoints to the node borders, clipping any tail that runs inside a node
 *  (a centre-toward-waypoint projection fails when the waypoint sits on or past the centre). */
export function snapEndpointsToNodeBorders(
  points: Point[],
  sourceCenter: Point,
  targetCenter: Point,
  halfW: number,
  halfH: number,
): Point[] {
  if (points.length < 2) return points;
  let pts = [...points];

  // Target end: clip at the first vertex inside the target box, aiming from the vertex just before it.
  const tEnter = pts.findIndex((p) => insideBox(p, targetCenter, halfW, halfH));
  if (tEnter > 0) {
    pts = [...pts.slice(0, tEnter), rectBorderPoint(targetCenter, halfW, halfH, pts[tEnter - 1])];
  } else {
    pts[pts.length - 1] = rectBorderPoint(targetCenter, halfW, halfH, pts[pts.length - 2]);
  }

  // Source end: symmetric - clip at the last vertex inside the source box, aiming from the one after.
  let sExit = -1;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (insideBox(pts[i], sourceCenter, halfW, halfH)) {
      sExit = i;
      break;
    }
  }
  if (sExit >= 0 && sExit < pts.length - 1) {
    pts = [rectBorderPoint(sourceCenter, halfW, halfH, pts[sExit + 1]), ...pts.slice(sExit + 1)];
  } else {
    pts[0] = rectBorderPoint(sourceCenter, halfW, halfH, pts[1]);
  }

  // Safety net for overlapping nodes (e.g. mid-drag): drop any interior vertex the clips left behind.
  return pts.filter(
    (p, i) =>
      i === 0 ||
      i === pts.length - 1 ||
      (!insideBox(p, sourceCenter, halfW, halfH) && !insideBox(p, targetCenter, halfW, halfH)),
  );
}

const nodePairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

export type ArcLane = { index: number; total: number };

/** Assign each edge a lane within its unordered node pair (stable order regardless of arc direction),
 *  so a pair carrying several arcs can be fanned into parallel lanes. Self-loops are ignored. */
export function assignArcLanes(edges: Edge[]): Map<string, ArcLane> {
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    const k = nodePairKey(e.source, e.target);
    const group = groups.get(k) ?? [];
    group.push(e);
    groups.set(k, group);
  }
  const lanes = new Map<string, ArcLane>();
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.id.localeCompare(b.id),
    );
    sorted.forEach((e, index) => {
      lanes.set(e.id, { index, total: sorted.length });
    });
  }
  return lanes;
}

const ARC_LANE_GAP = 24;

const clampToBox = (p: Point, c: Point, halfW: number, halfH: number): Point => ({
  x: Math.max(c.x - halfW, Math.min(c.x + halfW, p.x)),
  y: Math.max(c.y - halfH, Math.min(c.y + halfH, p.y)),
});

/** Route one arc of a multi-arc node pair as its own parallel lane, offset perpendicular to the source->target axis; `reversed` flips the offset so anti-parallel arcs land on opposite sides. */
export function fanArcRoute(
  sourceCenter: Point,
  targetCenter: Point,
  lane: ArcLane,
  reversed: boolean,
  halfW: number,
  halfH: number,
): Point[] {
  const offset = (lane.index - (lane.total - 1) / 2) * ARC_LANE_GAP * (reversed ? -1 : 1);
  const ux = targetCenter.x - sourceCenter.x;
  const uy = targetCenter.y - sourceCenter.y;
  const len = Math.hypot(ux, uy) || 1;
  const px = (-uy / len) * offset;
  const py = (ux / len) * offset;
  const shift = (p: Point, c: Point): Point => clampToBox({ x: p.x + px, y: p.y + py }, c, halfW, halfH);
  const start = shift(rectBorderPoint(sourceCenter, halfW, halfH, targetCenter), sourceCenter);
  const end = shift(rectBorderPoint(targetCenter, halfW, halfH, sourceCenter), targetCenter);
  return [start, end];
}

/** Does segment p0-p1 cross the axis-aligned box centred at `c`? (Liang-Barsky, borders excluded.) */
function segCrossesBox(p0: Point, p1: Point, c: Point, halfW: number, halfH: number): boolean {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const p = [-dx, dx, -dy, dy];
  const q = [p0.x - (c.x - halfW), c.x + halfW - p0.x, p0.y - (c.y - halfH), c.y + halfH - p0.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1;
}

/** Collapse a routed polyline to a straight border-to-border line when the engine only added a small
 *  cosmetic jog and that line clears every other node; genuine detours and obstructed lines keep the engine route. */
export function straightenClearRoute(
  points: Point[],
  sourceCenter: Point,
  targetCenter: Point,
  obstacles: Point[],
  halfW: number,
  halfH: number,
): Point[] {
  if (points.length <= 2) return points;
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let deviation = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const pt = points[i];
    deviation = Math.max(deviation, Math.abs((pt.x - a.x) * dy - (pt.y - a.y) * dx) / len);
  }
  if (deviation > 2 * halfH) return points;
  const start = rectBorderPoint(sourceCenter, halfW, halfH, targetCenter);
  const end = rectBorderPoint(targetCenter, halfW, halfH, sourceCenter);
  for (const c of obstacles) {
    if (segCrossesBox(start, end, c, halfW - 1, halfH - 1)) return points;
  }
  return [start, end];
}

/** Blend source/target displacements into the polyline when nodes are dragged. */
export function deformPoints(points: Point[], sourceDelta: Point, targetDelta: Point): Point[] {
  const n = points.length - 1;
  if (n <= 0) return points;
  return points.map((p, i) => {
    const t = i / n;
    return {
      x: p.x + (1 - t) * sourceDelta.x + t * targetDelta.x,
      y: p.y + (1 - t) * sourceDelta.y + t * targetDelta.y,
    };
  });
}

/** Approximate label width for an edge from its constraint dots (`each` ~12px, `any`/`all` ~19px; matches MultiDot). */
export function edgeLabelWidth(e: Edge, textLabels = false): number {
  const data = e.data as ConstraintEdgeData | undefined;
  if (!data?.label) return 20;
  if (textLabels) return textNotationWidth(data);
  let w = 0;
  for (const r of data.label.each) {
    if (r.object_type) w += 12;
  }
  for (const r of [...data.label.any, ...data.label.all]) {
    if (r.object_type) w += 19;
  }
  return Math.max(18, w);
}

/** Structural mirror of `ObjectTypeAssociation` (defined in index.tsx; not imported to avoid an
 *  import cycle). O2O refs render as `first>second`, so they count both names. */
type TaggedRef = { type: "Simple"; object_type: string } | { type: "O2O"; first: string; second: string };

/** Approx px width of the `∀ each ALL(all) ANY(any)` text notation, to reserve edge-label space; prefers the O2O-lossless `rawLabel` over the collapsed label. */
function textNotationWidth(data: ConstraintEdgeData): number {
  const CHAR = 6;
  const raw = data.rawLabel as { each: TaggedRef[]; all: TaggedRef[]; any: TaggedRef[] } | undefined;
  const refLen = (r: TaggedRef | { object_type?: string }) => {
    if ("type" in r && r.type === "O2O") return r.first.length + 1 + r.second.length;
    const name = (r as { object_type?: string }).object_type;
    return name ? name.length : 4;
  };
  const groupChars = (refs: (TaggedRef | { object_type?: string })[], wrap: number) =>
    refs.length === 0 ? 0 : wrap + refs.reduce((s, r) => s + refLen(r), 0) + 2 * (refs.length - 1);
  const label = raw ?? data.label;
  const chars = groupChars(label.each, 2) + groupChars(label.all, 5) + groupChars(label.any, 5);
  return Math.max(24, chars * CHAR + 8);
}
