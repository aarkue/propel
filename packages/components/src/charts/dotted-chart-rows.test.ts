import { describe, expect, it } from "vitest";
import { autoDotSize, countVisibleDots, orderRows, parsePlotlyDate, rowPositions } from "./dotted-chart-rows";

const data = {
  y_values: ["c1", "c2", "c3"],
  dots_per_color: {
    a: { x: [5, 1, 3], y: [0, 1, 2] },
    b: { x: [6, 9, 4, 4.5], y: [0, 1, 2, 2] },
  },
};

describe("orderRows", () => {
  it("keeps the engine's case-start order by default", () => {
    expect(orderRows(data, "start")).toEqual(["c1", "c2", "c3"]);
  });
  it("orders by last event, span and event count", () => {
    expect(orderRows(data, "end")).toEqual(["c3", "c1", "c2"]);
    expect(orderRows(data, "span")).toEqual(["c1", "c3", "c2"]);
    expect(orderRows(data, "events")).toEqual(["c1", "c2", "c3"]);
  });
});

describe("countVisibleDots", () => {
  const pos = rowPositions(data, ["c3", "c1", "c2"]);
  it("maps rows to their axis positions", () => {
    expect(Array.from(pos)).toEqual([1, 2, 0]);
  });
  it("counts all dots without a zoom and only those in range with one", () => {
    expect(countVisibleDots(data, pos, 1, null, null)).toBe(7);
    expect(countVisibleDots(data, pos, 1, [4, 6], null)).toBe(4);
    expect(countVisibleDots(data, pos, 1, null, [-0.5, 0.5])).toBe(3);
    expect(countVisibleDots(data, pos, 0.5, [2, 3], [0.5, 1.5])).toBe(2);
  });
});

describe("autoDotSize", () => {
  it("shrinks with density, grows when zoomed in, and stays readable", () => {
    const full = autoDotSize(600_000, 560_000);
    const zoomed = autoDotSize(600_000, 35_000);
    expect(full).toBe(2);
    expect(zoomed).toBeGreaterThan(4);
    expect(autoDotSize(600_000, 3)).toBe(9);
    expect(autoDotSize(600_000, 35_000, 0.5)).toBeLessThan(zoomed);
  });
});

describe("parsePlotlyDate", () => {
  it("reads Plotly's zone-less range strings as UTC", () => {
    expect(parsePlotlyDate("2010-05-23 18:13:33.3891")).toBe(Date.UTC(2010, 4, 23, 18, 13, 33, 389));
    expect(parsePlotlyDate("2010-05-23")).toBe(Date.UTC(2010, 4, 23));
    expect(parsePlotlyDate(1234)).toBe(1234);
    expect(parsePlotlyDate("nope")).toBeNull();
  });
});
