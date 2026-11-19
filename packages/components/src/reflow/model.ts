// Reflow (rust4pm `analysis::object_centric::reflow`): which participations of an OCEL carry the
// flow, and from which flowing type the others follow. Mirrors the library's `ReflowSummary`.

import { involvementCard, type TypeBadge } from "../shared/type-badges";

export type ReflowCellState = "flow" | "implied" | "involved";

export interface ReflowCell {
  activity: string;
  objectType: string;
  state: ReflowCellState;
  /** False for a cell Reflow added from a schema route (with expansion). */
  recorded: boolean;
  participations: number;
  /** Fewest and most distinct objects of the type an event of the activity has, over the source log. */
  minObjects: number;
  maxObjects: number;
  determinedBy?: {
    from: string;
    reconstruction: {
      via:
        | { kind: "recorded"; relations: { qualifier: string; reversed: boolean }[] }
        | { kind: "image" }
        | { kind: "preimage" };
      share: number;
    };
  } | null;
}

export interface ReflowStats {
  facts: number;
  flow: number;
  implied: number;
  involved: number;
  added: number;
  arcsRecorded: number;
  arcsFlow: number;
  seed?: string | null;
  repaired: number;
  work: number;
  limitReached: boolean;
  expansionCandidates: number;
}

export interface ReflowSummary {
  activities: string[];
  objectTypes: string[];
  cells: ReflowCell[];
  stats: ReflowStats;
}

/** The saved mapping (`.reflow`): a summary and the logs it belongs to. */
export interface ReflowMapping {
  version: number;
  /** Label of the log Reflow ran on. */
  source?: string;
  /** Id of the flow log made alongside. */
  flowLog?: string;
  summary: ReflowSummary;
}

/** An object type drawn on an activity of a flow model: implied ones with the type they follow. */
export type ReflowBadge = TypeBadge;

/**
 * The non-flow cells of `summary` per activity, as badges: implied ones first, by the type they
 * follow, then the involved ones, each with the involvement class of its cell's object counts.
 */
export function reflowBadges(summary: ReflowSummary): Record<string, ReflowBadge[]> {
  const cells = new Map(summary.cells.map((c) => [`${c.activity}\n${c.objectType}`, c]));
  const card = (activity: string, type: string) => {
    const cell = cells.get(`${activity}\n${type}`);
    return cell && involvementCard(cell.minObjects, cell.maxObjects);
  };
  const out: Record<string, ReflowBadge[]> = {};
  for (const c of summary.cells) {
    if (c.state === "flow") continue;
    const from = c.state === "implied" ? c.determinedBy?.from : undefined;
    const badge: ReflowBadge = {
      object_type: c.objectType,
      card: involvementCard(c.minObjects, c.maxObjects),
    };
    if (from) {
      badge.from = from;
      const source = card(c.activity, from);
      if (source) badge.from_card = source;
    }
    out[c.activity] = [...(out[c.activity] ?? []), badge];
  }
  for (const list of Object.values(out))
    list.sort(
      (a, b) =>
        Number(!a.from) - Number(!b.from) ||
        (a.from ?? "").localeCompare(b.from ?? "") ||
        a.object_type.localeCompare(b.object_type),
    );
  return out;
}

/** How a cell follows from its carrier, in words. */
export function viaText(cell: ReflowCell): string | null {
  const d = cell.determinedBy;
  if (!d) return null;
  const v = d.reconstruction.via;
  if (v.kind === "image") return `the ${cell.objectType} the ${d.from} map to`;
  if (v.kind === "preimage") return `every ${cell.objectType} that maps to the ${d.from}`;
  const path = v.relations
    .map((r) => (r.reversed ? `${r.qualifier} (reversed)` : r.qualifier))
    .join(", then ");
  return `object relation ${path}`;
}

/**
 * The grid's axes: types with flow cells first (most first), and activities grouped by the first
 * flowing type they have, so each type's activities sit together.
 */
export function gridOrder(summary: ReflowSummary): { activities: string[]; types: string[] } {
  const flowCount = new Map<string, number>();
  for (const c of summary.cells) {
    if (c.state === "flow") flowCount.set(c.objectType, (flowCount.get(c.objectType) ?? 0) + 1);
  }
  const types = [...summary.objectTypes].sort(
    (a, b) => (flowCount.get(b) ?? 0) - (flowCount.get(a) ?? 0) || a.localeCompare(b),
  );
  const rank = new Map(types.map((t, i) => [t, i]));
  const first = new Map<string, number>();
  for (const c of summary.cells) {
    if (c.state !== "flow") continue;
    const r = rank.get(c.objectType) ?? types.length;
    first.set(c.activity, Math.min(first.get(c.activity) ?? types.length, r));
  }
  const activities = [...summary.activities].sort(
    (a, b) => (first.get(a) ?? types.length) - (first.get(b) ?? types.length) || a.localeCompare(b),
  );
  return { activities, types };
}
