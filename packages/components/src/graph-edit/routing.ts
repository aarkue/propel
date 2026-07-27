/** Edge geometry shared by every graph surface (on-screen and SVG export), keyed by endpoint shape/size rather than domain node kind. */
import { getIntersectionCirc, getIntersectionRect } from "./intersection";

export type Pt = { x: number; y: number };

/** An endpoint's border shape and extent, used to clip an edge at the node border. */
export type NodeGeom = { shape: "circle" | "box"; width: number; height: number };

/** Anchored at the base (`refX`): the line stops at the wide base, the tip reaches the border. */
export const ARROW = {
  viewBox: "0 0 12 12",
  refX: 1,
  refY: 6,
  path: "M 1,1 L 11,6 L 1,11 Z",
} as const;

export function markerSizeFor(strokeWidth: number): number {
  return Math.max(12, strokeWidth * 2.5);
}
export function endGapFor(markerSize: number): number {
  return markerSize * (10 / 12);
}

export function roundedPolyline(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = { x: p1.x - ((p1.x - p0.x) / l1) * rr, y: p1.y - ((p1.y - p0.y) / l1) * rr };
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * rr, y: p1.y + ((p2.y - p1.y) / l2) * rr };
    d += ` L ${a.x},${a.y} Q ${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

export function shortenEnd(pts: Pt[], by: number): Pt[] {
  if (pts.length < 2 || by <= 0) return pts;
  const out = pts.map((p) => ({ ...p }));
  const n = out.length;
  const a = out[n - 2];
  const b = out[n - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len > by) out[n - 1] = { x: b.x - ((b.x - a.x) / len) * by, y: b.y - ((b.y - a.y) / len) * by };
  return out;
}

/** The point at arc-length fraction `frac` (clamped to 0..1) along a polyline. */
export function polylinePointAt(pts: Pt[], frac: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(s);
    total += s;
  }
  let target = total * Math.min(1, Math.max(0, frac));
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const t = segs[i] === 0 ? 0 : target / segs[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    target -= segs[i];
  }
  return pts[pts.length - 1];
}

export function polylineMidpoint(pts: Pt[]): Pt {
  return polylinePointAt(pts, 0.5);
}

/** Bend points captured at layout time; `srcPos`/`tgtPos` are the endpoint centres then, used to
 *  detect a later drag. */
export type EdgeRouting = { points: Pt[]; srcPos: Pt; tgtPos: Pt };

/** The un-rounded, un-shortened polyline: routed bend points, or a straight border-to-border
 *  fallback. Export builders do their own rounding and marker-gap shortening. */
export function edgeRawPoints(opts: {
  sourceCenter: Pt;
  targetCenter: Pt;
  source: NodeGeom;
  target: NodeGeom;
  routing?: EdgeRouting;
}): Pt[] {
  const { sourceCenter, targetCenter, source, target, routing } = opts;
  if (routing && routing.points.length >= 2) {
    const pts = routing.points.map((p) => ({ ...p }));
    const srcDx = sourceCenter.x - routing.srcPos.x;
    const srcDy = sourceCenter.y - routing.srcPos.y;
    const tgtDx = targetCenter.x - routing.tgtPos.x;
    const tgtDy = targetCenter.y - routing.tgtPos.y;
    // Shift only the endpoint whose node moved, keeping the bend points.
    if (srcDx !== 0 || srcDy !== 0) pts[0] = { x: pts[0].x + srcDx, y: pts[0].y + srcDy };
    if (tgtDx !== 0 || tgtDy !== 0) {
      const n = pts.length;
      pts[n - 1] = { x: pts[n - 1].x + tgtDx, y: pts[n - 1].y + tgtDy };
    }
    return pts;
  }

  const interTarget =
    target.shape === "box"
      ? getIntersectionRect(
          sourceCenter.x,
          sourceCenter.y,
          targetCenter.x,
          targetCenter.y,
          target.width,
          target.height,
        )
      : getIntersectionCirc(sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y, target.width);
  const interSource =
    source.shape === "box"
      ? getIntersectionRect(
          targetCenter.x,
          targetCenter.y,
          sourceCenter.x,
          sourceCenter.y,
          source.width,
          source.height,
        )
      : getIntersectionCirc(targetCenter.x, targetCenter.y, sourceCenter.x, sourceCenter.y, source.width);
  return [interSource ?? sourceCenter, interTarget ?? targetCenter];
}

/** The drawn edge path plus its label anchor. */
export function edgeGeometry(opts: {
  sourceCenter: Pt;
  targetCenter: Pt;
  source: NodeGeom;
  target: NodeGeom;
  strokeWidth: number;
  routing?: EdgeRouting;
}): { path: string; labelX: number; labelY: number } {
  const { strokeWidth, routing } = opts;
  const endGap = endGapFor(markerSizeFor(strokeWidth));
  const pts = edgeRawPoints(opts);

  if (routing && routing.points.length >= 2) {
    const mid = polylineMidpoint(pts);
    return { path: roundedPolyline(shortenEnd(pts, endGap), 8), labelX: mid.x, labelY: mid.y };
  }

  const [start, rawEnd] = pts;
  const end = shortenEnd([start, rawEnd], endGap)[1] ?? rawEnd;
  return {
    path: `M ${start.x},${start.y} L ${end.x},${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2,
  };
}
