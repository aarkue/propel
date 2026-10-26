import { describe, expect, test } from "vitest";
import { modelSvg } from "../viz";
import { wasmViz } from "../viz/wasm";
import type { OcelTypeGraphEdge, OcelTypeGraphNode } from "./OcelTypeGraph";
import {
  layoutTypeGraph,
  pointAlong,
  roundedPath,
  rowsLayout,
  toTypeGraph,
  typeGraphOverrides,
} from "./type-graph";

const nodes: OcelTypeGraphNode[] = [
  { id: "e:place order", label: "place order", kind: "event", count: 1200 },
  { id: "e:pick item", label: "pick item", kind: "event", count: 4300 },
  { id: "o:order", label: "order", kind: "object", count: 1200 },
  { id: "o:item", label: "item", kind: "object" },
];

const edges: OcelTypeGraphEdge[] = [
  { id: "po-order", source: "e:place order", target: "o:order", qualifier: "creates" },
  { id: "pi-item", source: "e:pick item", target: "o:item", qualifier: "picks" },
  { id: "order-item", source: "o:order", target: "o:item", qualifier: "contains" },
  { id: "item-item", source: "o:item", target: "o:item", qualifier: "replaces" },
  { id: "dangling", source: "o:order", target: "o:customer" },
];

describe("toTypeGraph", () => {
  test("indexes the nodes and keeps the edges between two of them", () => {
    const { graph, nodeIds, edgeIds } = toTypeGraph(nodes, edges);
    expect(nodeIds).toEqual(nodes.map((n) => n.id));
    expect(graph.nodes[0]).toEqual({ kind: "event", label: "place order", count: 1200 });
    expect(graph.nodes[3]).toEqual({ kind: "object", label: "item", count: null });
    expect(edgeIds).toEqual(["po-order", "pi-item", "order-item", "item-item"]);
    expect(graph.edges[2]).toEqual({ source: 2, target: 3, qualifier: "contains" });
    expect(graph.edges[3]).toEqual({ source: 3, target: 3, qualifier: "replaces" });
  });
});

describe("type graph layout through rust4pm", () => {
  test("refers back to the OcTypeGraph by index and routes every edge, the self-loop too", async () => {
    const { graph } = toTypeGraph(nodes, edges);
    const laid = await layoutTypeGraph(wasmViz, graph);
    expect([...laid.nodes].sort()).toEqual([0, 1, 2, 3]);
    expect([...laid.edges].sort()).toEqual([0, 1, 2, 3]);
    for (const [k, i] of laid.nodes.entries()) {
      const width = 8 * graph.nodes[i].label.length + 24;
      expect(laid.layout.nodes[k].size).toEqual({ width: Math.min(260, Math.max(120, width)), height: 44 });
    }
    for (const route of laid.layout.edges) expect(route.points.length).toBeGreaterThanOrEqual(2);
  });

  test("routes orthogonally on request", async () => {
    const { graph } = toTypeGraph(nodes, edges);
    const segments = (laid: Awaited<ReturnType<typeof layoutTypeGraph>>) =>
      laid.layout.edges.flatMap((r) => r.points.slice(1).map((b, i) => [r.points[i], b]));
    const axisAligned = ([a, b]: { x: number; y: number }[]) =>
      Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;
    expect(segments(await layoutTypeGraph(wasmViz, graph)).every(axisAligned)).toBe(false);
    expect(segments(await layoutTypeGraph(wasmViz, graph, "orthogonal")).every(axisAligned)).toBe(true);
  });

  test("exports rust4pm's drawing with the host styling as overrides", async () => {
    const indexed = toTypeGraph(nodes, edges);
    const laid = await layoutTypeGraph(wasmViz, indexed.graph);
    const overrides = typeGraphOverrides(indexed, laid, {
      colorOf: (id) => (id === "o:order" ? "#ff0000" : undefined),
      ringOf: (id) => (id === "e:place order" ? "#10b98180" : undefined),
      dimmed: (id) => id === "e:pick item",
      edgeStyle: (id) => (id === "order-item" ? { color: "#2563eb", width: 3 } : { dimmed: true }),
    });
    const at = (id: string) => laid.nodes.indexOf(indexed.nodeIds.indexOf(id));
    const edgeAt = (id: string) => laid.edges.indexOf(indexed.edgeIds.indexOf(id));
    expect(overrides.nodes?.[at("o:order")]).toEqual({ fill: "#ffd9d9", stroke: "#ff0000" });
    expect(overrides.nodes?.[at("e:place order")]).toEqual({ stroke: "#87dcc0" });
    expect(overrides.nodes?.[at("e:pick item")]).toEqual({ opacity: 0.35 });
    expect(overrides.nodes?.[at("o:item")]).toBeUndefined();
    expect(overrides.edges?.[edgeAt("order-item")]).toEqual({ stroke: "#2563eb", stroke_width: 3 });
    expect(overrides.edges?.[edgeAt("po-order")]).toEqual({ opacity: 0.3 });

    const svg = await modelSvg(wasmViz, "oc_type_graph", indexed.graph, laid.layout, { overrides });
    for (const text of ["#ffd9d9", "#87dcc0", "#2563eb", "contains", "replaces", "1,200", "4,300"]) {
      expect(svg).toContain(text);
    }
    // The two relations from object types are O2O, so dashed.
    expect(svg.match(/stroke-dasharray="6 3"/g)).toHaveLength(2);
  });
});

describe("rowsLayout without a transport", () => {
  test("puts event types above object types and runs edges between borders", () => {
    const { graph } = toTypeGraph(nodes, edges);
    const laid = rowsLayout(graph);
    expect(laid.nodes).toEqual([0, 1, 2, 3]);
    const y = laid.layout.nodes.map((p) => p.center.y);
    expect(y[0]).toBe(y[1]);
    expect(y[2]).toBeGreaterThan(y[0]);
    const route = laid.layout.edges[0].points;
    const [first, last] = [route[0], route[route.length - 1]];
    expect(first?.y).toBe(y[0] + 22);
    expect(last?.y).toBe(y[2] - 22);
    expect(laid.layout.edges[3].points).toHaveLength(4);
  });
});

describe("polyline helpers", () => {
  test("pointAlong walks the polyline by length", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 30 },
    ];
    expect(pointAlong(pts, 0.5)).toEqual({ x: 10, y: 10 });
    expect(pointAlong(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(pts, 1)).toEqual({ x: 10, y: 30 });
  });

  test("roundedPath rounds each corner by the radius", () => {
    expect(
      roundedPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 30 },
        ],
        4,
      ),
    ).toBe("M0,0 L6,0 Q10,0 10,4 L10,30");
    expect(
      roundedPath(
        [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        4,
      ),
    ).toBe("M0,0 L5,5");
  });
});
