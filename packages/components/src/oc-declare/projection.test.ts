import { describe, expect, it } from "vitest";
import type { OCDeclareArc } from "./index";
import { arcsToModel } from "./model";
import { arcList, focusHidden, isProjected, projectionTargets, visibleArcCount } from "./projection";

const arc = (from: string, to: string, arc_type: OCDeclareArc["arc_type"] = "EF", types: string[] = []) =>
  ({
    from,
    to,
    arc_type,
    counts: [1, null],
    label: { each: types.map((t) => ({ type: "Simple", object_type: t })), any: [], all: [] },
  }) as OCDeclareArc;

describe("projectionTargets", () => {
  it("keeps unhidden activities and synthetic endpoints", () => {
    const arcs = [arc("a", "b"), arc("b", "c"), arc("<init> orders", "a", "AS")];
    expect(projectionTargets(arcs, ["b", "zzz"]).sort()).toEqual(["<init> orders", "a", "c"]);
  });
});

describe("focusHidden", () => {
  it("keeps the activity and its direct neighbours", () => {
    const arcs = [arc("a", "b"), arc("b", "c"), arc("c", "d"), arc("<init> orders", "b", "AS")];
    expect(focusHidden(arcs, "b").sort()).toEqual(["d"]);
  });

  it("hides every other activity when the activity has no neighbours", () => {
    const arcs = [arc("a", "b"), arc("c", "c")];
    expect(focusHidden(arcs, "c").sort()).toEqual(["a", "b"]);
  });
});

describe("visibleArcCount", () => {
  const model = arcsToModel([
    arc("a", "b", "EF", ["orders"]),
    arc("b", "c", "DF", ["items"]),
    arc("a", "c", "AS"),
  ]);

  it("applies the arc-type and object-type filters", () => {
    expect(visibleArcCount(model, new Set(), new Set())).toBe(3);
    expect(visibleArcCount(model, new Set(["DF"]), new Set())).toBe(2);
    expect(visibleArcCount(model, new Set(), new Set(["orders"]))).toBe(2);
    expect(visibleArcCount(model, new Set(["DF"]), new Set(["orders"]))).toBe(1);
  });
});

describe("arcList", () => {
  it("reads anything that is not an arc list, like a saved model file, as no arcs", () => {
    const arcs = [arc("a", "b")];
    expect(arcList(arcs)).toBe(arcs);
    expect(arcList({ version: 1, arcs, nodes: [] })).toEqual([]);
    expect(arcList(undefined)).toEqual([]);
  });
});

describe("isProjected", () => {
  it("only holds when a hidden name is an activity of the model", () => {
    const arcs = [arc("a", "b"), arc("<init> orders", "a", "AS")];
    expect(isProjected(arcs, [])).toBe(false);
    expect(isProjected(arcs, ["zzz", "<init> orders"])).toBe(false);
    expect(isProjected(arcs, ["zzz", "b"])).toBe(true);
  });
});
