import ELK, { type ElkNode, type LayoutOptions } from "elkjs/lib/elk.bundled.js";
import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";

const elk = new ELK();

/** Canonical node sizes, shared by ELK layout, the node
 *  components (rendered width/height), and the edge border-clipping geometry. */
export const TRANSITION_SIZE = { width: 120, height: 52 } as const;
export const PLACE_SIZE = { width: 52, height: 52 } as const;

export function nodeSize(type: PetriNetNode["type"]): { width: number; height: number } {
  return type === "place" ? PLACE_SIZE : TRANSITION_SIZE;
}

/** ELK orthogonal bend-point routing captured for an arc, mirroring the DFG
 *  edge routing. Points are in flow coordinates (graph top-left origin, which
 *  equals flow space because node centers are written as `elkTopLeft + size/2`).
 *  `srcPos`/`tgtPos` are the source/target node *center* positions at layout
 *  time, used to detect a later drag and fall back to a live straight path. */
export type ArcRouting = {
  kind: "polyline";
  points: { x: number; y: number }[];
  srcPos: { x: number; y: number };
  tgtPos: { x: number; y: number };
};

const DEFAULT_OPTIONS: LayoutOptions = {
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
 * Lay out a Petri net with ELK. Returns nodes positioned by their *center*
 * (matching the editor's `nodeOrigin=[0.5,0.5]`) and edges carrying
 * `type:"custom"` plus ELK bend-point routing in `data.routing`.
 */
export async function layoutPetriNet(
  nodes: PetriNetNode[],
  edges: Edge<ArcData>[],
  options: LayoutOptions = {},
): Promise<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }> {
  const graph = {
    id: "root",
    layoutOptions: { ...DEFAULT_OPTIONS, ...options },
    children: nodes.map((n) => ({ id: n.id, ...nodeSize(n.type) })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const laidOut: ElkNode = await elk.layout(graph as unknown as ElkNode);

  const center = new Map<string, { x: number; y: number }>();
  const sizeById = new Map<string, { width: number; height: number }>();
  for (const c of laidOut.children ?? []) {
    const w = c.width ?? 0;
    const h = c.height ?? 0;
    center.set(c.id, { x: (c.x ?? 0) + w / 2, y: (c.y ?? 0) + h / 2 });
    sizeById.set(c.id, { width: w, height: h });
  }

  const routingById = new Map<string, ArcRouting>();
  for (const re of laidOut.edges ?? []) {
    const section = (re as { sections?: ElkEdgeSection[] }).sections?.[0];
    if (!section) continue;
    const points: { x: number; y: number }[] = [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ];
    routingById.set(re.id, {
      kind: "polyline",
      points,
      srcPos: center.get(sourceOf(edges, re.id)) ?? { x: 0, y: 0 },
      tgtPos: center.get(targetOf(edges, re.id)) ?? { x: 0, y: 0 },
    });
  }

  return {
    nodes: nodes.map((n) => ({ ...n, position: center.get(n.id) ?? { x: 0, y: 0 } }) as PetriNetNode),
    edges: edges.map((e) => ({
      ...e,
      type: "custom",
      data: { ...e.data, routing: routingById.get(e.id) },
    })),
  };
}

type ElkEdgeSection = {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  bendPoints?: { x: number; y: number }[];
};

function sourceOf(edges: Edge<ArcData>[], id: string): string {
  return edges.find((e) => e.id === id)?.source ?? "";
}
function targetOf(edges: Edge<ArcData>[], id: string): string {
  return edges.find((e) => e.id === id)?.target ?? "";
}
