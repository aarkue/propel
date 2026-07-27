import { type ElkGraph, loadElk } from "../elk-layout/elk";

export type Point = { x: number; y: number };

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface LayoutResult {
  nodes: Map<string, { x: number; y: number }>;
  /** Per edge: an SVG path for rendering, plus its Bezier control points for SVG export re-flattening. */
  edges: Map<string, { path: string; points: Point[] }>;
}

interface ElkSection {
  startPoint: Point;
  bendPoints?: Point[];
  endPoint: Point;
}

function sectionToPoints(section: ElkSection): Point[] {
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}

export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  let d = `M${points[0].x},${points[0].y}`;
  let i = 1;
  while (i < points.length) {
    const remaining = points.length - i;
    if (remaining >= 3) {
      d += ` C${points[i].x},${points[i].y} ${points[i + 1].x},${points[i + 1].y} ${points[i + 2].x},${points[i + 2].y}`;
      i += 3;
    } else if (remaining === 2) {
      d += ` Q${points[i].x},${points[i].y} ${points[i + 1].x},${points[i + 1].y}`;
      i += 2;
    } else {
      d += ` L${points[i].x},${points[i].y}`;
      i += 1;
    }
  }
  return d;
}

/** Drop waypoints that only jog slightly off the line between their kept neighbours, so Catmull-Rom
 *  doesn't trace routing artifacts into visible bumps/cusps; genuine node-avoidance detours survive. */
export function simplifyWaypoints(points: Point[], tol: number): Point[] {
  if (points.length <= 2) return points;
  const kept: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = kept[kept.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy);
    const dev =
      len < 1e-9 ? Math.hypot(b.x - a.x, b.y - a.y) : Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / len;
    if (dev >= tol) kept.push(b);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/** Convert routed corner waypoints into a rounded-corner Bezier control-point sequence: straight runs
 *  stay straight, only corners are filleted with `radius` (clamped to half each adjacent segment). */
export function roundedCornerControlPoints(points: Point[], radius: number): Point[] {
  if (points.length < 3) return points;
  // A straight cubic a->b (control points on the line => renders as a line under pointsToSvgPath).
  const straight = (a: Point, b: Point): Point[] => [
    { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 },
    b,
  ];
  const out: Point[] = [points[0]];
  let cur = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const lin = Math.hypot(p.x - prev.x, p.y - prev.y);
    const lout = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    if (r < 1e-6) {
      out.push(...straight(cur, p));
      cur = p;
      continue;
    }
    const entry = { x: p.x - ((p.x - prev.x) / lin) * r, y: p.y - ((p.y - prev.y) / lin) * r };
    const exit = { x: p.x + ((next.x - p.x) / lout) * r, y: p.y + ((next.y - p.y) / lout) * r };
    out.push(...straight(cur, entry));
    // Quadratic fillet (entry -> p -> exit), raised to a cubic so the M/C grouping stays uniform.
    out.push({ x: entry.x + (2 * (p.x - entry.x)) / 3, y: entry.y + (2 * (p.y - entry.y)) / 3 });
    out.push({ x: exit.x + (2 * (p.x - exit.x)) / 3, y: exit.y + (2 * (p.y - exit.y)) / 3 });
    out.push(exit);
    cur = exit;
  }
  out.push(...straight(cur, points[points.length - 1]));
  return out;
}

/** Sample the same M/C/Q/L segmentation as `pointsToSvgPath`, but as a dense point list for renderers that only draw straight segments. */
export function flattenSplinePoints(points: Point[], samplesPerCurve = 12): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]];
  let cur = points[0];
  let i = 1;
  while (i < points.length) {
    const remaining = points.length - i;
    if (remaining >= 3) {
      const [p1, p2, p3] = [points[i], points[i + 1], points[i + 2]];
      for (let s = 1; s <= samplesPerCurve; s++) {
        const t = s / samplesPerCurve;
        const mt = 1 - t;
        out.push({
          x: mt ** 3 * cur.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
          y: mt ** 3 * cur.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
        });
      }
      cur = p3;
      i += 3;
    } else if (remaining === 2) {
      const [p1, p2] = [points[i], points[i + 1]];
      for (let s = 1; s <= samplesPerCurve; s++) {
        const t = s / samplesPerCurve;
        const mt = 1 - t;
        out.push({
          x: mt ** 2 * cur.x + 2 * mt * t * p1.x + t ** 2 * p2.x,
          y: mt ** 2 * cur.y + 2 * mt * t * p1.y + t ** 2 * p2.y,
        });
      }
      cur = p2;
      i += 2;
    } else {
      out.push(points[i]);
      cur = points[i];
      i += 1;
    }
  }
  return out;
}

function rectBorderPoint(center: Point, halfW: number, halfH: number, towards: Point): Point {
  const dx = towards.x - center.x;
  const dy = towards.y - center.y;
  if (dx === 0 && dy === 0) return { x: center.x + halfW, y: center.y };
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx * halfH > absDy * halfW) {
    const sx = Math.sign(dx);
    return { x: center.x + sx * halfW, y: center.y + (dy / absDx) * halfW };
  }
  const sy = Math.sign(dy);
  return { x: center.x + (dx / absDy) * halfH, y: center.y + sy * halfH };
}

export function snapEndpoints(
  points: Point[],
  srcCenter: Point,
  tgtCenter: Point,
  srcHalfW: number,
  srcHalfH: number,
  tgtHalfW: number,
  tgtHalfH: number,
): Point[] {
  if (points.length < 2) return points;
  const result = [...points];
  result[0] = rectBorderPoint(srcCenter, srcHalfW, srcHalfH, points[1]);
  const last = points.length - 1;
  result[last] = rectBorderPoint(tgtCenter, tgtHalfW, tgtHalfH, points[last - 1]);
  return result;
}

/** Layered ELK layout with SPLINE edge routing, returning node positions + snapped SVG edge paths. */
export async function layoutTypeGraph(nodes: LayoutNode[], edges: LayoutEdge[]): Promise<LayoutResult> {
  const graph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.edgeNode": "18",
      "elk.spacing.edgeEdge": "12",
      "elk.edgeRouting": "SPLINES",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.aspectRatio": "1.7",
    },
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const elk = await loadElk();
  const laid = await elk.layout(graph);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodePositions = new Map<string, { x: number; y: number }>();
  const nodeSizes = new Map<string, { w: number; h: number }>();
  for (const child of laid.children ?? []) {
    nodePositions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
    const orig = nodeMap.get(child.id);
    nodeSizes.set(child.id, {
      w: orig?.width ?? 100,
      h: orig?.height ?? 32,
    });
  }

  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  const edgeRoutes = new Map<string, { path: string; points: Point[] }>();
  for (const elkEdge of laid.edges ?? []) {
    const section = elkEdge.sections?.[0];
    if (!section) continue;
    let points = sectionToPoints(section);
    const lookup = edgeMap.get(elkEdge.id);
    if (lookup) {
      const srcPos = nodePositions.get(lookup.source);
      const tgtPos = nodePositions.get(lookup.target);
      const srcSize = nodeSizes.get(lookup.source);
      const tgtSize = nodeSizes.get(lookup.target);
      if (srcPos && tgtPos && srcSize && tgtSize) {
        const srcCenter = { x: srcPos.x + srcSize.w / 2, y: srcPos.y + srcSize.h / 2 };
        const tgtCenter = { x: tgtPos.x + tgtSize.w / 2, y: tgtPos.y + tgtSize.h / 2 };
        points = snapEndpoints(
          points,
          srcCenter,
          tgtCenter,
          srcSize.w / 2,
          srcSize.h / 2,
          tgtSize.w / 2,
          tgtSize.h / 2,
        );
      }
    }
    edgeRoutes.set(elkEdge.id, { path: pointsToSvgPath(points), points });
  }

  return { nodes: nodePositions, edges: edgeRoutes };
}
