import type { DfgLayoutFn } from "../dfg/DfgGraph";
import { loadElk, type ElkGraph, type ElkPoint } from "./elk";
import { writeEdgeRouting } from "../dfg/util/edge-routing";

/** ELK layered options for directly-follows graphs (splines, network-simplex placement, model-order-aware crossing reduction). */
const DFG_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "90",
  "elk.spacing.edgeNode": "30",
  "elk.spacing.edgeEdge": "20",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
};

/** Shared ELK-backed `DfgLayoutFn` for the case-centric DFG and OC-DFG. ELK has no cheap incremental relayout, so a seeded (drag) relayout request is a no-op; only the Rust engine does stable drag-relayout. */
function makeElkDfgLayout(defaultDirection: "DOWN" | "RIGHT"): DfgLayoutFn {
  return async (nodes, edges, nodeSize, options) => {
    if (options?.seed) return; // no ELK relayout on drag

    // viewer's direction toggle wins over the baked-in default
    const direction =
      options?.direction === "LR" ? "RIGHT" : options?.direction === "TB" ? "DOWN" : defaultDirection;
    const elk = await loadElk();
    const graph: ElkGraph = {
      id: "root",
      layoutOptions: { ...DFG_LAYOUT_OPTIONS, "elk.direction": direction },
      children: nodes.map((n) => {
        const { width, height } = nodeSize(n);
        const layoutOptions: Record<string, string> = {};
        if (n.type === "terminal") {
          layoutOptions["elk.layered.layering.layerConstraint"] = n.data.kind === "start" ? "FIRST" : "LAST";
        }
        return { id: n.id, width, height, layoutOptions };
      }),
      // Self-loops are drawn separately by the renderer; keep them out of ELK.
      edges: edges
        .filter((e) => e.source !== e.target)
        .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    };

    const result = await elk.layout(graph);

    const posById = new Map((result.children ?? []).map((c) => [c.id, c]));
    for (const n of nodes) {
      const c = posById.get(n.id);
      if (c) n.position = { x: c.x ?? 0, y: c.y ?? 0 };
    }

    const routeById = new Map((result.edges ?? []).map((e) => [e.id, e]));
    const nodePos = (id: string): ElkPoint => {
      const n = nodes.find((nn) => nn.id === id);
      return { x: n?.position.x ?? 0, y: n?.position.y ?? 0 };
    };
    for (const e of edges) {
      if (e.source === e.target) continue;
      const section = routeById.get(e.id)?.sections?.[0];
      if (!section) continue;
      const points: ElkPoint[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      writeEdgeRouting(e, points, nodePos(e.source), nodePos(e.target));
    }
  };
}

/** ELK case-centric DFG layout (top-down). Opt-in alternative to {@link createRustDfgLayout}. */
export function createElkDfgLayout(): DfgLayoutFn {
  return makeElkDfgLayout("DOWN");
}

/** ELK OC-DFG layout. Opt-in alternative to {@link createRustOcdfgLayout}. */
export function createElkGraphLayout(direction: "TB" | "LR" = "TB"): DfgLayoutFn {
  return makeElkDfgLayout(direction === "LR" ? "RIGHT" : "DOWN");
}
