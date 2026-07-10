import {
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Position,
  useInternalNode,
} from "@xyflow/react";
import { useId } from "react";
import { type FlowDirection, selfLoopBezier } from "./util/self-loop";

// ---- Geometry helpers ----

type Pt = { x: number; y: number };

/** Render plain waypoints (the Rust engine) as a polyline with circular-arc rounded corners,
 *  matching the Rust SVG's `rounded_polyline`. `r` is the max corner radius. */
function roundedPolylinePath(pts: Pt[], r: number): string {
  if (pts.length === 0) return "";
  if (pts.length <= 2) {
    return pts.length === 1
      ? `M ${pts[0].x},${pts[0].y}`
      : `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
  }
  const parts: string[] = [`M ${pts[0].x},${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const v1x = p0.x - p1.x;
    const v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = { x: p1.x + (v1x / l1) * rr, y: p1.y + (v1y / l1) * rr };
    const b = { x: p1.x + (v2x / l2) * rr, y: p1.y + (v2y / l2) * rr };
    parts.push(`L ${a.x},${a.y} Q ${p1.x},${p1.y} ${b.x},${b.y}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last.x},${last.y}`);
  return parts.join(" ");
}

/** Trim the last segment by `shortenEnd` so the arrowhead lands just off the node border. */
function shortenLastSegment(pts: Pt[], shortenEnd: number): Pt[] {
  if (shortenEnd <= 0 || pts.length < 2) return pts;
  const out = pts.map((p) => ({ ...p }));
  const last = out[out.length - 1];
  const prev = out[out.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len > shortenEnd) {
    out[out.length - 1] = { x: last.x - (dx / len) * shortenEnd, y: last.y - (dy / len) * shortenEnd };
  }
  return out;
}

// ---- Types ----

export type EdgeRouting = {
  kind: "polyline";
  /** Plain waypoints (the Rust engine), rendered as a rounded polyline. */
  points: { x: number; y: number }[];
  srcPos: { x: number; y: number };
  tgtPos: { x: number; y: number };
};

export interface DfgEdgeData extends Record<string, unknown> {
  label: string;
  color: string;
  /** Object type this arc belongs to (OC-DFG only); drives per-type layout reconstruction. */
  group?: string;
  routing?: EdgeRouting;
  /** 0-based index among parallel edges sharing the same (source, target). */
  parallelIndex?: number;
  /** Total number of parallel edges sharing the same (source, target). */
  parallelCount?: number;
  /** Post-layout label displacement to avoid overlaps. */
  labelOffset?: { dx: number; dy: number };
  /** Layout flow direction, so self-loops sit on the free cross-axis (right in TB, bottom in LR). */
  direction?: FlowDirection;
}

export type DfgEdgeType = Edge<DfgEdgeData, "default">;

// ---- Component ----

/**
 * Shared DFG edge component. Renders the Rust engine's rounded-polyline routing,
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
    const { p0, c1, c2, p3, labelX: lx, labelY: ly } = selfLoopBezier(
      { x: nx, y: ny, width: nw, height: nh },
      data.parallelIndex ?? 0,
      sw,
      data.direction ?? "TB",
    );
    edgePath = `M ${p0.x},${p0.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`;
    labelX = lx;
    labelY = ly;
  } else if (data.routing?.kind === "polyline" && data.routing.points.length >= 2) {
    let pts = data.routing.points.map((p) => ({ x: p.x, y: p.y }));

    // Follow dragged nodes: shift the routed endpoints by the node's displacement since layout.
    const srcDx = sourceNode.position.x - data.routing.srcPos.x;
    const srcDy = sourceNode.position.y - data.routing.srcPos.y;
    const tgtDx = targetNode.position.x - data.routing.tgtPos.x;
    const tgtDy = targetNode.position.y - data.routing.tgtPos.y;
    if (srcDx !== 0 || srcDy !== 0) pts[0] = { x: pts[0].x + srcDx, y: pts[0].y + srcDy };
    if (tgtDx !== 0 || tgtDy !== 0) {
      const n = pts.length;
      pts[n - 1] = { x: pts[n - 1].x + tgtDx, y: pts[n - 1].y + tgtDy };
    }

    // The arrow marker's tip sits 0.35.markerSize ahead of the path's last point (refX=7 in a 20u
    // viewBox, tip at x=14). Shorten the path by exactly that so the tip lands ON the target border
    // instead of `halfSw` past it (which drove the head into the node).
    const shortenEnd = 0.35 * markerSize;
    pts = shortenLastSegment(pts, shortenEnd);

    edgePath = roundedPolylinePath(pts, 18);

    const anchors = pts;
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
              // Halo (panel-colored glow) instead of a filled chip: keeps the number legible over
              // arcs without a hard box cluttering the graph. Mirrors the SVG export's stroke halo.
              // Stacked layers build a dense, near-opaque glow so the digits read over dark arcs.
              textShadow:
                "0 0 2px var(--color-panel-solid), 0 0 2px var(--color-panel-solid), 0 0 2px var(--color-panel-solid), 0 0 3px var(--color-panel-solid), 0 0 4px var(--color-panel-solid)",
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
