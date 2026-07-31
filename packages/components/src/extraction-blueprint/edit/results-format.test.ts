import { describe, expect, it } from "vitest";
import type { MappingStats } from "../types";
import { dropReasonRows, reportRowCount, totalDropped } from "./results-format";
import { formatDuration } from "./RunPanel";

function stats(dropped: MappingStats["dropped"]): MappingStats {
  return {
    mapping: { index: 0, label: null, path: "$.mappings[0]" },
    rows_read: 10,
    entities_emitted: 5,
    deduplicated: 0,
    dropped,
  };
}

// DropReason's real (generated) JSON shape is PascalCase, matching Rust's default enum
// representation (report.rs has no #[serde(rename_all = ...)]) -- not the kebab-case this test
// used before the type was generated, which was an untested guess that turned out wrong.
describe("dropReasonRows", () => {
  it("a DropReason count of zero does not render a phantom warning row", () => {
    const rows = dropReasonRows(stats({ PredicateExcluded: 0, UnresolvedEndpoint: 3 }));
    expect(rows).toEqual([{ reason: "UnresolvedEndpoint", count: 3 }]);
  });

  it("all-zero dropped reads as clean (empty rows)", () => {
    expect(dropReasonRows(stats({ PredicateExcluded: 0 }))).toEqual([]);
    expect(totalDropped(stats({}))).toBe(0);
  });
});

describe("reportRowCount", () => {
  it("counts per_mapping entries", () => {
    expect(
      reportRowCount({
        per_mapping: [stats({}), stats({})],
        errors: [],
        rows_materialized: 0,
        finalize: {
          duplicates_removed: 0,
          objects_created: 0,
          resolved_relations: 0,
          unresolved_endpoints: 0,
        },
      }),
    ).toBe(2);
  });
});

describe("formatDuration", () => {
  it("uses milliseconds under a second", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(999)).toBe("999 ms");
  });

  it("switches to seconds, with a decimal only while that still says something", () => {
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(9900)).toBe("9.9 s");
    expect(formatDuration(42_000)).toBe("42 s");
  });

  it("reads a long run in minutes rather than as a five-digit millisecond count", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(120_000)).toBe("2m");
  });
});
