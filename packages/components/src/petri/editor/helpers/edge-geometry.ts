import { getIntersectionCirc, getIntersectionRect } from "./intersection-calculator";
import { nodeSize } from "./layout-graph";
import type { PetriNetNode } from "../Editor";

export type Pt = { x: number; y: number };

/** Arrow marker geometry, shared by the live edge and the SVG export so they
 *  match. Anchored at the base (`refX`) so the triangle extends forward over the
 *  line end: line stops at the wide base, tip reaches the node border. */
export const ARROW = {
  viewBox: "0 0 12 12",
  refX: 1,
  refY: 6,
  path: "M 1,1 L 11,6 L 1,11 Z",
} as const;

/** Arrow size barely tracks stroke width (covers a thick line without ballooning). */
export function markerSizeFor(strokeWidth: number): number {
  return Math.max(12, strokeWidth * 2.5);
}
/** How far ahead of the path end the arrow tip lands (= how much to shorten the line). */
export function endGapFor(markerSize: number): number {
  return markerSize * (10 / 12);
}

/** SVG path through `pts` with corners rounded by radius `r`. */
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

/** Pull the final point back along the last segment by `by` units. */
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

/** Length-weighted midpoint of a polyline. */
export function polylineMidpoint(pts: Pt[]): Pt {
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(s);
    total += s;
  }
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= total / 2) {
      const t = segs[i] === 0 ? 0 : (total / 2 - acc) / segs[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    acc += segs[i];
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}

export type ArcRoutingLite = { points: Pt[]; srcPos: Pt; tgtPos: Pt };

/**
 * The full arc path (rounded ELK routing, following a dragged endpoint; or a
 * straight border-to-border fallback) plus its label anchor. Single source of
 * truth for both the on-screen `CustomEdge` and the SVG export.
 */
export function arcGeometry(opts: {
  sourceCenter: Pt;
  targetCenter: Pt;
  sourceType: PetriNetNode["type"];
  targetType: PetriNetNode["type"];
  strokeWidth: number;
  routing?: ArcRoutingLite;
}): { path: string; labelX: number; labelY: number } {
  const { sourceCenter, targetCenter, sourceType, targetType, strokeWidth, routing } = opts;
  const endGap = endGapFor(markerSizeFor(strokeWidth));

  if (routing && routing.points.length >= 2) {
    const pts = routing.points.map((p) => ({ ...p }));
    const srcDx = sourceCenter.x - routing.srcPos.x;
    const srcDy = sourceCenter.y - routing.srcPos.y;
    const tgtDx = targetCenter.x - routing.tgtPos.x;
    const tgtDy = targetCenter.y - routing.tgtPos.y;
    // Follow a dragged node by shifting just the matching endpoint, keeping the
    // bend points (the endpoint stays on the moved node's border).
    if (srcDx !== 0 || srcDy !== 0) pts[0] = { x: pts[0].x + srcDx, y: pts[0].y + srcDy };
    if (tgtDx !== 0 || tgtDy !== 0) {
      const n = pts.length;
      pts[n - 1] = { x: pts[n - 1].x + tgtDx, y: pts[n - 1].y + tgtDy };
    }
    const mid = polylineMidpoint(pts);
    return { path: roundedPolyline(shortenEnd(pts, endGap), 8), labelX: mid.x, labelY: mid.y };
  }

  const tSize = nodeSize(targetType);
  const sSize = nodeSize(sourceType);
  const interTarget =
    targetType === "transition"
      ? getIntersectionRect(
          sourceCenter.x,
          sourceCenter.y,
          targetCenter.x,
          targetCenter.y,
          tSize.width,
          tSize.height,
        )
      : getIntersectionCirc(sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y, tSize.width);
  const interSource =
    sourceType === "transition"
      ? getIntersectionRect(
          targetCenter.x,
          targetCenter.y,
          sourceCenter.x,
          sourceCenter.y,
          sSize.width,
          sSize.height,
        )
      : getIntersectionCirc(targetCenter.x, targetCenter.y, sourceCenter.x, sourceCenter.y, sSize.width);
  const start = interSource ?? sourceCenter;
  const rawEnd = interTarget ?? targetCenter;
  const end = shortenEnd([start, rawEnd], endGap)[1] ?? rawEnd;
  return {
    path: `M ${start.x},${start.y} L ${end.x},${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2,
  };
}
