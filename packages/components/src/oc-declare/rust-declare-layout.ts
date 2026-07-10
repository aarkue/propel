import type { Edge, Node } from "@xyflow/react";
import { layoutGraph, type LayoutTransport } from "../rust-layout";
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

/** OC-declare layout backed by the Rust `layout_graph` engine (with edge-label spacing), bound to the
 *  given transport. EP/DP constraints are temporal-backward: reversed for layering, then flipped back
 *  so the drawn arrow still points source->target. Self-loops are routed in JS (Rust skips them). */
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
      labelSize: (e) => [edgeLabelWidth(e), LABEL_H],
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
      const points = snapEndpointsToNodeBorders(
        route,
        laid.centerOf(edge.source),
        laid.centerOf(edge.target),
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
}
