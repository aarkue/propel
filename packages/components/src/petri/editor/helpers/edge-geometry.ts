/** Petri-typed facade over the shared `graph-edit/routing` geometry: places are circles,
 *  transitions boxes. */
import {
  edgeGeometry,
  edgeRawPoints,
  type EdgeRouting,
  type NodeGeom,
  type Pt,
} from "../../../graph-edit/routing";
import { nodeSize } from "./layout-graph";
import type { PetriNetNode } from "../Editor";

export { ARROW, markerSizeFor } from "../../../graph-edit/routing";

export function geomOfType(type: PetriNetNode["type"]): NodeGeom {
  return { shape: type === "place" ? "circle" : "box", ...nodeSize(type) };
}

export function arcRawPoints(opts: {
  sourceCenter: Pt;
  targetCenter: Pt;
  sourceType: PetriNetNode["type"];
  targetType: PetriNetNode["type"];
  routing?: EdgeRouting;
}): Pt[] {
  return edgeRawPoints({
    sourceCenter: opts.sourceCenter,
    targetCenter: opts.targetCenter,
    source: geomOfType(opts.sourceType),
    target: geomOfType(opts.targetType),
    routing: opts.routing,
  });
}

export function arcGeometry(opts: {
  sourceCenter: Pt;
  targetCenter: Pt;
  sourceType: PetriNetNode["type"];
  targetType: PetriNetNode["type"];
  strokeWidth: number;
  routing?: EdgeRouting;
}): { path: string; labelX: number; labelY: number } {
  return edgeGeometry({
    sourceCenter: opts.sourceCenter,
    targetCenter: opts.targetCenter,
    source: geomOfType(opts.sourceType),
    target: geomOfType(opts.targetType),
    strokeWidth: opts.strokeWidth,
    routing: opts.routing,
  });
}
