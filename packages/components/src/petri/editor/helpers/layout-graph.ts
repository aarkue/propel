import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import { layoutGraph, type LayoutTransport } from "../../../rust-layout";

/** Canonical node sizes, shared by the layout engine, the node
 *  components (rendered width/height), and the edge border-clipping geometry. */
export const TRANSITION_SIZE = { width: 120, height: 52 } as const;
export const PLACE_SIZE = { width: 52, height: 52 } as const;

export function nodeSize(type: PetriNetNode["type"]): { width: number; height: number } {
  return type === "place" ? PLACE_SIZE : TRANSITION_SIZE;
}

/** Orthogonal bend-point routing captured for an arc. Points are in flow coordinates (graph
 *  top-left origin = flow space, node centers written as center). `srcPos`/`tgtPos` are the source/
 *  target node *center* positions at layout time, used to detect a later drag. */
export type ArcRouting = {
  kind: "polyline";
  points: { x: number; y: number }[];
  srcPos: { x: number; y: number };
  tgtPos: { x: number; y: number };
};

/**
 * Lay out a Petri net with the bundled Rust engine (orthogonal routing, left->right). Nodes are
 * positioned by their *center* (matching the editor's `nodeOrigin=[0.5,0.5]`) and edges carry
 * `type:"custom"` plus bend-point routing in `data.routing`.
 */
export type PetriLayoutOptions = {
  /** Stable relayout: seed each node at a centre and hold the un-dragged ones there. Return the
   *  current centre for every node and set `pinned` on the just-dragged one so it stays exactly
   *  where dropped. Return `undefined` for a node to leave it unseeded. Omit for a fresh layout. */
  seed?: (node: PetriNetNode) => { x: number; y: number; pinned?: boolean } | undefined;
  /** On-drop relayout: re-derive the grid from the seeded positions and re-route edges only (nodes
   *  stay exactly where dropped). Requires `seed` to cover every node. Omit for a fresh layout. */
  reroute?: boolean;
};

/** A pluggable Petri-net layout (same contract as {@link layoutPetriNet}): positions nodes by
 *  *center* and writes bend-point `ArcRouting` into each edge's `data.routing`. */
export type PetriLayoutFn = (
  nodes: PetriNetNode[],
  edges: Edge<ArcData>[],
  options?: PetriLayoutOptions,
) => Promise<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }>;

export function createRustPetriLayout(transport: LayoutTransport): PetriLayoutFn {
  return async (
    nodes: PetriNetNode[],
    edges: Edge<ArcData>[],
    options?: PetriLayoutOptions,
  ): Promise<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }> => {
    // Feed the engine the SAME canonical node order the Rust SVG export uses (places then transitions,
    // each sorted by id) so the on-screen layout is byte-identical to the export. Results map back by
    // id, so the render is unaffected by this ordering. Uniform weights also match the export.
    const ordered = [...nodes].sort((a, b) => {
      const ra = a.type === "place" ? 0 : 1;
      const rb = b.type === "place" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    // Object-centric nets carry an object type per place; map each distinct type to a stable index so
    // the engine keeps every type on a consistent lane (crossing-neutral). Plain Petri nets have no
    // type -> no category -> unchanged layout.
    const objectTypeIndex = new Map<string, number>();
    for (const t of [
      ...new Set(nodes.flatMap((n) => (n.type === "place" && n.data.objectType ? [n.data.objectType] : []))),
    ].sort()) {
      objectTypeIndex.set(t, objectTypeIndex.size);
    }
    const laid = await layoutGraph(ordered, edges, {
      transport,
      id: (n) => n.id,
      source: (e) => e.source,
      target: (e) => e.target,
      direction: "LR",
      flowEdges: false,
      reroute: options?.reroute,
      weight: () => 1,
      nodeSpec: (n) => {
        const s = nodeSize(n.type);
        const category =
          n.type === "place" && n.data.objectType ? objectTypeIndex.get(n.data.objectType) : undefined;
        const seeded = options?.seed?.(n);
        return {
          width: s.width,
          height: s.height,
          ellipse: n.type === "place",
          category,
          seed: seeded ? ([seeded.x, seeded.y] as [number, number]) : undefined,
          pinned: seeded?.pinned,
        };
      },
    });

    const routingOf = (e: Edge<ArcData>): ArcRouting => ({
      kind: "polyline",
      points: laid.routeOf(e) ?? [],
      srcPos: laid.centerOf(e.source),
      tgtPos: laid.centerOf(e.target),
    });

    return {
      nodes: nodes.map((n) => ({ ...n, position: laid.centerOf(n.id) }) as PetriNetNode),
      edges: edges.map((e) => ({
        ...e,
        type: "custom",
        data: { ...e.data, routing: routingOf(e) },
      })),
    };
  };
}

/** Engine-agnostic fallback: lays places/transitions out in a row, arcs unrouted. Import an engine
 *  bundle (`@r4pm/components/elk-layout` or `@r4pm/components/rust-layout/wasm`) for a real layout. */
export const noopPetriLayout: PetriLayoutFn = async (nodes, edges) => ({
  nodes: nodes.map((n, i) => ({ ...n, position: { x: i * 160, y: 0 } }) as PetriNetNode),
  edges,
});
