import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH } from "./ActivityNode";
import type { ConstraintEdgeData } from "./types";

const elk = new ELK();

type Point = { x: number; y: number };

/** Build an SVG path `d` attribute from a sequence of points.
 *  Groups into cubic Bezier segments (triples) with quadratic / line fallbacks. */
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

/**
 * Project from rect center toward a target point, returning the boundary
 * intersection of a rounded rectangle. The border radius (`r`) clips the
 * corners into quarter-circle arcs; the flat sides are shortened accordingly.
 * Falls back to a plain rect when r ≤ 0.
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
  // Parametric ray: P = center + t*(cos, sin).  Solve |P - corner|² = r².
  const ocx = center.x - cornerCx;
  const ocy = center.y - cornerCy;
  const a = 1; // cos²+sin² = 1
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

interface LayoutOptions {
  direction?: "RIGHT" | "DOWN";
  preservePositions?: boolean;
}

/** Run ELK on the given nodes+edges and return new arrays with positions + routed edges. */
export async function computeElkLayout<N extends Node>(
  nodes: N[],
  edges: Edge[],
  options?: LayoutOptions,
): Promise<{ nodes: N[]; edges: Edge[] }> {
  const direction = options?.direction ?? "RIGHT";
  const preservePositions = options?.preservePositions ?? false;

  const inputPositions = new Map<string, Point>();
  if (preservePositions) {
    for (const n of nodes) inputPositions.set(n.id, { x: n.position.x, y: n.position.y });
  }

  const layoutOptions: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": direction,
    "elk.edgeRouting": "SPLINES",
    "elk.spacing.nodeNode": "25",
    "elk.layered.spacing.nodeNodeBetweenLayers": "20",
    "elk.spacing.edgeNode": "20",
    "elk.spacing.edgeEdge": "25",
    "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
    "elk.layered.spacing.edgeNodeBetweenLayers": "18",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  };

  // Count label "items" per edge so we can tell ELK roughly how wide each label is.
  // One `each` dot is ~10px wide; one `any`/`all` dot is ~17px wide (matches MultiDot).
  function edgeLabelWidth(e: Edge): number {
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

  const elkGraph = {
    id: "root",
    layoutOptions,
    children: nodes.map((n) => ({
      id: n.id,
      width: ACT_NODE_WIDTH,
      height: ACT_NODE_HEIGHT,
      ...(preservePositions ? { x: n.position.x, y: n.position.y } : {}),
    })),
    edges: edges.map((e) => {
      // For EP/DP edges, reverse source/target so ELK follows temporal order.
      const data = e.data as ConstraintEdgeData | undefined;
      const isBack = data?.arcType === "EP" || data?.arcType === "DP";
      const shouldReverse = isBack && !preservePositions;
      const labelWidth = edgeLabelWidth(e);
      return {
        id: e.id,
        sources: [shouldReverse ? e.target : e.source],
        targets: [shouldReverse ? e.source : e.target],
        labels: [
          {
            id: `${e.id}-label`,
            text: "l",
            width: labelWidth,
            height: 14,
            layoutOptions: {
              "elk.edgeLabels.placement": "CENTER",
            },
          },
        ],
      };
    }),
  };

  const layouted = await elk.layout(elkGraph as unknown as Parameters<typeof elk.layout>[0]);

  const elkPositions = new Map<string, Point>();
  const elkCenters = new Map<string, Point>();
  for (const c of layouted.children ?? []) {
    const pos = { x: c.x ?? 0, y: c.y ?? 0 };
    elkPositions.set(c.id, pos);
    elkCenters.set(c.id, {
      x: pos.x + (c.width ?? ACT_NODE_WIDTH) / 2,
      y: pos.y + (c.height ?? ACT_NODE_HEIGHT) / 2,
    });
  }

  const canonicalPositions = preservePositions ? inputPositions : elkPositions;
  const canonicalCenters = new Map<string, Point>();
  for (const [id, pos] of canonicalPositions) {
    canonicalCenters.set(id, {
      x: pos.x + ACT_NODE_WIDTH / 2,
      y: pos.y + ACT_NODE_HEIGHT / 2,
    });
  }

  const layoutedNodes = nodes.map((node): N => {
    const pos = canonicalPositions.get(node.id);
    return { ...node, position: { x: pos?.x ?? node.position.x, y: pos?.y ?? node.position.y } };
  });

  const halfW = ACT_NODE_WIDTH / 2;
  const halfH = ACT_NODE_HEIGHT / 2;

  const layoutedEdges = edges.map((edge): Edge => {
    const elkEdge = (layouted.edges as { id: string; sections?: unknown[] }[] | undefined)?.find(
      (e) => e.id === edge.id,
    );
    const section = elkEdge?.sections?.[0] as
      | { startPoint: Point; endPoint: Point; bendPoints?: Point[] }
      | undefined;
    const data = edge.data as ConstraintEdgeData | undefined;
    const isBack = data?.arcType === "EP" || data?.arcType === "DP";

    const canonSrcPos = canonicalPositions.get(edge.source) ?? { x: 0, y: 0 };
    const canonTgtPos = canonicalPositions.get(edge.target) ?? { x: 0, y: 0 };
    const canonSrcCenter = canonicalCenters.get(edge.source) ?? { x: halfW, y: halfH };
    const canonTgtCenter = canonicalCenters.get(edge.target) ?? { x: halfW, y: halfH };

    if (section) {
      let points: Point[] = [
        { x: section.startPoint.x, y: section.startPoint.y },
        ...((section.bendPoints ?? []) as Point[]),
        { x: section.endPoint.x, y: section.endPoint.y },
      ];
      // Reverse if ELK saw the edge flipped (EP/DP).
      if (isBack && !preservePositions) points = [...points].reverse();
      // Snap endpoints to actual node borders (removes the gap from edgeNode spacing).
      points = snapEndpointsToNodeBorders(points, canonSrcCenter, canonTgtCenter, halfW, halfH);
      const routedPath = pointsToSvgPath(points);
      return {
        ...edge,
        data: {
          ...edge.data,
          routedPath,
          routedPoints: points,
          layoutSourcePos: canonSrcPos,
          layoutTargetPos: canonTgtPos,
        },
      };
    }

    return {
      ...edge,
      data: {
        ...edge.data,
        layoutSourcePos: canonSrcPos,
        layoutTargetPos: canonTgtPos,
      },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
