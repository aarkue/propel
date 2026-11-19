import { describe, expect, it } from "vitest";
import type { RustPetriNet } from "../petri/net-json";
import { moveColor } from "../shared/move-terms";
import { type NetReplay, netTrips } from "./PetriNetAnimation";

// p0 -a-> p1 -b-> p2, and a silent c that adds a second token to p1.
const net = {
  places: [{}, {}, {}],
  transitions: [
    { label: "a", inputs: [[0, 1]], outputs: [[1, 1]] },
    { label: "b", inputs: [[1, 1]], outputs: [[2, 1]] },
    { label: null, inputs: [], outputs: [[1, 1]] },
  ],
  initial_marking: { 0: 1 },
  final_marking: { 2: 1 },
} as unknown as RustPetriNet;

const at = (x: number) => ({ center: { x, y: 0 }, size: { width: 10, height: 10 } });
const laid = {
  nodes: [
    { kind: "place", index: 0 },
    { kind: "place", index: 1 },
    { kind: "place", index: 2 },
    { kind: "transition", index: 0 },
    { kind: "transition", index: 1 },
    { kind: "transition", index: 2 },
  ],
  edges: [],
  layout: { nodes: [at(0), at(20), at(40), at(10), at(30), at(20)], edges: [] },
} as never;

const replay = (firings: [number, number, boolean][]): NetReplay => ({
  journeys: [
    {
      firings: firings.map(([transition, time, sync]) => ({ transition, time, sync })),
      log_moves: [] as [string, number][],
    },
  ],
  total: 1,
  unaligned: 0,
  min_ms: 0,
  max_ms: 100,
});

/** Times at which no trip is active, sampled between `from` and `to`. */
function gaps(trips: { t0: number; t1: number }[], from: number, to: number) {
  const out: number[] = [];
  for (let t = from; t <= to; t += 0.5) if (!trips.some((tr) => tr.t0 <= t && t <= tr.t1)) out.push(t);
  return out;
}

describe("netTrips", () => {
  it("keeps a case's token visible from its start to its end", () => {
    const trips = netTrips(
      net,
      laid,
      replay([
        [0, 0, true],
        [1, 10, true],
      ]),
      1,
    );
    expect(gaps(trips, -3, 13)).toEqual([]);
    expect(trips.filter((t) => t.target === "t1").map((t) => [t.t0, t.t1])).toEqual([[9, 10]]);
  });

  it("lets a token wait in its place, not on the arc", () => {
    const trips = netTrips(
      net,
      laid,
      replay([
        [0, 0, true],
        [1, 10, true],
      ]),
      1,
    );
    const waiting = trips.find((t) => t.t0 === 1 && t.t1 === 9);
    expect(waiting?.points[0]).toEqual(waiting?.points[1]);
  });

  it("keeps a second token waiting in the same place", () => {
    const trips = netTrips(
      net,
      laid,
      replay([
        [0, 0, true],
        [2, 5, false],
        [1, 10, true],
      ]),
      1,
    );
    // b consumes the older token, produced by a at 0, so its wait starts right after a.
    expect(trips.some((t) => t.t0 === 1 && t.t1 === 9)).toBe(true);
    expect(trips.every((t) => t.color === moveColor("sync"))).toBe(true);
  });

  it("shows an event the net cannot follow where it happens", () => {
    const r = replay([
      [0, 0, true],
      [1, 10, true],
    ]);
    r.journeys[0].log_moves = [
      ["a", 5],
      ["x", 6],
    ];
    const flashes = netTrips(net, laid, r, 1).filter((t) => t.color === moveColor("log"));
    expect(flashes.map((t) => [t.t0, t.points[0].x])).toEqual([
      [4, 10],
      [5, 10],
    ]);
  });
});
