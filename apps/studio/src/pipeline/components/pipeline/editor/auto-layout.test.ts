import type { Layout } from "@r4pm/components";
import { wasmViz } from "@r4pm/components/viz/wasm";
import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { pipelineLayoutRequest, placeNodes } from "./auto-layout";
import type { AppNode } from "./types";

const node = (id: string, measured?: { width: number; height: number }) =>
  ({ id, type: "function", position: { x: 0, y: 0 }, data: {}, measured }) as unknown as AppNode;
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

const NODES = [
  node("load", { width: 240, height: 80 }),
  node("discover"),
  node("view", { width: 0, height: 0 }),
];
const EDGES = [
  edge("load", "discover"),
  edge("discover", "view"),
  edge("discover", "gone"),
  edge("view", "view"),
];

describe("pipelineLayoutRequest", () => {
  it("sizes nodes as measured, else 200x100, and keeps edges between two known nodes", () => {
    const request = pipelineLayoutRequest(NODES, EDGES);
    expect(request.graph.nodes.map((n) => n.size)).toEqual([
      { width: 240, height: 80 },
      { width: 200, height: 100 },
      { width: 200, height: 100 },
    ]);
    expect(request.graph.edges).toEqual([
      { source: 0, target: 1 },
      { source: 1, target: 2 },
    ]);
    expect(request.preset).toBe("layered");
  });
});

describe("placeNodes", () => {
  it("moves every node to the top-left corner of its laid-out box, left to right", async () => {
    // What `layoutGraph(viz, request)` sends, through the same rust4pm binding the backends run.
    const layout = (await wasmViz.call("layout_graph", {
      request: pipelineLayoutRequest(NODES, EDGES),
    })) as Layout;
    expect(layout.edges).toHaveLength(2);
    const placed = placeNodes(NODES, layout);
    expect(placed.map((n) => n.id)).toEqual(["load", "discover", "view"]);
    const [load, discover, view] = placed.map((n) => n.position);
    expect(load).toEqual({ x: layout.nodes[0].center.x - 120, y: layout.nodes[0].center.y - 40 });
    expect(load.x + 240).toBeLessThan(discover.x);
    expect(discover.x + 200).toBeLessThan(view.x);
  });
});
