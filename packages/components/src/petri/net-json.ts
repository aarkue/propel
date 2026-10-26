import type { PetriNet } from "../petri-net";

/** Petri net JSON as rust4pm (de)serializes an `AcceptingPetriNet`: nodes by index, each
 *  transition with its weighted input and output places, markings from place index to tokens. */
export interface RustPetriNet {
  places: Array<{ name?: string | null }>;
  transitions: Array<{
    label?: string | null;
    name?: string | null;
    inputs: [number, number][];
    outputs: [number, number][];
  }>;
  initial_marking: Record<string, number>;
  final_marking: Record<string, number>;
}

/** Node id this module gives the place / transition at `index` of a {@link RustPetriNet}. */
export const placeNodeId = (index: number): string => `p${index}`;
export const transitionNodeId = (index: number): string => `t${index}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRustPetriNet(net: any): boolean {
  if (!Array.isArray(net.places) || !Array.isArray(net.transitions) || "arcs" in net) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ![...net.places, ...net.transitions].some((n: any) => typeof n?.id === "string");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRustPetriNet(net: any): PetriNet {
  const arcs: PetriNet["arcs"] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  net.transitions.forEach((t: any, i: number) => {
    for (const [p, weight] of t?.inputs ?? [])
      arcs.push({ nodes: [placeNodeId(p), transitionNodeId(i)], weight });
    for (const [p, weight] of t?.outputs ?? [])
      arcs.push({ nodes: [transitionNodeId(i), placeNodeId(p)], weight });
  });
  const marking = (m: Record<string, number> | null | undefined) =>
    m ? Object.fromEntries(Object.entries(m).map(([p, tokens]) => [placeNodeId(Number(p)), tokens])) : null;
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    places: net.places.map((p: any, i: number) => ({ id: placeNodeId(i), name: p?.name ?? null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transitions: net.transitions.map((t: any, i: number) => ({
      id: transitionNodeId(i),
      label: t?.label ?? null,
      name: t?.name ?? null,
    })),
    arcs,
    initial_marking: marking(net.initial_marking),
    final_marking: marking(net.final_marking),
  };
}

/** The rust4pm JSON of `net`, e.g., to pass an edited net to a binding. Parallel arcs merge into
 *  one with the summed weight. Arcs or tokens on unknown nodes are dropped. */
export function toRustPetriNet(net: PetriNet): RustPetriNet {
  const n = normalizePetriNet(net);
  const placeIndex = new Map(n.places.map((p, i) => [p.id, i]));
  const transitionIndex = new Map(n.transitions.map((t, i) => [t.id, i]));
  const inputs = n.transitions.map(() => new Map<number, number>());
  const outputs = n.transitions.map(() => new Map<number, number>());
  for (const { nodes, weight } of n.arcs) {
    const [from, to] = nodes;
    const w = weight ?? 1;
    const [p, t, side] = placeIndex.has(from)
      ? [placeIndex.get(from), transitionIndex.get(to), inputs]
      : [placeIndex.get(to), transitionIndex.get(from), outputs];
    if (p === undefined || t === undefined) continue;
    side[t].set(p, (side[t].get(p) ?? 0) + w);
  }
  const marking = (m: Record<string, number> | null | undefined) =>
    Object.fromEntries(
      Object.entries(m ?? {}).flatMap(([id, tokens]) => {
        const p = placeIndex.get(id);
        return p !== undefined && tokens > 0 ? [[String(p), tokens]] : [];
      }),
    );
  return {
    places: n.places.map((p) => (p.name != null ? { name: p.name } : {})),
    transitions: n.transitions.map((t, i) => ({
      label: t.label ?? null,
      ...(t.name != null ? { name: t.name } : {}),
      inputs: [...inputs[i]],
      outputs: [...outputs[i]],
    })),
    initial_marking: marking(n.initial_marking),
    final_marking: marking(n.final_marking),
  };
}

/**
 * Accept a Petri net in the component's array shape, rust4pm's JSON
 * ({@link RustPetriNet}, ids from {@link placeNodeId} / {@link transitionNodeId}), or the record
 * shape (places and transitions as id-keyed records, arcs as `{ from_to: { nodes } }`,
 * markings as `final_markings[]`) and return the array shape this module uses.
 * Idempotent on already-normalized nets. Tolerates missing fields (returns empty arrays) so a
 * loading/partial net renders empty instead of throwing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePetriNet(net: any): PetriNet {
  if (!net || typeof net !== "object") return { places: [], transitions: [], arcs: [] };
  if (isRustPetriNet(net)) return fromRustPetriNet(net);
  const places = Array.isArray(net.places) ? net.places : Object.values(net.places ?? {});
  const transitions = Array.isArray(net.transitions) ? net.transitions : Object.values(net.transitions ?? {});
  const arcsIn = Array.isArray(net.arcs) ? net.arcs : [];
  const arcs = arcsIn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => ({ nodes: (a?.nodes ?? a?.from_to?.nodes) as [string, string], weight: a?.weight }))
    .filter((a: { nodes: unknown }) => Array.isArray(a.nodes) && a.nodes.length === 2);
  const final_marking =
    net.final_marking ?? (Array.isArray(net.final_markings) ? net.final_markings[0] : undefined) ?? null;
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    places: (places as any[]).map((p) => ({ id: p.id, name: p.name ?? null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transitions: (transitions as any[]).map((t) => ({
      id: t.id,
      label: t.label ?? null,
      name: t.name ?? null,
    })),
    arcs,
    initial_marking: net.initial_marking ?? null,
    final_marking,
  };
}
