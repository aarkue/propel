import { describe, expect, it } from "vitest";
import {
  arcsToModel,
  cardinalitySugar,
  type EdgeTemplate,
  mergeArcs,
  TEMPLATE_TO_ARC,
  templateCounts,
  toArcs,
} from "./model";

describe("mergeArcs", () => {
  it("reuses existing nodes by prefixed name and mints fresh ids for new nodes/edges", () => {
    let n = 0;
    const nextId = () => `x${n++}`;
    const base = {
      nodes: [{ id: "keep", type: "order", kind: "init" as const, position: { x: 1, y: 2 } }],
      edges: [],
    };
    const merged = mergeArcs(
      base,
      [
        {
          from: "<init> order",
          to: "pay",
          arc_type: "EF",
          counts: [1, null],
          label: { each: [], any: [], all: [] },
        },
      ],
      nextId,
    );
    // "order" (init) already present -> reused (id "keep", position preserved); "pay" is new.
    const order = merged.nodes.find((nd) => nd.type === "order");
    const pay = merged.nodes.find((nd) => nd.type === "pay");
    expect(order?.id).toBe("keep");
    expect(order?.position).toEqual({ x: 1, y: 2 });
    expect(pay?.kind).toBe("activity");
    expect(merged.edges).toHaveLength(1);
    expect(merged.edges[0].source).toBe("keep");
    expect(merged.edges[0].target).toBe(pay?.id);
    // fresh ids came from nextId (not the deterministic n0/e0 of arcsToModel).
    expect(merged.edges[0].id).toMatch(/^x\d+$/);
  });
});

describe("template↔arc", () => {
  it("maps every template to its arc type", () => {
    expect(TEMPLATE_TO_ARC.ef).toEqual({ arc_type: "EF", negated: false });
    expect(TEMPLATE_TO_ARC["ef-rev"]).toEqual({ arc_type: "EP", negated: false });
    expect(TEMPLATE_TO_ARC.nef).toEqual({ arc_type: "EF", negated: true });
    expect(TEMPLATE_TO_ARC["ndf-rev"]).toEqual({ arc_type: "DP", negated: true });
    expect(TEMPLATE_TO_ARC.as).toEqual({ arc_type: "AS", negated: false });
  });
  it("negated templates force [0,0] counts, else cardinality ?? [1,null]", () => {
    expect(templateCounts("nef", [3, 5])).toEqual([0, 0]);
    expect(templateCounts("ef", undefined)).toEqual([1, null]);
    expect(templateCounts("ef", [2, 4])).toEqual([2, 4]);
  });
});

describe("cardinalitySugar", () => {
  it("formats ranges with sugar", () => {
    expect(cardinalitySugar(undefined)).toBeNull();
    expect(cardinalitySugar([3, 3])).toBe("= 3");
    expect(cardinalitySugar([2, null])).toBe("≥ 2");
    expect(cardinalitySugar([1, null])).toBeNull(); // implied default
    expect(cardinalitySugar([null, 5])).toBe("≤ 5");
    expect(cardinalitySugar([0, 5])).toBe("≤ 5");
    expect(cardinalitySugar([2, 5])).toBe("2 – 5");
  });
});

describe("arcsToModel", () => {
  it("arcsToModel ∘ toArcs is identity on templates + O2O labels", () => {
    const templates = Object.keys(TEMPLATE_TO_ARC) as EdgeTemplate[];
    const model = {
      nodes: [
        { id: "a", type: "order", kind: "activity" as const },
        { id: "b", type: "item", kind: "exit" as const },
      ],
      edges: templates.map((t, i) => ({
        id: `e${i}`,
        source: "a",
        target: "b",
        template: t,
        label: {
          each: [{ object_type: "order", type: "Simple" as const }],
          any: [],
          all: [{ first: "order", second: "item", reversed: true, type: "O2O" as const }],
        },
      })),
    };
    const back = arcsToModel(toArcs(model));
    expect(back.nodes.map((n) => [n.type, n.kind]).sort()).toEqual([
      ["item", "exit"],
      ["order", "activity"],
    ]);
    expect(back.edges.map((e) => e.template).sort()).toEqual([...templates].sort());
    expect(back.edges[0].label.all[0]).toEqual({
      first: "order",
      second: "item",
      reversed: true,
      type: "O2O",
    });
  });
});

describe("toArcs", () => {
  it("prefixes init/exit and derives arc_type+counts", () => {
    const model = {
      nodes: [
        { id: "n1", type: "order", kind: "init" as const },
        { id: "n2", type: "pay", kind: "activity" as const },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          template: "nef" as const,
          label: { each: [], any: [], all: [] },
        },
      ],
    };
    expect(toArcs(model)).toEqual([
      {
        from: "<init> order",
        to: "pay",
        arc_type: "EF",
        counts: [0, 0],
        label: { each: [], any: [], all: [] },
      },
    ]);
  });
});
