export type XY = { x: number; y: number };

/** Write a routed polyline onto a React Flow edge's `data` in place; `srcPos`/`tgtPos` let the on-screen edge re-deform the route when dragged. */
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
