// Layout for the blueprint graph: a plain layered DAG (Source -> Filter/Join/Union chains), no
// routed constraint-arc geometry or direction toggle baked in -- the same shape
// ocel-type-graph/elk-layout.ts's `layoutTypeGraph` already handles. Forked as its own one-file
// function (not a direct call to `layoutTypeGraph`) only to flip `elk.direction` to "RIGHT":
// left-to-right reads better for a Source -> Filter -> Join data-flow chain than top-down, and
// Join/Union nodes need taller boxes to fit their labeled handles. Everything else -- the ELK
// options block, edge routing, endpoint snapping -- is `layoutTypeGraph`'s, not reinvented; see
// ../elk-layout/elk.ts for the primitives (`loadElk`, `pointsToSvgPath`, `snapEndpoints`).
import { type ElkGraph, loadElk } from "../elk-layout/elk";
import { pointsToSvgPath, snapEndpoints } from "../ocel-type-graph/elk-layout";
import type { DerivedEdge, EditorMapping, EditorNode } from "./model";
import { NODE_SIZE } from "./nodes/types";

export type Point = { x: number; y: number };

export interface LayoutResult {
  nodes: Map<string, Point>;
  edges: Map<string, { path: string; points: Point[] }>;
}

/** Mappings are laid out alongside the row graph, in the same call: they are nodes on the same
 *  canvas, so laying them out separately would put them in their own coordinate space. */
export type BlueprintLayoutFn = (
  nodes: EditorNode[],
  edges: DerivedEdge[],
  mappings?: EditorMapping[],
) => Promise<LayoutResult>;

/** Node boxes grow with their content (a Source node's column list, a mapping's summary lines), so
 *  these are estimates -- ELK only needs them to be in the right ballpark to avoid overlap. */
function sizeOf(n: EditorNode) {
  return NODE_SIZE[n.op.type] ?? NODE_SIZE.filter;
}

/** Layered ELK layout, left-to-right, with SPLINE edge routing (mirrors `layoutTypeGraph`). */
export const layoutBlueprintGraph: BlueprintLayoutFn = async (nodes, edges, mappings = []) => {
  const graph: ElkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.edgeNode": "20",
      "elk.spacing.edgeEdge": "14",
      "elk.edgeRouting": "SPLINES",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: [
      ...nodes.map((n) => ({ id: n.id, width: sizeOf(n).width, height: sizeOf(n).height })),
      ...mappings.map((m) => ({
        id: m.id,
        width: NODE_SIZE.mapping.width,
        height: NODE_SIZE.mapping.height,
      })),
    ],
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const elk = await loadElk();
  const laid = await elk.layout(graph);

  const sizeById = new Map<string, { width: number; height: number }>([
    ...nodes.map((n) => [n.id, sizeOf(n)] as const),
    ...mappings.map((m) => [m.id, NODE_SIZE.mapping] as const),
  ]);
  const nodePositions = new Map<string, Point>();
  for (const child of laid.children ?? []) {
    nodePositions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const edgeRoutes = new Map<string, { path: string; points: Point[] }>();
  for (const elkEdge of laid.edges ?? []) {
    const section = elkEdge.sections?.[0];
    if (!section) continue;
    let points: Point[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    const e = edgeById.get(elkEdge.id);
    const srcPos = e && nodePositions.get(e.source);
    const tgtPos = e && nodePositions.get(e.target);
    const srcSize = e && sizeById.get(e.source);
    const tgtSize = e && sizeById.get(e.target);
    if (srcPos && tgtPos && srcSize && tgtSize) {
      const srcCenter = { x: srcPos.x + srcSize.width / 2, y: srcPos.y + srcSize.height / 2 };
      const tgtCenter = { x: tgtPos.x + tgtSize.width / 2, y: tgtPos.y + tgtSize.height / 2 };
      points = snapEndpoints(
        points,
        srcCenter,
        tgtCenter,
        srcSize.width / 2,
        srcSize.height / 2,
        tgtSize.width / 2,
        tgtSize.height / 2,
      );
    }
    edgeRoutes.set(elkEdge.id, { path: pointsToSvgPath(points), points });
  }

  return { nodes: nodePositions, edges: edgeRoutes };
};
