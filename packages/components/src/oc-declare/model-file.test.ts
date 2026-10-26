import { describe, expect, it } from "vitest";
import type { OCDeclareArc } from "./index";
import { arcsToModel, nodeDisplayName, toArcs } from "./model";
import { fromModelFile, toModelFile } from "./model-file";

const arcAB: OCDeclareArc = {
  from: "a",
  to: "b",
  arc_type: "EF",
  counts: [1, null],
  label: { each: [{ type: "Simple", object_type: "orders" }], any: [], all: [] },
};
const arcInitA: OCDeclareArc = {
  from: "<init> orders",
  to: "a",
  arc_type: "AS",
  counts: [1, null],
  label: { each: [], any: [], all: [] },
};

const positions = (m: ReturnType<typeof arcsToModel>) =>
  Object.fromEntries(m.nodes.map((n) => [nodeDisplayName(n), n.position]));

describe("model files", () => {
  it("round-trip a model with positions and activities without arcs", () => {
    const base = arcsToModel([arcAB, arcInitA]);
    const model = {
      edges: base.edges,
      nodes: [
        ...base.nodes.map((n, i) => ({ ...n, position: { x: i * 10, y: i * 20 } })),
        { id: "extra", type: "c", kind: "activity" as const, position: { x: 5, y: 6 } },
      ],
    };
    const back = fromModelFile(JSON.parse(JSON.stringify(toModelFile(model))));
    expect(toArcs(back)).toEqual(toArcs(model));
    expect(new Set(back.nodes.map(nodeDisplayName))).toEqual(new Set(model.nodes.map(nodeDisplayName)));
    expect(positions(back)).toEqual(positions(model));
  });

  it("load a plain arc list without positions", () => {
    const model = fromModelFile([arcAB]);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes.every((n) => n.position === undefined)).toBe(true);
    expect(toArcs(model)).toEqual([arcAB]);
  });

  it("reject arcs the editor could not draw", () => {
    const bad = [
      { ...arcAB, arc_type: "XX" },
      { ...arcAB, label: { each: [] } },
      { ...arcAB, counts: [1] },
      { ...arcAB, label: { each: [{ type: "Simple" }], any: [], all: [] } },
    ];
    for (const a of bad) expect(() => fromModelFile([a])).toThrow("Not an OC-DECLARE model");
  });

  it("reject anything else", () => {
    for (const input of [{ foo: 1 }, "x", [{ from: "a" }]]) {
      expect(() => fromModelFile(input)).toThrow("Not an OC-DECLARE model");
    }
  });
});
