/** Petri-typed facade over the shared `graph-edit/routing` geometry: places are circles,
 *  transitions boxes. */
import type { NodeGeom } from "../../../graph-edit/routing";
import { nodeSize } from "./layout-graph";
import type { PetriNetNode } from "../Editor";
import type { Size } from "../../../viz";

/** The size a node is drawn at: its layout size, or the default of its kind. */
export function nodeSizeOf(node: { type?: string; data: unknown }): Size {
  return (node.data as { size?: Size }).size ?? nodeSize(node.type as PetriNetNode["type"]);
}

export function geomOfNode(node: { type?: string; data: unknown }): NodeGeom {
  return { shape: node.type === "place" ? "circle" : "box", ...nodeSizeOf(node) };
}
