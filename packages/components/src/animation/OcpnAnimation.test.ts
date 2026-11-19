import { describe, expect, it } from "vitest";
import type { Ocpn, Point } from "../viz";
import { moveColor } from "../shared/move-terms";
import { deviationByTransition, deviationColor, ocpnTrips } from "./OcpnAnimation";

// place order -> pack, for orders (o0 -> place -> o1 -> pack -> o2) and items (i0 -> place -> i1 -> pack -> i2).
const ocpn: Ocpn = {
  places: ["o0", "o1", "o2"]
    .map((name) => ({ name, object_type: "orders" }))
    .concat(["i0", "i1", "i2"].map((name) => ({ name, object_type: "items" }))),
  transitions: [
    { name: "place", label: "place" },
    { name: "pack", label: "pack" },
  ],
  arcs: [
    { source: "o0", target: "place" },
    { source: "place", target: "o1" },
    { source: "o1", target: "pack" },
    { source: "pack", target: "o2" },
    { source: "i0", target: "place" },
    { source: "place", target: "i1" },
    { source: "i1", target: "pack" },
    { source: "pack", target: "i2" },
  ],
  initial_marking: { o0: 1, i0: 1 },
  final_marking: { o2: 1, i2: 1 },
};

const centres = new Map<string, Point>(
  ["o0", "o1", "o2", "i0", "i1", "i2", "place", "pack"].map((n, i) => [n, { x: i * 10, y: 0 }]),
);

describe("ocpnTrips", () => {
  it("moves an object's tokens only through places of its type", () => {
    const trips = ocpnTrips(
      ocpn,
      new Map(),
      centres,
      {
        journeys: [
          {
            id: "i1",
            object_type: "items",
            firings: [
              { transition: 0, time: 100, sync: true },
              { transition: 1, time: 300, sync: false },
            ],
          },
        ],
      },
      10,
      () => "#123456",
    );
    // The initial token waits in i0, hops to "place"; the item's token hops into i1, waits, hops
    // to "pack" (skipped, so amber); the last one hops into the final place i2 and stays.
    expect(trips.map((t) => [t.t0, t.t1])).toEqual([
      [70, 90],
      [90, 100],
      [100, 110],
      [110, 290],
      [290, 300],
      [300, 310],
      [310, 330],
    ]);
    const waiting = trips[3];
    expect(waiting.points[0]).toEqual(waiting.points[1]);
    expect(trips[4].color).toBe(moveColor("model"));
    expect(trips[4].target).toBe("t:1");
    expect(trips[0].color).toBe("#123456");
  });
});

describe("deviation", () => {
  it("sums firings over object types", () => {
    const m = deviationByTransition([
      { transition: 1, object_type: "a", sync: 3, model: 1 },
      { transition: 1, object_type: "b", sync: 1, model: 1 },
    ]);
    expect(m.get(1)).toEqual({ sync: 4, model: 2 });
  });
  it("uses the move colors: sync at none, model move at all", () => {
    expect(deviationColor(0)).toBe(moveColor("sync"));
    expect(deviationColor(1)).toBe(moveColor("model"));
    expect(deviationColor(-1)).toBe(deviationColor(0));
  });
});
