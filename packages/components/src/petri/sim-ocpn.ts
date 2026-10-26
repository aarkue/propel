import { uid } from "../shared/id";
import type { Ocpn } from "../viz";

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

/** The input arcs (with the tokens they could take) and output arcs of a transition, by its name. */
function arcsOf(
  ocpn: Ocpn,
  marking: TokenMarking,
  transitionId: string,
): { inputs: OcpnArc[]; outputs: Omit<OcpnArc, "tokens">[] } {
  const typeOf = new Map(ocpn.places.map((p) => [p.name, p.object_type]));
  const inputs: OcpnArc[] = [];
  const outputs: Omit<OcpnArc, "tokens">[] = [];
  for (const a of ocpn.arcs) {
    const weight = a.weight ?? 1;
    const variable = a.type === "variable";
    const sourceType = typeOf.get(a.source);
    const targetType = typeOf.get(a.target);
    if (a.target === transitionId && sourceType !== undefined) {
      inputs.push({
        place: a.source,
        objectType: sourceType,
        weight,
        variable,
        tokens: marking[a.source] ?? [],
      });
    }
    if (a.source === transitionId && targetType !== undefined) {
      outputs.push({ place: a.target, objectType: targetType, weight, variable });
    }
  }
  return { inputs, outputs };
}

/** Default: variable input consumes all tokens, normal input the first `weight`; outputs carry over
 *  consumed ids of the matching object type, minting fresh ids when none supply that type. */
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
  ocpn: Ocpn,
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
  ocpn: Ocpn,
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
  ocpn: Ocpn,
  marking: TokenMarking,
  transitionId: string,
  opts?: { guard?: OcpnFireGuard },
): TokenMarking | null {
  return fireOcpnDetailed(ocpn, marking, transitionId, opts)?.marking ?? null;
}
