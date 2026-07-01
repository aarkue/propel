import { describe, expect, it } from "vitest";
import { buildPlotData, isDiscreteTrace } from "./object-attribute-changes-data";

describe("buildPlotData", () => {
  it("classifies numeric vs categorical traces and tags the object id", () => {
    const data = {
      traces: {
        price: [
          { time: "2020-01-01T00:00:00Z", value: 10 },
          { time: "2020-01-02T00:00:00Z", value: 20 },
        ],
        status: [{ time: "2020-01-01T00:00:00Z", value: "open" }],
      },
    } as never;
    const out = buildPlotData(data, "obj-1");
    expect(out.objectID).toBe("obj-1");
    expect(out.numericCount).toBe(1);
    expect(out.categoricalCount).toBe(1);
    expect(out.traces.length).toBe(2);
  });
});

describe("isDiscreteTrace", () => {
  it("treats non-numeric values as categorical", () => {
    expect(isDiscreteTrace([{ time: "t", value: "open" }] as never)).toBe(true);
    expect(isDiscreteTrace([{ time: "t", value: 42 }] as never)).toBe(false);
  });
});
