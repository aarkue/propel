import type { Edge, Node } from "@xyflow/react";
import type { ConstraintEdgeData } from "./types";

type Point = { x: number; y: number };

/** Options for a {@link DeclareLayoutFn}. `seed`/`reroute` drive the stable on-drop relayout: seed
 *  every node at its current centre, pin the just-dragged one, and re-route edges over that geometry
 *  (the Rust engine; ELK keeps its live edge-deform). */
export type DeclareLayoutOptions<N extends Node> = {
  direction?: "RIGHT" | "DOWN";
  seed?: (node: N) => { x: number; y: number; pinned?: boolean } | undefined;
  reroute?: boolean;
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

/**
 * Project from rect center toward a target point, returning the boundary
 * intersection of a rounded rectangle. The border radius (`r`) clips the
 * corners into quarter-circle arcs; the flat sides are shortened accordingly.
 * Falls back to a plain rect when r <= 0.
 */
const NODE_BORDER_RADIUS = 16; // matches CSS rounded-2xl
function rectBorderPoint(center: Point, halfW: number, halfH: number, towards: Point): Point {
  const dx = towards.x - center.x;
  const dy = towards.y - center.y;
  if (dx === 0 && dy === 0) return { x: center.x + halfW, y: center.y };

  const r = Math.min(NODE_BORDER_RADIUS, halfW, halfH);
  // Inner flat region: the ray hits a flat side if it crosses outside
  // the corner-inset zone.  Otherwise it hits the corner arc.
  const flatHalfW = halfW - r;
  const flatHalfH = halfH - r;

  // Angle of the direction vector.
  const angle = Math.atan2(dy, dx);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Try flat sides first (top/bottom or left/right).
  // Horizontal flat sides: |dy/dx| * flatHalfW determines if the ray hits
  // within the flat portion.
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

  // Hits a corner arc. Find which corner quadrant.
  const cornerCx = center.x + Math.sign(dx) * flatHalfW;
  const cornerCy = center.y + Math.sign(dy) * flatHalfH;
  // Intersect ray from center through (dx,dy) with circle of radius r
  // centered at (cornerCx, cornerCy).
  // Parametric ray: P = center + t*(cos, sin).  Solve |P - corner|^2 = r^2.
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

/** Snap the first and last points of a routed polyline to the node borders. */
export function snapEndpointsToNodeBorders(
  points: Point[],
  sourceCenter: Point,
  targetCenter: Point,
  halfW: number,
  halfH: number,
): Point[] {
  if (points.length < 2) return points;
  const out = [...points];
  out[0] = rectBorderPoint(sourceCenter, halfW, halfH, points[1]);
  const last = points.length - 1;
  out[last] = rectBorderPoint(targetCenter, halfW, halfH, points[last - 1]);
  return out;
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

/** Approximate label width for an edge from its constraint dots (one `each` dot ≈ 12px, one
 *  `any`/`all` dot ≈ 19px; matches MultiDot). Used to reserve label space in the layout. */
export function edgeLabelWidth(e: Edge): number {
  const data = e.data as ConstraintEdgeData | undefined;
  if (!data?.label) return 20;
  let w = 0;
  for (const r of data.label.each) {
    if (r.object_type) w += 12;
  }
  for (const r of [...data.label.any, ...data.label.all]) {
    if (r.object_type) w += 19;
  }
  return Math.max(18, w);
}
