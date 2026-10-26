import { describe, expect, it } from "vitest";
import { DISCOVERY_DEFAULTS, discoverySummary } from "./discovery-summary";

const totals = { objectTypes: 6, activities: 11 };

describe("discoverySummary", () => {
  it("reads the defaults as noise and reduction", () => {
    expect(discoverySummary(DISCOVERY_DEFAULTS, totals)).toBe("noise 0.20 · lossless");
  });

  it("names restrictions and the other reductions", () => {
    expect(
      discoverySummary(
        { ...DISCOVERY_DEFAULTS, reduction: "None", object_types_to_use: ["a", "b"], acts_to_use: ["x"] },
        totals,
      ),
    ).toBe("noise 0.20 · no reduction · 2 of 6 object types · 1 of 11 activities");
    expect(discoverySummary({ ...DISCOVERY_DEFAULTS, reduction: "Lossy" }, totals)).toBe(
      "noise 0.20 · lossy",
    );
  });
});
