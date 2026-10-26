import { describe, expect, it } from "vitest";
import { layoutModel, modelSvg, rerouteModel } from "./index";
import { wasmViz } from "./wasm";

const NET = {
  places: [{ name: "start" }, {}, { name: "end" }],
  transitions: [
    {
      label: "A",
      name: "tA",
      inputs: [[0, 1]] as [number, number][],
      outputs: [[1, 1]] as [number, number][],
    },
    { label: null, inputs: [[1, 1]] as [number, number][], outputs: [[2, 1]] as [number, number][] },
  ],
  initial_marking: { "0": 1 },
  final_marking: { "2": 1 },
};

describe("wasmViz", () => {
  it("lays out, re-routes and draws a Petri net through the embedded wasm", async () => {
    const laid = await layoutModel(wasmViz, "petri_net", NET);
    expect(laid.nodes).toEqual([
      { kind: "place", index: 0 },
      { kind: "place", index: 1 },
      { kind: "place", index: 2 },
      { kind: "transition", index: 0 },
      { kind: "transition", index: 1 },
    ]);
    expect(laid.layout.nodes).toHaveLength(5);
    expect(laid.layout.edges).toHaveLength(4);

    const moved = laid.layout.nodes.map((n, i) =>
      i === 1 ? { x: n.center.x, y: n.center.y + 80 } : n.center,
    );
    const rerouted = await rerouteModel(wasmViz, laid, moved);
    expect(rerouted.nodes[1].center).toEqual(moved[1]);

    const svg = await modelSvg(wasmViz, "petri_net", NET, rerouted, {
      overrides: { nodes: { 3: { fill: "#ff0000" } } },
    });
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).toContain("#ff0000");
  });

  it("lays out and draws a flat OCPN with dashed variable arcs", async () => {
    const ocpn = {
      places: [
        { name: "o0", object_type: "orders" },
        { name: "o1", object_type: "orders" },
        { name: "i0", object_type: "items" },
        { name: "i1", object_type: "items" },
      ],
      transitions: [{ name: "place order", label: "place order" }],
      arcs: [
        { source: "o0", target: "place order", type: "normal" as const, weight: 1 },
        { source: "place order", target: "o1", type: "normal" as const, weight: 1 },
        { source: "i0", target: "place order", type: "variable" as const, weight: 1 },
        { source: "place order", target: "i1", type: "variable" as const, weight: 1 },
      ],
      initial_marking: { o0: 1, i0: 1 },
      final_marking: { o1: 1, i1: 1 },
    };
    const laid = await layoutModel(wasmViz, "ocpn", ocpn);
    expect(laid.nodes).toHaveLength(5);
    expect(laid.edges.map((e) => e.arc).sort()).toEqual([0, 1, 2, 3]);
    const svg = await modelSvg(wasmViz, "ocpn", ocpn, laid.layout);
    expect(svg).toContain('stroke-dasharray="6 3"');
  });

  it("reports an unknown function", async () => {
    await expect(wasmViz.call("no_such_binding", {})).rejects.toThrow(/no binding named/);
  });
});
