import type { Edge } from "@xyflow/react";
import { loadElk, type ElkGraph, type ElkPoint } from "../../../elk-layout/elk";
import type { ArcData, PetriNetNode } from "../Editor";
import { type ArcRouting, type PetriLayoutFn, nodeSize } from "./layout-graph";

/** ELK layered options for Petri nets. Mirrors the tuning used before the Rust engine landed
 *  (orthogonal routing, left->right, network-simplex placement). */
const PETRI_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "55",
  "elk.spacing.nodeNode": "40",
  "elk.spacing.edgeNode": "25",
  "elk.spacing.edgeEdge": "18",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
};

/**
 * ELK-backed Petri layout. Opt-in alternative to {@link layoutPetriNet}; produces the same
 * center-positioned nodes and bend-point `ArcRouting`, so the editor renders it identically.
 *
 * ELK has no cheap incremental relayout, so a seeded (drag) relayout is a no-op: nodes keep their
 * dragged positions and `edge-geometry` follows the moved endpoints live. Only the Rust engine does
 * stable drag-relayout.
 */
export const elkLayoutPetriNet: PetriLayoutFn = async (nodes, edges, options) => {
  if (options?.seed) return { nodes, edges }; // no ELK relayout on drag - see doc above

  const elk = await loadElk();
  const sizeById = new Map(nodes.map((n) => [n.id, nodeSize(n.type)]));
  const graph: ElkGraph = {
    id: "root",
    layoutOptions: PETRI_LAYOUT_OPTIONS,
    children: nodes.map((n) => {
      const s = nodeSize(n.type);
      return { id: n.id, width: s.width, height: s.height };
    }),
    // Self-loops carry no ELK route; edge-geometry draws them border-to-border.
    edges: edges
      .filter((e) => e.source !== e.target)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const result = await elk.layout(graph);

  const centerById = new Map(
    (result.children ?? []).map((c) => {
      const s = sizeById.get(c.id) ?? { width: 0, height: 0 };
      return [c.id, { x: (c.x ?? 0) + s.width / 2, y: (c.y ?? 0) + s.height / 2 }];
    }),
  );
  const centerOf = (id: string): ElkPoint => centerById.get(id) ?? { x: 0, y: 0 };

  const routeById = new Map((result.edges ?? []).map((e) => [e.id, e]));
  const routeOf = (e: Edge<ArcData>): ElkPoint[] => {
    const section = routeById.get(e.id)?.sections?.[0];
    if (!section) return [];
    return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
  };

  return {
    nodes: nodes.map((n) => ({ ...n, position: centerOf(n.id) }) as PetriNetNode),
    edges: edges.map((e) => ({
      ...e,
      type: "custom",
      data: {
        ...e.data,
        routing: {
          kind: "polyline",
          points: routeOf(e),
          srcPos: centerOf(e.source),
          tgtPos: centerOf(e.target),
        } as ArcRouting,
      },
    })),
  };
};
