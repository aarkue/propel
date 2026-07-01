import type { Edge, Node } from "@xyflow/react";
import ELK, { type LayoutOptions } from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

const defaultOptions = {
  "org.eclipse.elk.randomSeed": 2,
  "elk.direction": "DOWN",
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.baseValue": 4,
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
  "elk.spacing.nodeNode": "1",
};

// Apply layout in place, writing positions back onto `nodes` and ELK routing
// data onto `edges[].data.routing`.
export async function applyLayoutToNodes<N extends Record<string, unknown>>(
  nodes: Node<N>[],
  edges: Edge[],
  options: Partial<LayoutOptions> = {},
  nodeSizeGetter?: (node: Node<N>) => { width: number; height: number },
) {
  const layoutOptions = { ...defaultOptions, ...options };
  const graph = {
    id: "root",
    layoutOptions,
    children: nodes.map((n) => {
      const nodeSize = nodeSizeGetter !== undefined ? nodeSizeGetter(n) : { width: 160, height: 100 };
      return {
        id: n.id,
        width: nodeSize.width,
        height: nodeSize.height,
        properties: {},
        layoutOptions: (n as unknown as { layoutOptions?: Record<string, string> }).layoutOptions ?? {},
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      properties: {},
      layoutOptions: {},
    })),
  };
  await elk.layout(graph as unknown as Parameters<typeof elk.layout>[0]).then((resultRaw) => {
    const result = resultRaw as unknown as {
      children?: Array<{ id: string; x?: number; y?: number }>;
      edges?: Array<{
        id: string;
        sections?: Array<{
          startPoint: { x: number; y: number };
          endPoint: { x: number; y: number };
          bendPoints?: { x: number; y: number }[];
        }>;
      }>;
    };
    const { children, edges: routedEdges } = result;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edgeById = new Map(edges.map((e) => [e.id, e]));
    if (children !== undefined) {
      children.forEach((node) => {
        const n = nodeById.get(node.id);
        if (n !== undefined) {
          n.position = { x: node.x ?? 0, y: node.y ?? 0 };
        } else {
          console.warn(`[Layout] Node not found: ${node.id}`);
        }
      });
    }
    if (routedEdges !== undefined) {
      routedEdges.forEach((re) => {
        const e = edgeById.get(re.id);
        if (e === undefined) return;
        const section = re.sections?.[0];
        if (!section) return;
        const points: { x: number; y: number }[] = [];
        points.push({ x: section.startPoint.x, y: section.startPoint.y });
        if (Array.isArray(section.bendPoints)) {
          for (const bp of section.bendPoints) {
            points.push({ x: bp.x, y: bp.y });
          }
        }
        points.push({ x: section.endPoint.x, y: section.endPoint.y });
        // Capture the source/target node positions at layout time so the edge
        // renderer can detect if a node has been moved later and fall back to a
        // live-computed bezier rather than drawing a now-stale polyline.
        const srcNode = nodeById.get(e.source);
        const tgtNode = nodeById.get(e.target);
        (e as unknown as { data?: Record<string, unknown> }).data = {
          ...((e as unknown as { data?: Record<string, unknown> }).data ?? {}),
          routing: {
            kind: "polyline",
            points,
            srcPos: srcNode ? { x: srcNode.position.x, y: srcNode.position.y } : { x: 0, y: 0 },
            tgtPos: tgtNode ? { x: tgtNode.position.x, y: tgtNode.position.y } : { x: 0, y: 0 },
          },
        };
      });
    }
  });
}
