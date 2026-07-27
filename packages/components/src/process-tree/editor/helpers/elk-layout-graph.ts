import { loadElk, type ElkGraph } from "../../../elk-layout/elk";
import { nodeSize, type ProcessTreeLayoutFn } from "./layout-graph";

/** `mrtree` is ELK's dedicated tree layout; the layered options do not apply to it. */
const TREE_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "mrtree",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "28",
};

/** ELK-backed process-tree layout. */
export const elkLayoutProcessTree: ProcessTreeLayoutFn = async (nodes, edges) => {
  const elk = await loadElk();
  const sizeById = new Map(nodes.map((n) => [n.id, nodeSize(n.type)]));
  const graph: ElkGraph = {
    id: "root",
    layoutOptions: TREE_LAYOUT_OPTIONS,
    children: nodes.map((n) => ({ id: n.id, ...nodeSize(n.type) })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(graph);

  const centerById = new Map(
    (result.children ?? []).map((c) => {
      const s = sizeById.get(c.id) ?? { width: 0, height: 0 };
      return [c.id, { x: (c.x ?? 0) + s.width / 2, y: (c.y ?? 0) + s.height / 2 }];
    }),
  );
  return {
    nodes: nodes.map((n) => ({ ...n, position: centerById.get(n.id) ?? { x: 0, y: 0 } })),
    edges,
  };
};
