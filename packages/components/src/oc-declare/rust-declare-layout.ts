import type { Edge, Node } from "@xyflow/react";
import { layoutGraph, type LayoutTransport } from "../rust-layout";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH } from "./ActivityNode";
import {
  assignArcLanes,
  type DeclareLayoutFn,
  type DeclareLayoutOptions,
  edgeLabelWidth,
  fanArcRoute,
  roundedPointsToSvgPath,
  selfLoopPoints,
  snapEndpointsToNodeBorders,
  straightenClearRoute,
} from "./layout-util";
import type { ConstraintEdgeData } from "./types";

const LABEL_H = 16;

type Point = { x: number; y: number };

/** OC-declare layout backed by the Rust `layout_graph` engine, bound to the given transport. EP/DP
 *  constraints are reversed for layering then flipped back so the arrow still points source->target. */
export function createRustDeclareLayout(transport: LayoutTransport): DeclareLayoutFn {
  return async <N extends Node>(
    nodes: N[],
    edges: Edge[],
    options?: DeclareLayoutOptions<N>,
  ): Promise<{ nodes: N[]; edges: Edge[] }> => {
    const laid = await layoutGraph(nodes, edges, {
      transport,
      id: (n) => n.id,
      source: (e) => e.source,
      target: (e) => e.target,
      direction: options?.direction === "DOWN" ? "TB" : "LR",
      flowEdges: true,
      reroute: options?.reroute,
      nodeSpec: (n) => {
        const s = options?.seed?.(n);
        return {
          width: ACT_NODE_WIDTH,
          height: ACT_NODE_HEIGHT,
          seed: s ? ([s.x, s.y] as [number, number]) : undefined,
          pinned: s?.pinned,
        };
      },
      labelSize: (e) => [edgeLabelWidth(e, options?.textLabels), LABEL_H],
      reverse: (e) => {
        const at = (e.data as ConstraintEdgeData | undefined)?.arcType;
        return at === "EP" || at === "DP";
      },
    });

    const halfW = ACT_NODE_WIDTH / 2;
    const halfH = ACT_NODE_HEIGHT / 2;
    const topLeftOf = (id: string): Point => {
      const c = laid.centerOf(id);
      return { x: c.x - halfW, y: c.y - halfH };
    };
    const centers = nodes.map((n) => ({ id: n.id, c: laid.centerOf(n.id) }));
    const arcLanes = assignArcLanes(edges);

    const layoutedNodes = nodes.map((n): N => ({ ...n, position: topLeftOf(n.id) }));

    const layoutedEdges = edges.map((edge): Edge => {
      const srcTL = topLeftOf(edge.source);
      const tgtTL = topLeftOf(edge.target);

      if (edge.source === edge.target) {
        const points = selfLoopPoints(laid.centerOf(edge.source), halfW, halfH);
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

      const route = laid.routeOf(edge);
      if (!route || route.length < 2) {
        return { ...edge, data: { ...edge.data, layoutSourcePos: srcTL, layoutTargetPos: tgtTL } };
      }
      const srcC = laid.centerOf(edge.source);
      const tgtC = laid.centerOf(edge.target);
      const snapped = snapEndpointsToNodeBorders(route, srcC, tgtC, halfW, halfH);
      // Multi-arc pair: fan each arc into its own lane. Lone arc: straighten a cosmetic jog.
      const lane = arcLanes.get(edge.id);
      let points: Point[];
      if (lane && lane.total > 1) {
        points = fanArcRoute(srcC, tgtC, lane, edge.source > edge.target, halfW, halfH);
      } else {
        const obstacles = centers.filter((n) => n.id !== edge.source && n.id !== edge.target).map((n) => n.c);
        points = straightenClearRoute(snapped, srcC, tgtC, obstacles, halfW, halfH);
      }
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
}
