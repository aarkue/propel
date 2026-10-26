import { describe, expect, it } from "vitest";
import { wasmViz } from "../viz/wasm";
import { blueprintLayoutRequest, gridBlueprintPositions, layoutBlueprint } from "./layout";
import { type DerivedEdge, deriveEdges, type EditorMapping, type EditorNode } from "./model";
import { NODE_SIZE } from "./nodes/types";

const object = (node: string): EditorMapping["entry"] => ({
  type: "single",
  node,
  target: {
    type: "object",
    object_type: { type: "constant", value: node },
    id: { type: "column", column: "id" },
    attributes: [],
  },
});

// Two sources joined, the join filtered, and a mapping on a source and on the filter.
const NODES: EditorNode[] = [
  { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
  { id: "b", op: { type: "source", source_id: "erp", table: "customers" } },
  { id: "j", op: { type: "join", left: "a", right: "b", on: [["customer_id", "id"]] } },
  { id: "f", op: { type: "filter", input: "j", condition: { type: "is-null", column: "x" } } },
];
const MAPPINGS: EditorMapping[] = [
  { id: "m-a", entry: object("a") },
  { id: "m-f", entry: object("f") },
];
const EDGES = deriveEdges(NODES, MAPPINGS);

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (p: Box, q: Box) =>
  p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;

function boxes(positions: Map<string, { x: number; y: number }>): Map<string, Box> {
  const size = (id: string) =>
    id.startsWith("m-") ? NODE_SIZE.mapping : NODE_SIZE[NODES.find((n) => n.id === id)?.op.type ?? "filter"];
  return new Map([...positions].map(([id, p]) => [id, { ...p, ...size(id) }]));
}

function expectNoOverlap(laid: Map<string, Box>) {
  const all = [...laid.values()];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
}

describe("blueprintLayoutRequest", () => {
  it("has row nodes then mappings, sized by kind, with edges by index", () => {
    const { request, ids } = blueprintLayoutRequest(NODES, EDGES, MAPPINGS);
    expect(ids).toEqual(["a", "b", "j", "f", "m-a", "m-f"]);
    expect(request.graph.nodes.map((n) => n.size)).toEqual([
      NODE_SIZE.source,
      NODE_SIZE.source,
      NODE_SIZE.join,
      NODE_SIZE.filter,
      NODE_SIZE.mapping,
      NODE_SIZE.mapping,
    ]);
    expect(request.graph.edges).toEqual([
      { source: 0, target: 2 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 0, target: 4 },
      { source: 3, target: 5 },
    ]);
    expect(request.preset).toBe("layered");
  });

  it("drops edges to an id the graph does not hold", () => {
    const dangling: DerivedEdge = { id: "x->f", source: "x", target: "f", kind: "row" };
    const { request } = blueprintLayoutRequest(NODES, [...EDGES, dangling], MAPPINGS);
    expect(request.graph.edges).toHaveLength(EDGES.length);
  });
});

describe("layoutBlueprint", () => {
  it("places every node and mapping left to right without overlap", async () => {
    const positions = await layoutBlueprint(wasmViz, NODES, EDGES, MAPPINGS);
    expect([...positions.keys()].sort()).toEqual(["a", "b", "f", "j", "m-a", "m-f"]);
    const laid = boxes(positions);
    const x = (id: string) => laid.get(id)?.x ?? Number.NaN;
    expect(x("a")).toBeLessThan(x("j"));
    expect(x("j")).toBeLessThan(x("f"));
    expect(x("f")).toBeLessThan(x("m-f"));
    expect(x("a")).toBeLessThan(x("m-a"));
    expectNoOverlap(laid);
  });

  it("returns top-left corners, the centre less half the size", async () => {
    const { request, ids } = blueprintLayoutRequest(NODES, EDGES, MAPPINGS);
    const layout = (await wasmViz.call("layout_graph", { request })) as {
      nodes: { center: { x: number; y: number } }[];
    };
    const positions = await layoutBlueprint(wasmViz, NODES, EDGES, MAPPINGS);
    const j = ids.indexOf("j");
    expect(positions.get("j")).toEqual({
      x: layout.nodes[j].center.x - NODE_SIZE.join.width / 2,
      y: layout.nodes[j].center.y - NODE_SIZE.join.height / 2,
    });
  });
});

describe("gridBlueprintPositions", () => {
  it("puts each node one column right of its furthest input", () => {
    const positions = gridBlueprintPositions(NODES, EDGES, MAPPINGS);
    const column = (id: string) => (positions.get(id)?.x ?? Number.NaN) / 280;
    expect(["a", "b", "j", "f", "m-a", "m-f"].map(column)).toEqual([0, 0, 1, 2, 1, 3]);
    expectNoOverlap(boxes(positions));
  });

  it("lines a single-input node up with its input", () => {
    const positions = gridBlueprintPositions(NODES, EDGES, MAPPINGS);
    const centerY = (id: string, height: number) => (positions.get(id)?.y ?? Number.NaN) + height / 2;
    expect(centerY("f", NODE_SIZE.filter.height)).toBe(centerY("j", NODE_SIZE.join.height));
  });

  it("terminates on a cycle", () => {
    const cyclic: EditorNode[] = [
      { id: "p", op: { type: "filter", input: "q", condition: { type: "is-null", column: "x" } } },
      { id: "q", op: { type: "filter", input: "p", condition: { type: "is-null", column: "x" } } },
    ];
    expect(gridBlueprintPositions(cyclic, deriveEdges(cyclic)).size).toBe(2);
  });
});
