import type { OCDeclareArc } from "@r4pm/client";
import { describe, expect, it, vi } from "vitest";
import { arcsToModel } from "../../../../packages/components/src/oc-declare/model";
import { OC_DECLARE_DEFAULTS } from "./_oc-declare-discovery";
import {
  arcKey,
  asksBeforeReplace,
  contentKey,
  discoverButton,
  initialOrigin,
  newArcs,
  originAfterChange,
  viewSettings,
  viewStateForEdit,
  withEvaluation,
} from "./_oc-declare-workbench";

// The @r4pm/components root loads plotly, which needs a browser. The model module does not.
vi.mock("@r4pm/components", async () => ({
  ...(await import("../../../../packages/components/src/oc-declare/model")),
  ...(await import("../../../../packages/components/src/oc-declare/projection")),
}));

const arc = (from: string, to: string) =>
  ({ from, to, arc_type: "EF", counts: [1, null], label: { each: [], any: [], all: [] } }) as OCDeclareArc;
const model = arcsToModel([arc("a", "b"), arc("b", "c")] as never);

describe("the model's origin", () => {
  it("does not change when nodes move, and becomes edited when constraints or nodes change", () => {
    const moved = {
      ...model,
      nodes: model.nodes.map((n) => ({ ...n, position: { x: 1, y: 2 } })),
      edges: model.edges.map((e) => ({
        ...e,
        route: { points: [], sourcePos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 } },
      })),
    };
    expect(originAfterChange(model, moved, "discovered")).toBe("discovered");
    expect(originAfterChange(model, moved, "loaded")).toBe("loaded");
    expect(originAfterChange(model, { ...model, edges: model.edges.slice(1) }, "discovered")).toBe("edited");
    const extraNode = {
      ...model,
      nodes: [...model.nodes, { id: "x", type: "d", kind: "activity" as const }],
    };
    expect(originAfterChange(model, extraNode, "discovered")).toBe("edited");
  });

  it("starts from the panel's params", () => {
    expect(initialOrigin({})).toBe("discovered");
    expect(initialOrigin({ model: { nodes: [], edges: [] } })).toBe("discovered");
    expect(initialOrigin({ origin: "edited" })).toBe("edited");
    expect(initialOrigin({ model })).toBe("loaded");
    expect(initialOrigin({ doc: { version: 1, arcs: [], nodes: [] } })).toBe("loaded");
    expect(initialOrigin({ origin: "nonsense", model })).toBe("loaded");
  });

  it("ignores the order of arcs and nodes", () => {
    const reordered = { nodes: [...model.nodes].reverse(), edges: [...model.edges].reverse() };
    expect(contentKey(reordered)).toBe(contentKey(model));
  });
});

describe("the discover button", () => {
  const run = { ocel: "ocel-1", options: OC_DECLARE_DEFAULTS };
  it("reads Discover, Re-run or Up to date", () => {
    expect(discoverButton(null, run, "discovered", false)).toBe("discover");
    expect(discoverButton(null, run, "discovered", true)).toBe("discover");
    expect(discoverButton(run, { ...run }, "discovered", true)).toBe("up-to-date");
    expect(discoverButton(run, { ...run, ocel: "ocel-2" }, "discovered", true)).toBe("rerun");
    expect(
      discoverButton(
        run,
        { ...run, options: { ...OC_DECLARE_DEFAULTS, noise_threshold: 0.3 } },
        "edited",
        true,
      ),
    ).toBe("rerun");
    expect(discoverButton(run, run, "loaded", true)).toBe("discover");
  });

  it("stays available after edits, so discovery can replace or extend them", () => {
    expect(discoverButton(run, run, "edited", true)).toBe("discover");
  });
});

describe("replacing the model", () => {
  it("asks only for edited or loaded models", () => {
    expect(asksBeforeReplace("discovered", true)).toBe(false);
    expect(asksBeforeReplace("edited", true)).toBe(true);
    expect(asksBeforeReplace("loaded", true)).toBe(true);
    expect(asksBeforeReplace("edited", false)).toBe(false);
  });
});

describe("adding discovered constraints to the model", () => {
  it("only adds the ones the model does not have yet", () => {
    expect(newArcs(model, [arc("a", "b"), arc("c", "d")])).toEqual([arc("c", "d")]);
  });
});

describe("display settings", () => {
  it("come from the view state, with the viewer's defaults", () => {
    expect(viewSettings({})).toEqual({
      direction: "RIGHT",
      textLabels: false,
      hiddenArcTypes: [],
      hiddenObjectTypes: [],
    });
    expect(
      viewSettings({
        layoutDirection: "DOWN",
        showTextLabels: true,
        hiddenArcTypes: ["EP"],
        hiddenObjectTypes: 3,
      }),
    ).toEqual({ direction: "DOWN", textLabels: true, hiddenArcTypes: ["EP"], hiddenObjectTypes: [] });
  });
});

describe("entering Edit", () => {
  it("shows every activity", () => {
    expect(viewStateForEdit({ hiddenActivities: ["a"], layoutDirection: "DOWN" })).toEqual({
      hiddenActivities: [],
      layoutDirection: "DOWN",
    });
  });
});

describe("evaluation marks", () => {
  it("apply only to the model and log they were made for", () => {
    const evaluation = {
      key: contentKey(model),
      ocel: "ocel-1",
      violations: { [arcKey(arc("a", "b"))]: 0.25 },
    };
    expect(withEvaluation(model, evaluation, "ocel-2").edges.every((e) => e.violation === undefined)).toBe(
      true,
    );
    const marked = withEvaluation(model, evaluation, "ocel-1");
    expect(marked.edges[0].violation).toBe(0.25);
    expect(marked.edges[1].violation).toBeUndefined();
    const changed = { ...model, edges: model.edges.slice(1) };
    expect(withEvaluation(changed, evaluation, "ocel-1").edges.every((e) => e.violation === undefined)).toBe(
      true,
    );
    expect(withEvaluation(model, null, "ocel-1")).toBe(model);
  });
});
