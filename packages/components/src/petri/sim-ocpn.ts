import type { ObjectCentricPetriNet } from "../object-centric-petri-net";
import { uid } from "./id";

export type TokenMarking = Record<string, string[]>;

export interface OcpnFiring {
  consume: Record<string, string[]>;
  produce: Record<string, string[]>;
}

export interface OcpnArc {
  place: string;
  objectType: string;
  weight: number;
  variable: boolean;
  tokens: string[];
}
export interface OcpnFireGuardArgs {
  transitionId: string;
  marking: TokenMarking;
  inputs: OcpnArc[];
  outputs: Omit<OcpnArc, "tokens">[];
}
/** Return the firing (consume + produce token ids per place), or false when the
 *  transition cannot fire. */
export type OcpnFireGuard = (args: OcpnFireGuardArgs) => OcpnFiring | false;

// place_in_out_mult[place] = [incoming, outgoing] keyed by transition.
// incoming: transition->place arc is variable. outgoing: place->transition arc is variable.
function variableOf(ocpn: ObjectCentricPetriNet, place: string, trans: string, dir: "in" | "out"): boolean {
  const m = ocpn.place_in_out_mult?.[place];
  if (!m) return false;
  const [inc, out] = m;
  return dir === "in" ? !!inc[trans] : !!out[trans];
}

function arcsOf(
  ocpn: ObjectCentricPetriNet,
  marking: TokenMarking,
  transitionId: string,
): { inputs: OcpnArc[]; outputs: Omit<OcpnArc, "tokens">[] } {
  const placeIds = new Set(ocpn.petri_net.places.map((p) => p.id));
  const ot = ocpn.place_object_type;
  const inputs: OcpnArc[] = [];
  const outputs: Omit<OcpnArc, "tokens">[] = [];
  for (const a of ocpn.petri_net.arcs) {
    const [from, to] = a.nodes;
    const weight = a.weight ?? 1;
    if (to === transitionId && placeIds.has(from)) {
      inputs.push({
        place: from,
        objectType: ot[from] ?? "",
        weight,
        variable: variableOf(ocpn, from, transitionId, "out"),
        tokens: marking[from] ?? [],
      });
    }
    if (from === transitionId && placeIds.has(to)) {
      outputs.push({
        place: to,
        objectType: ot[to] ?? "",
        weight,
        variable: variableOf(ocpn, to, transitionId, "in"),
      });
    }
  }
  return { inputs, outputs };
}

/** Default: variable input consumes all its tokens, normal input the first `weight`;
 *  outputs carry over consumed ids of the matching object type (objects continue),
 *  minting fresh ids when no input supplies that type. */
function defaultGuard(args: OcpnFireGuardArgs): OcpnFiring | false {
  const consume: Record<string, string[]> = {};
  const produce: Record<string, string[]> = {};
  const byType: Record<string, string[]> = {};

  // Variable arcs bind whatever tokens are present (zero is valid). Normal arcs
  // need `weight` tokens. Accumulate per place so parallel arcs do not clobber.
  for (const i of args.inputs) {
    const take = i.variable ? i.tokens.slice() : i.tokens.slice(0, i.weight);
    if (!i.variable && take.length < i.weight) return false;
    consume[i.place] = Array.from(new Set([...(consume[i.place] ?? []), ...take]));
  }
  const typeOfPlace: Record<string, string> = {};
  for (const i of args.inputs) typeOfPlace[i.place] = i.objectType;
  for (const [place, ids] of Object.entries(consume)) {
    const ot = typeOfPlace[place];
    byType[ot] = [...(byType[ot] ?? []), ...ids];
  }

  for (const o of args.outputs) {
    const pool = byType[o.objectType] ?? [];
    let ids: string[];
    if (pool.length) {
      ids = o.variable ? pool.slice() : pool.slice(0, o.weight);
    } else {
      const n = o.variable ? 1 : o.weight;
      ids = Array.from({ length: n }, () => `${o.place}#${uid()}`);
    }
    produce[o.place] = (produce[o.place] ?? []).concat(ids);
  }

  return { consume, produce };
}

export function isOcpnEnabled(
  ocpn: ObjectCentricPetriNet,
  marking: TokenMarking,
  transitionId: string,
  guard?: OcpnFireGuard,
): boolean {
  const args = { transitionId, marking, ...arcsOf(ocpn, marking, transitionId) };
  return (guard ?? defaultGuard)(args) !== false;
}

/** Fire a transition and return both the resulting marking and the firing (which token ids
 *  were consumed/produced per place), or null when it cannot fire. */
export function fireOcpnDetailed(
  ocpn: ObjectCentricPetriNet,
  marking: TokenMarking,
  transitionId: string,
  opts?: { guard?: OcpnFireGuard },
): { marking: TokenMarking; firing: OcpnFiring } | null {
  const args = { transitionId, marking, ...arcsOf(ocpn, marking, transitionId) };
  const firing = (opts?.guard ?? defaultGuard)(args);
  if (!firing) return null;

  for (const [place, ids] of Object.entries(firing.consume)) {
    const have = new Set(marking[place] ?? []);
    if (!ids.every((id) => have.has(id))) return null;
  }

  const next: TokenMarking = {};
  for (const [place, ids] of Object.entries(marking)) next[place] = ids.slice();
  for (const [place, ids] of Object.entries(firing.consume)) {
    const rm = new Set(ids);
    next[place] = (next[place] ?? []).filter((id) => !rm.has(id));
  }
  for (const [place, ids] of Object.entries(firing.produce)) {
    next[place] = (next[place] ?? []).concat(ids);
  }
  return { marking: next, firing };
}

export function fireOcpn(
  ocpn: ObjectCentricPetriNet,
  marking: TokenMarking,
  transitionId: string,
  opts?: { guard?: OcpnFireGuard },
): TokenMarking | null {
  return fireOcpnDetailed(ocpn, marking, transitionId, opts)?.marking ?? null;
}
