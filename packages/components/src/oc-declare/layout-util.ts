import type { Edge, Node } from "@xyflow/react";

type Point = { x: number; y: number };

/** Stacks nodes in a column, edges unrouted: the layout without a `viz` transport. */
export async function noopDeclareLayout<N extends Node>(
  nodes: N[],
  edges: Edge[],
): Promise<{ nodes: N[]; edges: Edge[] }> {
  return { nodes: nodes.map((n, i) => ({ ...n, position: { x: 0, y: i * 80 } })), edges };
}

/** Route a self-loop that has no layout route as a rounded box exiting the right side and
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

/** Render a routed polyline with circular-arc rounded corners, matching rust4pm's SVG. `r` is the
 *  max corner radius. */
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

/** Orders async runs so only the most recently started one applies its result: each call starts a
 *  run and returns a check that holds until the next one starts. */
export function latestOnly(): () => () => boolean {
  let current = 0;
  return () => {
    const mine = ++current;
    return () => mine === current;
  };
}
