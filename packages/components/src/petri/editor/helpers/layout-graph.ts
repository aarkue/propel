import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";

/** Default node sizes, for a node without a size from the layout. */
export const TRANSITION_SIZE = { width: 120, height: 52 } as const;
export const PLACE_SIZE = { width: 52, height: 52 } as const;

export function nodeSize(type: PetriNetNode["type"]): { width: number; height: number } {
  return type === "place" ? PLACE_SIZE : TRANSITION_SIZE;
}

/** Orthogonal bend-point routing for an arc, in flow coordinates; `srcPos`/`tgtPos` are the source/
 *  target node *center* positions at layout time, used to detect a later drag. */
export type ArcRouting = {
  kind: "polyline";
  points: { x: number; y: number }[];
  srcPos: { x: number; y: number };
  tgtPos: { x: number; y: number };
};

/** Lays places and transitions out in a row, arcs unrouted: the layout without a `viz` transport. */
export async function noopPetriLayout(
  nodes: PetriNetNode[],
  edges: Edge<ArcData>[],
): Promise<{ nodes: PetriNetNode[]; edges: Edge<ArcData>[] }> {
  return { nodes: nodes.map((n, i) => ({ ...n, position: { x: i * 160, y: 0 } }) as PetriNetNode), edges };
}
