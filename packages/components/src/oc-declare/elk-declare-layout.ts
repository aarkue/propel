import type { Edge, Node } from "@xyflow/react";
import { loadElk, type ElkGraph } from "../elk-layout/elk";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH } from "./ActivityNode";
import {
  type DeclareLayoutFn,
  type DeclareLayoutOptions,
  edgeLabelWidth,
  roundedPointsToSvgPath,
  selfLoopPoints,
  snapEndpointsToNodeBorders,
} from "./layout-util";
import type { ConstraintEdgeData } from "./types";

const LABEL_H = 16;

type Point = { x: number; y: number };

/** ELK layered options for the OC-declare constraint graph. Mirrors the tuning used before the Rust
 *  engine landed (splines, network-simplex placement, model-order-aware layering). */
const DECLARE_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
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

/** EP/DP constraints are temporal-backward - reverse them for layering, then flip the route back. */
function isReversed(e: Edge): boolean {
  const at = (e.data as ConstraintEdgeData | undefined)?.arcType;
  return at === "EP" || at === "DP";
}

/**
 * ELK-backed OC-declare layout. Opt-in alternative to {@link rustDeclareLayout}; produces the same
 * routed-edge data shape (`routedPath`/`routedPoints`/`layoutSourcePos`/`layoutTargetPos`) and reuses
 * the same border-snapping + rounding geometry, so `ConstraintEdge` renders it identically. Drag is
 * handled live by the edge component (`deformPoints`), not by re-running layout - same as Rust.
 */
export const elkDeclareLayout: DeclareLayoutFn = async <N extends Node>(
  nodes: N[],
  edges: Edge[],
  options?: DeclareLayoutOptions<N>,
): Promise<{ nodes: N[]; edges: Edge[] }> => {
  // ELK has no cheap incremental relayout; on drag the edge component deforms live. No-op the on-drop
  // reroute so dropped positions and existing routes are kept (mirrors the ELK DFG no-relayout intent).
  if (options?.reroute) return { nodes, edges };
  const elk = await loadElk();
  const graph: ElkGraph = {
    id: "root",
    layoutOptions: { ...DECLARE_LAYOUT_OPTIONS, "elk.direction": options?.direction ?? "RIGHT" },
    children: nodes.map((n) => ({ id: n.id, width: ACT_NODE_WIDTH, height: ACT_NODE_HEIGHT })),
    edges: edges
      .filter((e) => e.source !== e.target)
      .map((e) => {
        const rev = isReversed(e);
        return {
          id: e.id,
          sources: [rev ? e.target : e.source],
          targets: [rev ? e.source : e.target],
          labels: [
            {
              width: edgeLabelWidth(e),
              height: LABEL_H,
              layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
            },
          ],
        };
      }),
  };

  const result = await elk.layout(graph);

  const halfW = ACT_NODE_WIDTH / 2;
  const halfH = ACT_NODE_HEIGHT / 2;
  const topLeftById = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  const topLeftOf = (id: string): Point => topLeftById.get(id) ?? { x: 0, y: 0 };
  const centerOf = (id: string): Point => {
    const tl = topLeftOf(id);
    return { x: tl.x + halfW, y: tl.y + halfH };
  };

  const routeById = new Map((result.edges ?? []).map((e) => [e.id, e]));
  const routeOf = (e: Edge): Point[] | undefined => {
    const section = routeById.get(e.id)?.sections?.[0];
    if (!section) return undefined;
    const pts: Point[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    return isReversed(e) ? [...pts].reverse() : pts;
  };

  const layoutedNodes = nodes.map((n): N => ({ ...n, position: topLeftOf(n.id) }));

  const layoutedEdges = edges.map((edge): Edge => {
    const srcTL = topLeftOf(edge.source);
    const tgtTL = topLeftOf(edge.target);

    if (edge.source === edge.target) {
      const points = selfLoopPoints(centerOf(edge.source), halfW, halfH);
      return {
        ...edge,
        data: {
          ...edge.data,
          routedPath: roundedPointsToSvgPath(points, 14),
          routedPoints: points,
          layoutSourcePos: srcTL,
          layoutTargetPos: tgtTL,
        },
      };
    }

    const route = routeOf(edge);
    if (!route || route.length < 2) {
      return { ...edge, data: { ...edge.data, layoutSourcePos: srcTL, layoutTargetPos: tgtTL } };
    }
    const points = snapEndpointsToNodeBorders(
      route,
      centerOf(edge.source),
      centerOf(edge.target),
      halfW,
      halfH,
    );
    return {
      ...edge,
      data: {
        ...edge.data,
        routedPath: roundedPointsToSvgPath(points, 16),
        routedPoints: points,
        layoutSourcePos: srcTL,
        layoutTargetPos: tgtTL,
      },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
};
