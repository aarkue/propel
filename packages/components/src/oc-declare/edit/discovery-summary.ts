import type { DiscoveryOptions } from "./edit-context";

/** The discovery settings a host starts from. */
export const DISCOVERY_DEFAULTS: DiscoveryOptions = {
  noise_threshold: 0.2,
  o2o_mode: "None",
  acts_to_use: null,
  object_types_to_use: null,
  counts_for_generation: [1, 20],
  counts_for_filter: [1, 20],
  reduction: "Lossless",
  refinement: true,
  considered_arrow_types: ["AS", "EF", "EP"],
};

const REDUCTION: Record<DiscoveryOptions["reduction"], string> = {
  None: "no reduction",
  Lossless: "lossless",
  Lossy: "lossy",
};

/** One line for a bar button, e.g., "noise 0.20 · lossless · 2 of 6 object types". */
export function discoverySummary(
  o: DiscoveryOptions,
  totals: { objectTypes: number; activities: number },
): string {
  const parts = [`noise ${o.noise_threshold.toFixed(2)}`, REDUCTION[o.reduction]];
  if (o.object_types_to_use)
    parts.push(`${o.object_types_to_use.length} of ${totals.objectTypes} object types`);
  if (o.acts_to_use) parts.push(`${o.acts_to_use.length} of ${totals.activities} activities`);
  return parts.join(" · ");
}
