import { type LayoutTransport, layoutGraph } from "../rust-layout";
import {
  type LayoutResult,
  type LayoutNode,
  type LayoutEdge,
  type Point,
  pointsToSvgPath,
  roundedCornerControlPoints,
  simplifyWaypoints,
  snapEndpoints,
} from "./elk-layout";
import type { TypeGraphLayoutFn } from "./OcelTypeGraph";

// Cross-axis jog below this (px, layout space) is a routing artifact, not a real node-avoidance detour.
const WAYPOINT_SIMPLIFY_TOL = 24;
// Corner fillet radius (px, layout space); ~half a node height reads as a smooth turn.
const CORNER_RADIUS = 22;

/** `TypeGraphLayoutFn` backed by the generic Rust `layout_graph` engine via any {@link LayoutTransport}. */
/** A loop route bumping off the node's right side, upper-right border to lower-right border. */
function selfLoop(center: { x: number; y: number }, hw: number, hh: number): Point[] {
  const out = center.x + hw + 44;
  const top = center.y - hh * 0.5;
  const bot = center.y + hh * 0.5;
  return [
    { x: center.x + hw, y: top },
    { x: out, y: top },
    { x: out, y: bot },
    { x: center.x + hw, y: bot },
  ];
}

export function createRustTypeGraphLayout(
  transport: LayoutTransport,
  opts?: { diagonal?: boolean },
): TypeGraphLayoutFn {
  const flowDiagonal = opts?.diagonal ?? true;
  return async (nodes: LayoutNode[], edges: LayoutEdge[]): Promise<LayoutResult> => {
    const sizeById = new Map(nodes.map((n) => [n.id, { w: n.width, h: n.height }]));
    const laid = await layoutGraph(nodes, edges, {
      transport,
      id: (n) => n.id,
      source: (e) => e.source,
      target: (e) => e.target,
      nodeSpec: (n) => ({ width: n.width, height: n.height }),
      direction: "TB",
      flowEdges: true,
      flowDiagonal,
      // Hub-and-spoke relationship graph, not a flow; compact the cross axis so it doesn't spread too wide.
      compact: true,
    });

    const nodePositions = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const c = laid.centerOf(n.id);
      nodePositions.set(n.id, { x: c.x - n.width / 2, y: c.y - n.height / 2 });
    }

    const edgeRoutes = new Map<string, { path: string; points: Point[] }>();
    for (const e of edges) {
      const c = laid.centerOf(e.source);
      const size = sizeById.get(e.source);
      // The driver skips self-loops, so route them as a bump off the node's right side instead.
      if (e.source === e.target && size) {
        // Already a Bezier (4 control points); render/export directly.
        const points = selfLoop(c, size.w / 2, size.h / 2);
        edgeRoutes.set(e.id, { path: pointsToSvgPath(points), points });
        continue;
      }
      const route = laid.routeOf(e);
      const tgt = laid.centerOf(e.target);
      const tgtSize = sizeById.get(e.target);
      let points: Point[] = route && route.length >= 2 ? route : [c, tgt];
      if (size && tgtSize) {
        points = snapEndpoints(points, c, tgt, size.w / 2, size.h / 2, tgtSize.w / 2, tgtSize.h / 2);
      }
      // Collapse tiny cross-axis jogs before smoothing, so Catmull-Rom doesn't trace them into bumps/cusps.
      points = simplifyWaypoints(points, WAYPOINT_SIMPLIFY_TOL);
      // Round the engine's orthogonal/diagonal corners so on-screen and export draw ELK-like splines.
      const cp = roundedCornerControlPoints(points, CORNER_RADIUS);
      edgeRoutes.set(e.id, { path: pointsToSvgPath(cp), points: cp });
    }

    return { nodes: nodePositions, edges: edgeRoutes };
  };
}
