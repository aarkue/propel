import type { BackendContext, OcpnDiscoveryOptions, SlimLinkedOCELHandle } from "@r4pm/client";
import { OCEL_TYPE_STATS } from "./_oc-declare-discovery";
import {
  DEFAULT_MINER,
  inductiveMiner,
  type MinerChoice,
  type MinerVariant,
  minerChoice,
} from "./_discovery";

// The object-centric Petri net discovery call. `_`-prefixed so the vis registry glob skips it.

export const OCPN_DISCOVERY = "process_mining::discovery::object_centric::ocpn::discover_ocpn" as const;

/** How many object types and activities the discovery starts with. Each type's net is mined from
 *  its own flattened log, which is expensive on a large OCEL, and unreadable with many activities. */
export const DEFAULT_OBJECT_TYPES = 3;
export const DEFAULT_ACTIVITIES = 15;

/** The names of `counts` that `names` keeps. Null keeps every name, and absent, before any choice,
 *  the `defaults` most frequent ones. */
export function keptNames(
  names: string[] | null | undefined,
  counts: Record<string, number>,
  defaults: number,
): Set<string> {
  const all = Object.keys(counts);
  if (names === undefined) {
    const ranked = [...all].sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0));
    return new Set(ranked.slice(0, defaults));
  }
  if (names === null) return new Set(all);
  const only = new Set(names);
  return new Set(all.filter((t) => only.has(t)));
}

/** The binding's `*_to_use` for `kept` of `all`: null for every name, else the kept ones in the
 *  OCEL's order. */
export function namesToUse(kept: Set<string>, all: string[]): string[] | null {
  return all.every((t) => kept.has(t)) ? null : all.filter((t) => kept.has(t));
}

/** The variants the OCPN discovery can run per object type on its flattened log. */
export const OCPN_VARIANTS: readonly MinerVariant[] = ["IM", "IMf", "IMa", "IMd", "IMfd"];

/** The controls of the OCPN view: which object types and activities, how tolerant variable arcs
 *  are, and the miner for each type's net. Object types or activities left out mean the most
 *  frequent ones. */
export interface OcpnDiscovery {
  object_types_to_use?: string[] | null;
  activities_to_use?: string[] | null;
  variable_arc_tolerance: number;
  miner: MinerChoice;
}

export const OCPN_DISCOVERY_DEFAULTS: OcpnDiscovery = { variable_arc_tolerance: 0, miner: DEFAULT_MINER };

const names = (v: unknown): string[] | null | undefined =>
  Array.isArray(v) && v.every((t) => typeof t === "string") ? v : v === null ? null : undefined;

/** Stored controls, or the defaults for anything else. */
export function ocpnDiscovery(raw: unknown): OcpnDiscovery {
  const c = (raw ?? {}) as Partial<OcpnDiscovery>;
  const tolerance = c.variable_arc_tolerance;
  return {
    object_types_to_use: names(c.object_types_to_use),
    activities_to_use: names(c.activities_to_use),
    variable_arc_tolerance: typeof tolerance === "number" && tolerance >= 0 && tolerance <= 1 ? tolerance : 0,
    miner: minerChoice(c.miner, OCPN_VARIANTS),
  };
}

export async function discoverOcpn(
  backend: Pick<BackendContext, "callBinding">,
  ocel: string,
  discovery: OcpnDiscovery,
) {
  let types = discovery.object_types_to_use;
  let activities = discovery.activities_to_use;
  if (types === undefined || activities === undefined) {
    const stats = await backend.callBinding(OCEL_TYPE_STATS, { ocel: ocel as SlimLinkedOCELHandle });
    const pick = (chosen: string[] | null | undefined, counts: Record<string, number>, defaults: number) =>
      chosen !== undefined ? chosen : namesToUse(keptNames(undefined, counts, defaults), Object.keys(counts));
    types = pick(types, stats.object_type_counts, DEFAULT_OBJECT_TYPES);
    activities = pick(activities, stats.event_type_counts, DEFAULT_ACTIVITIES);
  }
  const options: OcpnDiscoveryOptions = {
    object_types_to_use: types,
    activities_to_use: activities,
    variable_arc_tolerance: discovery.variable_arc_tolerance,
    miner: await inductiveMiner(backend, discovery.miner),
  };
  return backend.callBinding(OCPN_DISCOVERY, { locel: ocel as SlimLinkedOCELHandle, options });
}
