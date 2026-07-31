// Pure formatting helpers for `RunPanel`'s report table.
import type { DropReason, ExtractionReport, MappingStats } from "../types";

/** Only the drop reasons with a nonzero count -- a reason at zero must not render a phantom
 *  warning row (spec 2.4's "deduplication is not loss" distinction: zero drops reads as clean).
 *  `stats.dropped`'s generated type is `{[k: string]: number}` (schemars/JSON Schema has no clean
 *  way to say "keys are this enum" for a Rust `BTreeMap<DropReason, _>`), so the keys are cast to
 *  `DropReason` here -- true at runtime (the backend only ever writes real `DropReason` variant
 *  names as keys), just not expressible in the generated type itself. */
export function dropReasonRows(stats: MappingStats): { reason: DropReason; count: number }[] {
  return (Object.entries(stats.dropped) as [DropReason, number][])
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({ reason, count }));
}

export function totalDropped(stats: MappingStats): number {
  return dropReasonRows(stats).reduce((sum, row) => sum + row.count, 0);
}

/** Plain-language name and cause for each drop reason, in place of the raw Rust variant name. */
export const DROP_REASON_INFO: Record<DropReason, { label: string; why: string }> = {
  MissingTimestamp: {
    label: "No timestamp in the row",
    why: "The timestamp column was NULL or empty. These rows carry no date, so there is nothing to place them in time. For a separate date and time, the date is what matters: a constant time cannot rescue a row whose date is NULL.",
  },
  UnparseableTimestamp: {
    label: "Timestamp did not match its format",
    why: "The value was there but did not parse. Check the format against a real value from the column -- the picker shows examples.",
  },
  NullOrUnrenderableId: {
    label: "No usable id",
    why: "The id expression was NULL or produced nothing renderable.",
  },
  UnresolvedEndpoint: {
    label: "Relation endpoint not found",
    why: "The relation named an event or object that no mapping produces, and missing endpoints are set to drop.",
  },
  PredicateExcluded: {
    label: "Excluded by the row filter",
    why: "The mapping's `when` condition did not hold. This is intended filtering, not loss.",
  },
  IdTypeCollision: {
    label: "Id already used by another type",
    why: "Two different types rendered the same id. Switch id rendering to type-prefixed to make this impossible.",
  },
};

/** Human label for a drop reason, falling back to the raw variant for one this build predates. */
export function dropReasonLabel(reason: DropReason): string {
  return DROP_REASON_INFO[reason]?.label ?? reason;
}

export function reportRowCount(report: ExtractionReport): number {
  return report.per_mapping.length;
}
