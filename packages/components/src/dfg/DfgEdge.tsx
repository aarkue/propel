import {
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Position,
  useInternalNode,
} from "@xyflow/react";
import { useId } from "react";

// ---- Geometry helpers ----

/**
 * Render a point chain produced by ELK's SPLINES edge routing as an SVG path.
 * With SPLINES, ELK returns [startPoint, ...bendPoints, endPoint] where bend
 * points are cubic-bezier control points (c1, c2, end) per segment. If the
 * chain length is 1 + 3N we emit N cubic segments; otherwise we fall back to
 * Catmull-Rom smoothing.
 */
function splinePath(chain: { x: number; y: number }[]): string {
  if (chain.length === 0) return "";
  if (chain.length === 1) return `M ${chain[0].x},${chain[0].y}`;

  if ((chain.length - 1) % 3 === 0 && chain.length >= 4) {
    const parts: string[] = [`M ${chain[0].x},${chain[0].y}`];
    for (let i = 1; i + 2 < chain.length; i += 3) {
      parts.push(
        `C ${chain[i].x},${chain[i].y} ${chain[i + 1].x},${chain[i + 1].y} ${chain[i + 2].x},${chain[i + 2].y}`,
      );
    }
    return parts.join(" ");
  }

  if (chain.length === 2) {
    return `M ${chain[0].x},${chain[0].y} L ${chain[1].x},${chain[1].y}`;
  }
  const tension = 1;
  const parts: string[] = [`M ${chain[0].x},${chain[0].y}`];
  for (let i = 0; i < chain.length - 1; i++) {
    const p0 = i === 0 ? chain[0] : chain[i - 1];
    const p1 = chain[i];
    const p2 = chain[i + 1];
    const p3 = i + 2 < chain.length ? chain[i + 2] : chain[i + 1];
    const c1x = p1.x + ((p2.x - p0.x) * tension) / 6;
    const c1y = p1.y + ((p2.y - p0.y) * tension) / 6;
    const c2x = p2.x - ((p3.x - p1.x) * tension) / 6;
    const c2y = p2.y - ((p3.y - p1.y) * tension) / 6;
    parts.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`);
  }
  return parts.join(" ");
}

// ---- Rect-clipping helpers for cubic bezier splines ----
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

function ptInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicPt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function splitCubicRight(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] {
  const a = lerpPt(p0, p1, t);
  const b = lerpPt(p1, p2, t);
  const c = lerpPt(p2, p3, t);
  const d = lerpPt(a, b, t);
  const e = lerpPt(b, c, t);
  const f = lerpPt(d, e, t);
  return [f, e, c, p3];
}

function splitCubicLeft(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] {
  const a = lerpPt(p0, p1, t);
  const b = lerpPt(p1, p2, t);
  const c = lerpPt(p2, p3, t);
  const d = lerpPt(a, b, t);
  const e = lerpPt(b, c, t);
  const f = lerpPt(d, e, t);
  return [p0, a, d, f];
}

/**
 * Clip a 1+3N cubic-spline point chain so endpoints land on the source /
 * target rectangle borders.
 */
function clipSplineToRects(pts: Pt[], srcRect: Rect | null, tgtRect: Rect | null, shortenEnd = 0): Pt[] {
  const isCubicChain = (pts.length - 1) % 3 === 0 && pts.length >= 4;
  const result = pts.map((p) => ({ ...p }));

  if (!isCubicChain) {
    if (shortenEnd > 0 && result.length >= 2) {
      const last = result[result.length - 1];
      const prev = result[result.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy);
      if (len > shortenEnd) {
        result[result.length - 1] = {
          x: last.x - (dx / len) * shortenEnd,
          y: last.y - (dy / len) * shortenEnd,
        };
      }
    }
    return result;
  }
  const STEPS = 20;

  if (srcRect && ptInRect(result[0], srcRect)) {
    const [p0, p1, p2, p3] = [result[0], result[1], result[2], result[3]];
    let exitT = -1;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      if (!ptInRect(cubicPt(p0, p1, p2, p3, t), srcRect)) {
        exitT = t;
        break;
      }
    }
    if (exitT > 0) {
      let lo = exitT - 1 / STEPS;
      let hi = exitT;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (ptInRect(cubicPt(p0, p1, p2, p3, mid), srcRect)) lo = mid;
        else hi = mid;
      }
      const [rp0, rp1, rp2, rp3] = splitCubicRight(p0, p1, p2, p3, hi);
      result[0] = rp0;
      result[1] = rp1;
      result[2] = rp2;
      result[3] = rp3;
    }
  }

  const n = result.length;
  if (tgtRect && ptInRect(result[n - 1], tgtRect)) {
    const [p0, p1, p2, p3] = [result[n - 4], result[n - 3], result[n - 2], result[n - 1]];
    let entryT = -1;
    for (let i = STEPS - 1; i >= 0; i--) {
      const t = i / STEPS;
      if (!ptInRect(cubicPt(p0, p1, p2, p3, t), tgtRect)) {
        entryT = t;
        break;
      }
    }
    if (entryT >= 0) {
      let lo = entryT;
      let hi = entryT + 1 / STEPS;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (!ptInRect(cubicPt(p0, p1, p2, p3, mid), tgtRect)) lo = mid;
        else hi = mid;
      }
      const [lp0, lp1, lp2, lp3] = splitCubicLeft(p0, p1, p2, p3, lo);
      result[n - 4] = lp0;
      result[n - 3] = lp1;
      result[n - 2] = lp2;
      result[n - 1] = lp3;
    }
  }

  if (shortenEnd > 0 && result.length >= 2) {
    const last = result[result.length - 1];
    const prev = result[result.length - 2];
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > shortenEnd) {
      result[result.length - 1] = {
        x: last.x - (dx / len) * shortenEnd,
        y: last.y - (dy / len) * shortenEnd,
      };
    }
  }

  return result;
}

// ---- Types ----

export type EdgeRouting = {
  kind: "polyline";
  points: { x: number; y: number }[];
  srcPos: { x: number; y: number };
  tgtPos: { x: number; y: number };
};

export interface DfgEdgeData extends Record<string, unknown> {
  label: string;
  color: string;
  routing?: EdgeRouting;
  /** 0-based index among parallel edges sharing the same (source, target). */
  parallelIndex?: number;
  /** Total number of parallel edges sharing the same (source, target). */
  parallelCount?: number;
  /** Post-layout label displacement to avoid overlaps. */
  labelOffset?: { dx: number; dy: number };
}

export type DfgEdgeType = Edge<DfgEdgeData, "default">;

// ---- Component ----

/**
 * Shared DFG edge component. Renders ELK-routed splines with border snapping,
 * self-loops, or a bezier fallback. Includes a custom arrow marker that scales
 * with stroke width.
 */
export function DfgEdge(edge: EdgeProps<DfgEdgeType>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, style, data } = edge;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // Per-render-instance unique prefix: the same graph rendered twice (pipeline
  // preview + panel) must not emit colliding `<marker>` ids, or `url(#id)`
  // resolves across compositing layers to the first one and breaks.
  const uid = useId().replace(/[^\w-]/g, "");

  if (!data || !sourceNode || !targetNode) return null;

  const { label, color } = data;

  const sw =
    typeof (style as React.CSSProperties)?.strokeWidth === "number"
      ? ((style as React.CSSProperties).strokeWidth as number)
      : 2;
  const markerSize = Math.max(14, sw * 4);

  let edgePath: string;
  let labelX: number;
  let labelY: number;
  let arrowOrient = "auto";

  if (source === target) {
    const nw = sourceNode.measured?.width ?? 120;
    const nh = sourceNode.measured?.height ?? 52;
    const nx = sourceNode.internals.positionAbsolute.x;
    const ny = sourceNode.internals.positionAbsolute.y;
    const pIdx = data.parallelIndex ?? 0;
    const loopW = 36 + pIdx * 24;
    const arrowInset = markerSize * 0.35;
    const startX = nx + nw;
    const startY = ny + nh * 0.3;
    const endX = nx + nw + arrowInset;
    const endY = ny + nh * 0.7;
    edgePath = `M ${startX},${startY} C ${startX + loopW},${startY - 4} ${endX + loopW},${endY + 4} ${endX},${endY}`;
    labelX = startX + loopW * 0.75;
    labelY = (startY + endY) / 2;
  } else if (data.routing?.kind === "polyline" && data.routing.points.length >= 2) {
    const rawPts = data.routing.points;
    const isCubicChain = (rawPts.length - 1) % 3 === 0 && rawPts.length >= 4;

    const pts = rawPts.map((p) => ({ x: p.x, y: p.y }));

    const srcDx = sourceNode.position.x - data.routing.srcPos.x;
    const srcDy = sourceNode.position.y - data.routing.srcPos.y;
    const tgtDx = targetNode.position.x - data.routing.tgtPos.x;
    const tgtDy = targetNode.position.y - data.routing.tgtPos.y;
    if (srcDx !== 0 || srcDy !== 0) {
      pts[0] = { x: pts[0].x + srcDx, y: pts[0].y + srcDy };
      if (isCubicChain && pts.length >= 2) {
        pts[1] = { x: pts[1].x + srcDx, y: pts[1].y + srcDy };
      }
    }
    if (tgtDx !== 0 || tgtDy !== 0) {
      const n = pts.length;
      pts[n - 1] = { x: pts[n - 1].x + tgtDx, y: pts[n - 1].y + tgtDy };
      if (isCubicChain && pts.length >= 2) {
        pts[n - 2] = { x: pts[n - 2].x + tgtDx, y: pts[n - 2].y + tgtDy };
      }
    }

    const halfSw = sw / 2;
    const srcR: Rect = {
      x: sourceNode.internals.positionAbsolute.x,
      y: sourceNode.internals.positionAbsolute.y,
      w: sourceNode.measured?.width ?? 120,
      h: sourceNode.measured?.height ?? 52,
    };
    const tgtR: Rect = {
      x: targetNode.internals.positionAbsolute.x - halfSw,
      y: targetNode.internals.positionAbsolute.y - halfSw,
      w: (targetNode.measured?.width ?? 120) + sw,
      h: (targetNode.measured?.height ?? 52) + sw,
    };
    const shortenEnd = Math.max(0, 0.35 * markerSize - halfSw);
    const clipped = clipSplineToRects(pts, srcR, tgtR, shortenEnd);
    for (let i = 0; i < pts.length; i++) pts[i] = clipped[i];

    edgePath = splinePath(pts);

    const anchors = isCubicChain ? pts.filter((_, i) => i % 3 === 0) : pts;
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const dx = anchors[i].x - anchors[i - 1].x;
      const dy = anchors[i].y - anchors[i - 1].y;
      segs.push(Math.sqrt(dx * dx + dy * dy));
      total += segs[segs.length - 1];
    }
    let acc = 0;
    labelX = anchors[anchors.length - 1].x;
    labelY = anchors[anchors.length - 1].y;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= total / 2) {
        const t = segs[i] === 0 ? 0 : (total / 2 - acc) / segs[i];
        labelX = anchors[i].x + (anchors[i + 1].x - anchors[i].x) * t;
        labelY = anchors[i].y + (anchors[i + 1].y - anchors[i].y) * t;
        break;
      }
      acc += segs[i];
    }
    arrowOrient = "auto";
  } else {
    const [path, lx, ly] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Bottom,
      targetX,
      targetY,
      targetPosition: Position.Top,
    });
    edgePath = path;
    labelX = lx;
    labelY = ly;
  }

  if (data.labelOffset) {
    labelX += data.labelOffset.dx;
    labelY += data.labelOffset.dy;
  }

  const markerId = `dfg-arrow-${uid}-${id.replace(/[^\w-]/g, "_")}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth={markerSize}
          markerHeight={markerSize}
          viewBox="0 0 20 20"
          orient={arrowOrient}
          refX="7"
          refY="10"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 0,2 L 14,10 L 0,18 Z"
            fill={color}
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{ ...(style as React.CSSProperties), strokeLinecap: "butt" }}
        fill="none"
      />
      {label !== "" && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none font-semibold tabular-nums"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 10,
              color,
              background: "var(--color-panel-solid)",
              padding: "0 3px",
              borderRadius: 3,
              zIndex: 1,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const DFG_EDGE_TYPES = { default: DfgEdge };
