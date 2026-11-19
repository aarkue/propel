import { describe, expect, it } from "vitest";
import { cardinalityText, laneRange, violationRate } from "./model";

describe("cardinalityText", () => {
  it("reads the count bounds as words", () => {
    expect(cardinalityText([1, 1])).toBe("exactly 1");
    expect(cardinalityText([1, null])).toBe("at least 1");
    expect(cardinalityText([null, null])).toBe("any number");
    expect(cardinalityText([0, 2])).toBe("at most 2");
    expect(cardinalityText([null, 0])).toBe("none");
    expect(cardinalityText([1, 3])).toBe("1 to 3");
  });
});

describe("violationRate", () => {
  it("is the violating share, and 0 without sources", () => {
    expect(violationRate({ sources: 4, violating_sources: 1 })).toBe(0.25);
    expect(violationRate({ sources: 0, violating_sources: 0 })).toBe(0);
  });
});

describe("laneRange", () => {
  const lane = (id: string, ts: number[]) => ({
    object_type: "t",
    id,
    events: ts.map((t, i) => ({ id: `${id}${i}`, activity: "a", time_ms: t })),
  });
  it("focuses on the object with the fewest events, padded", () => {
    const lanes = [lane("long", [0, 50, 1000]), lane("short", [100, 200])];
    expect(laneRange(lanes, 150, "focus")).toEqual([94, 206]);
    expect(laneRange(lanes, 150, "all")).toEqual([-60, 1060]);
  });
  it("includes the source and pads a single instant by half a day", () => {
    expect(laneRange([lane("x", [10])], 10, "focus")).toEqual([10 - 43_200_000, 10 + 43_200_000]);
    expect(laneRange([lane("x", [100, 200])], 300, "focus")).toEqual([88, 312]);
  });
});
