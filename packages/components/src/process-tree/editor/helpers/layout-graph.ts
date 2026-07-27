import type { Edge } from "@xyflow/react";
import type { NodeGeom } from "../../../graph-edit/routing";
import { layoutGraph, type LayoutTransport } from "../../../rust-layout";
import type { ProcessTreeNode } from "../Editor";

/** Canonical node sizes, shared by the layout engines, the node components, and the edge clipping. */
export const OPERATOR_SIZE = { width: 64, height: 64 } as const;
export const LEAF_SIZE = { width: 160, height: 56 } as const;

export function nodeSize(type: ProcessTreeNode["type"]): { width: number; height: number } {
  return type === "operator" ? OPERATOR_SIZE : LEAF_SIZE;
}

export function geomOfType(type: ProcessTreeNode["type"]): NodeGeom {
  return { shape: type === "operator" ? "circle" : "box", ...nodeSize(type) };
}

/** Positions nodes by centre, matching the editor's `nodeOrigin=[0.5,0.5]`. Edges stay unrouted:
 *  a tree edge is a straight parent->child line the edge geometry clips to the node borders. */
export type ProcessTreeLayoutFn = (
  nodes: ProcessTreeNode[],
  edges: Edge[],
) => Promise<{ nodes: ProcessTreeNode[]; edges: Edge[] }>;

export function createRustProcessTreeLayout(transport: LayoutTransport): ProcessTreeLayoutFn {
  return async (nodes, edges) => {
    const laid = await layoutGraph(nodes, edges, {
      transport,
      id: (n) => n.id,
      source: (e) => e.source,
      target: (e) => e.target,
      direction: "TB",
      flowEdges: false,
      tree: true,
      nodeSpec: (n) => ({ ...nodeSize(n.type), ellipse: n.type === "operator" }),
    });
    return {
      nodes: nodes.map((n) => ({ ...n, position: laid.centerOf(n.id) }) as ProcessTreeNode),
      edges,
    };
  };
}

/** Engine-agnostic fallback: nodes in a row. Import an engine bundle for a real layout. */
export const noopProcessTreeLayout: ProcessTreeLayoutFn = async (nodes, edges) => ({
  nodes: nodes.map((n, i) => ({ ...n, position: { x: i * 160, y: 0 } }) as ProcessTreeNode),
  edges,
});
