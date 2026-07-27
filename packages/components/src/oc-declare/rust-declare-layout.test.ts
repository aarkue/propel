import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { createRustDeclareLayout } from "./rust-declare-layout";
import { wasmTransport } from "../rust-layout/wasm";

const HW = 75;
const HH = 29;
type P = { x: number; y: number };
const mkNode = (id: string, pos: P): Node => ({
  id,
  type: "activity",
  position: pos,
  data: { label: id, kind: "activity" },
});
const mkEdge = (id: string, s: string, t: string): Edge => ({
  id,
  source: s,
  target: t,
  type: "constraint",
  data: {
    arcType: "EF",
    counts: [1, null],
    label: { each: [{ type: "Simple", object_type: "order" }], any: [], all: [] },
    template: "ef",
    bundleTotal: 1,
    bundleIndex: 0,
  },
});
const seeded = (nodes: Node[]) => {
  const s = new Map(nodes.map((n) => [n.id, { x: n.position.x + HW, y: n.position.y + HH }]));
  return {
    direction: "RIGHT" as const,
    reroute: true,
    seed: (n: Node) => ({ ...s.get(n.id)!, pinned: true }),
  };
};

const midY = (pts: P[]) => (pts[0].y + pts[pts.length - 1].y) / 2;

describe("createRustDeclareLayout straightening", () => {
  it("fans anti-parallel edges well apart, not onto the same line", async () => {
    const layout = createRustDeclareLayout(wasmTransport);
    const nodes = [mkNode("a", { x: 0, y: 0 }), mkNode("b", { x: 300, y: 0 })];
    const edges = [mkEdge("e1", "a", "b"), mkEdge("e2", "b", "a")];
    const r = await layout(nodes, edges, seeded(nodes));
    const [p1, p2] = r.edges.map((e) => (e.data as { routedPoints?: P[] }).routedPoints ?? []);
    expect(Math.abs(midY(p1) - midY(p2))).toBeGreaterThan(20);
  });

  it("fans 3 same-direction arcs into 3 distinct lanes", async () => {
    const layout = createRustDeclareLayout(wasmTransport);
    const nodes = [mkNode("a", { x: 0, y: 0 }), mkNode("b", { x: 300, y: 0 })];
    const edges = [mkEdge("e1", "a", "b"), mkEdge("e2", "a", "b"), mkEdge("e3", "a", "b")];
    const r = await layout(nodes, edges, seeded(nodes));
    const ys = r.edges
      .map((e) => midY((e.data as { routedPoints?: P[] }).routedPoints ?? []))
      .sort((x, y) => x - y);
    expect(ys[1] - ys[0]).toBeGreaterThan(20);
    expect(ys[2] - ys[1]).toBeGreaterThan(20);
  });

  it("still straightens a lone near-aligned edge", async () => {
    const layout = createRustDeclareLayout(wasmTransport);
    const nodes = [mkNode("a", { x: 0, y: 0 }), mkNode("b", { x: 300, y: 18 })];
    const r = await layout(nodes, [mkEdge("e1", "a", "b")], seeded(nodes));
    const pts = (r.edges[0].data as { routedPoints?: P[] }).routedPoints ?? [];
    expect(pts).toHaveLength(2);
  });
});
