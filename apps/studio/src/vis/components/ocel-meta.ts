import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { backend } from "../../backends";
import { queryClient } from "../../shell/query-client";

/** Counts per event and object type, computed once per OCEL rather than on every control change. */
export function ocelTypeStats(ocel: SlimLinkedOCELHandle) {
  return queryClient.fetchQuery({
    queryKey: [ocel, "ocel-type-stats"],
    queryFn: () => backend.callBinding("process_mining::ocel_type_stats", { ocel }),
  });
}

/** Object lifecycles per type, computed once per OCEL. */
export function ocelLifecycles(ocel: SlimLinkedOCELHandle) {
  return queryClient.fetchQuery({
    queryKey: [ocel, "ocel-lifecycles"],
    queryFn: () => backend.callBinding("app_bindings::get_lifecycle_map", { ocel }),
  });
}

/**
 * Splits types into short- and long-lived by median lifetime. Long-lived types (master data such
 * as products or customers) live over four times shorter than the longest; they relate to nearly
 * everything, so analyses that follow objects usually leave them out.
 */
export function byLifetime<T extends { median_lifetime_ms: number }>(types: T[]): { short: T[]; long: T[] } {
  let longest = 1;
  for (const t of types) longest = Math.max(longest, t.median_lifetime_ms);
  const short = types.filter((t) => t.median_lifetime_ms <= 0.25 * longest);
  return { short, long: types.filter((t) => t.median_lifetime_ms > 0.25 * longest) };
}

export const NO_OBJECT_TYPES = "This OCEL has no objects.";
