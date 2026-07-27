import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { collapseFlowEdges } from "./collapse";
import { normalizeLabel } from "./arc-convert";
import { arcsToModel } from "./model";
import type { OCDeclareArc } from "./index";
import type { ConstraintEdgeData, ConstraintLabel } from "./types";

const lbl = (each: string[] = []): ConstraintLabel => ({
  each: each.map((object_type) => ({ object_type })),
  any: [],
  all: [],
});
const edge = (
  id: string,
  source: string,
  target: string,
  arcType: string,
  label = lbl(["order"]),
): Edge<ConstraintEdgeData> => ({
  id,
  source,
  target,
  type: "constraint",
  data: {
    arcType: arcType as ConstraintEdgeData["arcType"],
    counts: [1, null],
    label,
    bundleIndex: 0,
    bundleTotal: 1,
    constraintIndex: 0,
  },
});

describe("collapseFlowEdges", () => {
  it("merges an EF A->B with an EP B->A of equal label", () => {
    const out = collapseFlowEdges([edge("e1", "a", "b", "EF"), edge("e2", "b", "a", "EP")], true);
    expect(out).toHaveLength(1);
    expect(out[0].data?.arcType).toBe("EFEP");
    expect(out[0].data?.pair).toEqual({ forward: "e1", backward: "e2" });
    expect(out[0].source).toBe("a");
    expect(out[0].target).toBe("b");
  });

  it("merges DF/DP into DFDP", () => {
    const out = collapseFlowEdges([edge("e1", "a", "b", "DF"), edge("e2", "b", "a", "DP")], true);
    expect(out).toHaveLength(1);
    expect(out[0].data?.arcType).toBe("DFDP");
  });

  it("does not merge when labels differ", () => {
    const out = collapseFlowEdges(
      [edge("e1", "a", "b", "EF", lbl(["order"])), edge("e2", "b", "a", "EP", lbl(["item"]))],
      true,
    );
    expect(out).toHaveLength(2);
  });

  it("merges regardless of differing cardinality (label-only match)", () => {
    const ef = edge("e1", "a", "b", "EF");
    ef.data!.counts = [2, 5];
    const ep = edge("e2", "b", "a", "EP");
    ep.data!.counts = [1, null];
    const out = collapseFlowEdges([ef, ep], true);
    expect(out).toHaveLength(1);
    expect(out[0].data?.arcType).toBe("EFEP");
  });

  it("leaves unpaired arcs and passes through when disabled", () => {
    const edges = [edge("e1", "a", "b", "EF"), edge("e2", "a", "c", "EP")];
    expect(collapseFlowEdges(edges, true)).toHaveLength(2);
    expect(collapseFlowEdges([edge("e1", "a", "b", "EF"), edge("e2", "b", "a", "EP")], false)).toHaveLength(
      2,
    );
  });

  it("captures both directions' violations on the merged arc", () => {
    const ef = edge("e1", "a", "b", "EF");
    ef.data!.violation = 0.1;
    const ep = edge("e2", "b", "a", "EP");
    ep.data!.violation = 0.6;
    const out = collapseFlowEdges([ef, ep], true);
    expect(out[0].data?.pairViolation).toEqual({ forward: 0.1, backward: 0.6 });
  });
});

describe("read-only bridge (arcsToModel -> collapse)", () => {
  const arc = (from: string, to: string, arc_type: OCDeclareArc["arc_type"]): OCDeclareArc => ({
    from,
    to,
    arc_type,
    counts: [1, null],
    label: { each: [{ type: "Simple", object_type: "order" }], any: [], all: [] },
  });

  it("collapses a backend EF/EP pair into one merged arc via the model", () => {
    const model = arcsToModel([arc("a", "b", "EF"), arc("b", "a", "EP")]);
    expect(model.edges).toHaveLength(2);
    // Build flow edges the way modelToFlow does (arcType from template), then collapse.
    const flow: Edge<ConstraintEdgeData>[] = model.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "constraint",
      data: {
        arcType: e.template === "ef" ? "EF" : e.template === "ef-rev" ? "EP" : "AS",
        counts: [1, null],
        label: normalizeLabel(e.label),
        bundleIndex: 0,
        bundleTotal: 1,
        constraintIndex: 0,
      },
    }));
    const collapsed = collapseFlowEdges(flow, true);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].data?.arcType).toBe("EFEP");
    expect(collapsed[0].data?.pair).toBeDefined();
  });
});
