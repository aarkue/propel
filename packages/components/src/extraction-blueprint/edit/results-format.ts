// Pure formatting helpers for `RunPanel`'s report table.
import type { DropReason, ExtractionReport, MappingStats } from "../types";

/** Only the drop reasons with a nonzero count, so a zero reads as clean (spec 2.4). `stats.dropped`
 *  is generated as `{[k: string]: number}`, so the keys are cast to `DropReason` -- true at runtime, just not expressible in the generated type. */
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
    why: "Timestamp column was empty or NULL.",
  },
  UnparseableTimestamp: {
    label: "Timestamp did not match its format",
    why: "Value didn't match the timestamp format.",
  },
  NullOrUnrenderableId: {
    label: "No usable id",
    why: "Id expression was NULL or empty.",
  },
  UnresolvedEndpoint: {
    label: "Relation endpoint not found",
    why: "No mapping produces this endpoint.",
  },
  PredicateExcluded: {
    label: "Excluded by the row filter",
    why: "Excluded by the mapping's row filter.",
  },
  IdTypeCollision: {
    label: "Id already used by another type",
    why: "Id collided with another type. Try type-prefixed rendering.",
  },
};

/** Human label for a drop reason, falling back to the raw variant for one this build predates. */
export function dropReasonLabel(reason: DropReason): string {
  return DROP_REASON_INFO[reason]?.label ?? reason;
}

export function reportRowCount(report: ExtractionReport): number {
  return report.per_mapping.length;
}
