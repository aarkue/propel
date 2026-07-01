import type { PetriNet } from "../petri-net";

export type Marking = Record<string, number>;

interface ArcIO {
  place: string;
  weight: number;
}

function io(net: PetriNet, transitionId: string): { inputs: ArcIO[]; outputs: ArcIO[] } {
  const placeIds = new Set(net.places.map((p) => p.id));
  const inputs: ArcIO[] = [];
  const outputs: ArcIO[] = [];
  for (const a of net.arcs) {
    const [from, to] = a.nodes;
    const weight = a.weight ?? 1;
    if (to === transitionId && placeIds.has(from)) inputs.push({ place: from, weight });
    if (from === transitionId && placeIds.has(to)) outputs.push({ place: to, weight });
  }
  return { inputs, outputs };
}

/** A transition is enabled when every input place holds at least the arc weight. */
export function isEnabled(net: PetriNet, marking: Marking, transitionId: string): boolean {
  return io(net, transitionId).inputs.every((i) => (marking[i.place] ?? 0) >= i.weight);
}

/** Fire a transition: consume input weights, produce output weights. Returns the
 *  new marking, or null when the transition is not enabled. */
export function fireTransition(net: PetriNet, marking: Marking, transitionId: string): Marking | null {
  if (!isEnabled(net, marking, transitionId)) return null;
  const { inputs, outputs } = io(net, transitionId);
  const next: Marking = { ...marking };
  for (const i of inputs) next[i.place] = (next[i.place] ?? 0) - i.weight;
  for (const o of outputs) next[o.place] = (next[o.place] ?? 0) + o.weight;
  return next;
}
