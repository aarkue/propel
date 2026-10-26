import type { GraphRequest, Layout } from "@r4pm/components";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "./types";

/** React Flow's measured size, or a guess for a node not rendered yet. */
function sizeOf(n: AppNode) {
  return { width: n.measured?.width || 200, height: n.measured?.height || 100 };
}

/** The pipeline as a left-to-right graphlay request: graph node `i` is `nodes[i]`. */
export function pipelineLayoutRequest(nodes: AppNode[], edges: Edge[]): GraphRequest {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const graphEdges: GraphRequest["graph"]["edges"] = [];
  for (const e of edges) {
    const source = index.get(e.source);
    const target = index.get(e.target);
    if (source === undefined || target === undefined || source === target) continue;
    graphEdges.push({ source, target });
  }
  return {
    graph: { nodes: nodes.map((n) => ({ size: sizeOf(n) })), edges: graphEdges },
    // Edges are drawn as curves between the handles, not along graphlay's routes, so the layer
    // gap leaves them room to bend.
    preset: "layered",
    options: { spacing: { layer_gap: 80 } },
  };
}

/** The nodes moved to where `layout`, a layout of {@link pipelineLayoutRequest}, put them. */
export function placeNodes(nodes: AppNode[], layout: Layout): AppNode[] {
  // graphlay places node centres, React Flow positions are top-left corners.
  return nodes.map((node, i) => {
    const { center, size } = layout.nodes[i];
    return { ...node, position: { x: center.x - size.width / 2, y: center.y - size.height / 2 } };
  });
}
