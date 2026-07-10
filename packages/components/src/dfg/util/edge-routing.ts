export type XY = { x: number; y: number };

/**
 * Write a routed polyline onto a React Flow edge's `data` (in place), the shape both the Rust and ELK
 * layout engines produce. `srcPos`/`tgtPos` are the layout-time node top-lefts, so the on-screen edge
 * can re-deform the route when a node is dragged. Loosely typed so the strict `DfgEdgeData` shape
 * isn't over-constrained.
 */
export function writeEdgeRouting(
  edge: { data?: Record<string, unknown> },
  points: XY[],
  srcPos: XY,
  tgtPos: XY,
): void {
  edge.data = {
    ...(edge.data ?? {}),
    routing: { kind: "polyline", points, srcPos, tgtPos },
  };
}
