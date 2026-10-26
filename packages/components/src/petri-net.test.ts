import { describe, expect, it } from "vitest";
import { normalizePetriNet, toRustPetriNet } from "./petri-net";

// `AcceptingPetriNet::to_json()` output of rust4pm.
const RUST_NET = {
  places: [{ name: "start" }, {}, { name: "end" }],
  transitions: [
    { label: "A", name: "tA", inputs: [[0, 1]], outputs: [[1, 2]] },
    { label: null, inputs: [[1, 2]], outputs: [[2, 1]] },
  ],
  initial_marking: { "0": 1 },
  final_marking: { "2": 1 },
};

describe("normalizePetriNet", () => {
  it("reads rust4pm's index-addressed JSON", () => {
    const net = normalizePetriNet(RUST_NET);
    expect(net.places.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    expect(net.transitions).toEqual([
      { id: "t0", label: "A", name: "tA" },
      { id: "t1", label: null, name: null },
    ]);
    expect(net.arcs).toEqual([
      { nodes: ["p0", "t0"], weight: 1 },
      { nodes: ["t0", "p1"], weight: 2 },
      { nodes: ["p1", "t1"], weight: 2 },
      { nodes: ["t1", "p2"], weight: 1 },
    ]);
    expect(net.initial_marking).toEqual({ p0: 1 });
    expect(net.final_marking).toEqual({ p2: 1 });
  });

  it("is idempotent on its own output", () => {
    const net = normalizePetriNet(RUST_NET);
    expect(normalizePetriNet(net)).toEqual(net);
  });

  it("reads the UUID-keyed shape", () => {
    const net = normalizePetriNet({
      places: { a: { id: "a" }, b: { id: "b" } },
      transitions: { t: { id: "t", label: "X" } },
      arcs: [
        { from_to: { type: "PlaceTransition", nodes: ["a", "t"] }, weight: 1 },
        { from_to: { type: "TransitionPlace", nodes: ["t", "b"] }, weight: 1 },
      ],
      initial_marking: { a: 1 },
      final_markings: [{ b: 1 }],
    });
    expect(net.places.map((p) => p.id)).toEqual(["a", "b"]);
    expect(net.arcs.map((a) => a.nodes)).toEqual([
      ["a", "t"],
      ["t", "b"],
    ]);
    expect(net.final_marking).toEqual({ b: 1 });
  });
});

describe("toRustPetriNet", () => {
  it("round-trips rust4pm's JSON", () => {
    expect(toRustPetriNet(normalizePetriNet(RUST_NET))).toEqual(RUST_NET);
  });

  it("merges parallel arcs and drops dangling ones and empty tokens", () => {
    const rust = toRustPetriNet({
      places: [{ id: "x" }, { id: "y" }],
      transitions: [{ id: "t", label: "T" }],
      arcs: [
        { nodes: ["x", "t"] },
        { nodes: ["x", "t"], weight: 2 },
        { nodes: ["t", "y"] },
        { nodes: ["t", "gone"] },
      ],
      initial_marking: { x: 1, y: 0, gone: 3 },
      final_marking: null,
    });
    expect(rust).toEqual({
      places: [{}, {}],
      transitions: [{ label: "T", inputs: [[0, 3]], outputs: [[1, 1]] }],
      initial_marking: { "0": 1 },
      final_marking: {},
    });
  });
});
