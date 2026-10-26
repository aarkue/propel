import { describe, expect, test } from "vitest";
import { modelSvg } from "../../../viz";
import type { ProcessTree } from "../../../viz/types";
import { wasmViz } from "../../../viz/wasm";
import { nodeAtPath, toEditable, toProcessTree } from "../../tree";
import { leafLines } from "./leaf-lines";
import { cssToElementStyle, nodeStyleOverrides } from "./overrides";
import { layoutProcessTree, rowLayout, treeEdgePoints, treeFlow } from "./tree-layout";

// ->( register, X( approve, tau ), <->( ship, bill ), O( pay ) )
const tree: ProcessTree = {
  root: {
    Operator: {
      operator_type: "Sequence",
      children: [
        { Leaf: { activity_label: { Activity: "register" } } },
        {
          Operator: {
            operator_type: "ExclusiveChoice",
            children: [
              { Leaf: { activity_label: { Activity: "approve" } } },
              { Leaf: { activity_label: "Tau" } },
            ],
          },
        },
        {
          Operator: {
            operator_type: "Interleaving",
            children: [
              { Leaf: { activity_label: { Activity: "ship the order to the customer" } } },
              { Leaf: { activity_label: { Activity: "bill" } } },
            ],
          },
        },
        {
          Operator: {
            operator_type: "InclusiveChoice",
            children: [{ Leaf: { activity_label: { Activity: "pay" } } }],
          },
        },
      ],
    },
  },
};

describe("process tree layout through rust4pm", () => {
  test("maps every graph node to the editor node at its path, at the layout's size", async () => {
    const editable = toEditable(tree);
    const laid = await layoutProcessTree(wasmViz, toProcessTree(editable));
    const flow = treeFlow(editable, laid);

    expect(flow.nodes).toHaveLength(laid.nodes.length);
    laid.nodes.forEach((ref, i) => {
      const node = nodeAtPath(editable, ref.path);
      expect(node?.id).toBe(flow.ids[i]);
      const shown = flow.nodes.find((n) => n.id === node?.id);
      expect(shown?.type).toBe(ref.kind);
      expect(shown?.position).toEqual(laid.layout.nodes[i].center);
      expect(shown?.data.size).toEqual(laid.layout.nodes[i].size);
    });

    // rust4pm's classic sizes: operators 34x34, a silent leaf 24x24, a long label on two lines.
    const sizeAt = (path: number[]) =>
      flow.nodes.find((n) => n.id === nodeAtPath(editable, path)?.id)?.data.size;
    expect(sizeAt([])).toEqual({ width: 34, height: 34 });
    expect(sizeAt([1, 1])).toEqual({ width: 24, height: 24 });
    expect(sizeAt([2, 0])?.height).toBeGreaterThan(sizeAt([2, 1])?.height ?? 0);
  });

  test("draws one edge per parent and child, out of the parent's row and into the child's", async () => {
    const editable = toEditable(tree);
    const laid = await layoutProcessTree(wasmViz, toProcessTree(editable));
    const flow = treeFlow(editable, laid);

    const pairs = flow.edges.map((e) => [e.source, e.target]);
    const id = (path: number[]) => nodeAtPath(editable, path)?.id;
    expect(pairs).toHaveLength(9);
    expect(pairs).toContainEqual([id([]), id([0])]);
    expect(pairs).toContainEqual([id([2]), id([2, 0])]);
    expect(pairs).toContainEqual([id([3]), id([3, 0])]);

    // The X operator shares its row with taller leaves. The tau sits below its row's top.
    const xorToTau = flow.edges.find((e) => e.target === id([1, 1]));
    expect(xorToTau?.data?.up).toBeGreaterThan(0);
    const rootToRegister = flow.edges.find((e) => e.target === id([0]));
    expect(rootToRegister?.data?.down).toBe(0);
  });

  test("exports rust4pm's drawing with the overlay styles as overrides", async () => {
    const wire = toProcessTree(toEditable(tree));
    const laid = await layoutProcessTree(wasmViz, wire);
    const overrides = nodeStyleOverrides(laid.nodes.length, (i) =>
      i === 1 ? { borderColor: "#2563eb", backgroundColor: "#dbeafe", opacity: 0.5 } : undefined,
    );
    expect(overrides).toEqual({ nodes: { 1: { fill: "#dbeafe", stroke: "#2563eb", opacity: 0.5 } } });
    const svg = await modelSvg(wasmViz, "process_tree", wire, laid.layout, { overrides });
    expect(svg).toContain("#2563eb");
    expect(svg).toContain("#dbeafe");
    for (const symbol of ["→", "×", "↔", "∨"]) expect(svg).toContain(symbol);
  });
});

describe("row layout without a transport", () => {
  test("puts every node in one row, with the refs rust4pm gives", () => {
    const laid = rowLayout(tree);
    expect(laid.nodes.slice(0, 3)).toEqual([
      { kind: "operator", path: [] },
      { kind: "leaf", path: [0] },
      { kind: "operator", path: [1] },
    ]);
    expect(laid.edges).toEqual([1, 3, 4, 2, 6, 7, 5, 9, 8].map((i) => laid.nodes[i]));
    expect(new Set(laid.layout.nodes.map((p) => p.center.y))).toEqual(new Set([0]));
    const flow = treeFlow(toEditable(tree), laid);
    expect(flow.nodes).toHaveLength(10);
    expect(flow.edges).toHaveLength(9);
  });
});

describe("treeEdgePoints", () => {
  const parent = { center: { x: 100, y: 17 }, size: { width: 34, height: 34 } };
  const child = { center: { x: 40, y: 100 }, size: { width: 24, height: 24 } };

  test("runs straight down out of the parent's row and into the child's", () => {
    expect(treeEdgePoints(parent, child, { down: 4, up: 3 })).toEqual([
      { x: 100, y: 34 },
      { x: 100, y: 38 },
      { x: 40, y: 85 },
      { x: 40, y: 88 },
    ]);
  });

  test("drops the stubs a node that fills its row does not need", () => {
    expect(treeEdgePoints(parent, child, { down: 0, up: 0 })).toEqual([
      { x: 100, y: 34 },
      { x: 40, y: 88 },
    ]);
  });
});

describe("leafLines", () => {
  test("splits as rust4pm's leaf_lines", () => {
    expect(leafLines("place order")).toEqual(["place order"]);
    expect(leafLines("Create Fine Notification")).toEqual(["Create Fine", "Notification"]);
    expect(leafLines("ship the order to the customer")).toEqual(["ship the order", "to the customer"]);
    expect(leafLines("abcdefghijklmnopqrstuvwxyz")).toEqual(["abcdefghijklm", "nopqrstuvwxyz"]);
  });
});

describe("cssToElementStyle", () => {
  test("takes background, border color and width and opacity", () => {
    expect(cssToElementStyle({ background: "#ffffff", borderColor: "#123456", borderWidth: "2px" })).toEqual({
      fill: "#ffffff",
      stroke: "#123456",
      stroke_width: 2,
    });
    expect(cssToElementStyle({ opacity: "0.4" })).toEqual({ opacity: 0.4 });
  });

  test("is nothing for a style the drawing cannot take", () => {
    expect(cssToElementStyle({ color: "#2563eb" })).toBeUndefined();
    expect(cssToElementStyle(undefined)).toBeUndefined();
  });
});
