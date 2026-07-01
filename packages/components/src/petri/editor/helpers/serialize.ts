import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import type { PetriNet } from "../../../petri-net";

/** Collapse ReactFlow editor nodes/edges back to the PetriNet data model.
 *  Positions are intentionally dropped (not part of the data model). Zero-count
 *  marking entries are omitted; an all-zero marking serializes as null. */
export function nodesToPetriNet(nodes: PetriNetNode[], edges: Edge<ArcData>[]): PetriNet {
  const places: PetriNet["places"] = [];
  const transitions: PetriNet["transitions"] = [];
  const initial: Record<string, number> = {};
  const final: Record<string, number> = {};

  for (const n of nodes) {
    if (n.type === "place") {
      places.push({ id: n.id });
      const t = n.data.tokens ?? 0;
      if (t > 0) initial[n.id] = t;
      const f = n.data.finalTokens ?? 0;
      if (f > 0) final[n.id] = f;
    } else {
      transitions.push({ id: n.id, label: n.data.label ?? null });
    }
  }

  const arcs: PetriNet["arcs"] = edges.map((e) => ({
    nodes: [e.source, e.target] as [string, string],
    weight: e.data?.weight,
  }));

  return {
    places,
    transitions,
    arcs,
    initial_marking: Object.keys(initial).length ? initial : null,
    final_marking: Object.keys(final).length ? final : null,
  };
}
