import type { Edge, XYPosition } from "@xyflow/react";
import { layoutModel, type ModelLayout, type VizTransport } from "../../../viz";
import type { Placement, ProcessTree, ProcessTreeNode, ProcessTreeNodeRef, Size } from "../../../viz/types";
import { type EditableTree, invalidNodes, nodeAtPath } from "../../tree";
import type { LeafData, OperatorData, TreeFlowNode } from "../Editor";

/** A tree's graph as laid out: the tree node behind each graph node and the child graph node each
 *  edge leads to, with the layout of that graph. */
export type LaidTree = Pick<ModelLayout<"process_tree">, "nodes" | "edges" | "layout">;

/** How far a parent->child line runs straight out of its parent's row (`down`) and into its
 *  child's row (`up`), beyond the two nodes' own borders. */
export interface TreeEdgeData {
  down: number;
  up: number;
  [key: string]: unknown;
}

const FALLBACK_OPERATOR: Size = { width: 34, height: 34 };
const FALLBACK_SILENT: Size = { width: 24, height: 24 };
const FALLBACK_LEAF: Size = { width: 160, height: 46 };
const FALLBACK_GAP = 24;

/** Lay the tree out with rust4pm, or without a transport put its nodes in a row. */
export function layoutProcessTree(viz: VizTransport | undefined, tree: ProcessTree): Promise<LaidTree> {
  return viz ? layoutModel(viz, "process_tree", tree) : Promise.resolve(rowLayout(tree));
}

/** The nodes in pre-order in one row, with the refs rust4pm would give them. */
export function rowLayout(tree: ProcessTree): LaidTree {
  const nodes: ProcessTreeNodeRef[] = [];
  const edges: ProcessTreeNodeRef[] = [];
  const placements: Placement[] = [];
  let x = 0;
  const walk = (node: ProcessTreeNode, path: number[]): number => {
    const index = nodes.length;
    const size =
      "Operator" in node
        ? FALLBACK_OPERATOR
        : node.Leaf.activity_label === "Tau"
          ? FALLBACK_SILENT
          : FALLBACK_LEAF;
    nodes.push({ kind: "Operator" in node ? "operator" : "leaf", path });
    placements.push({ center: { x: x + size.width / 2, y: 0 }, size, order: index, rank: 0 });
    x += size.width + FALLBACK_GAP;
    if ("Operator" in node) {
      node.Operator.children.forEach((child, i) => {
        edges.push(nodes[walk(child, [...path, i])]);
      });
    }
    return index;
  };
  walk(tree.root, []);
  const height = Math.max(...placements.map((p) => p.size.height));
  return {
    nodes,
    edges,
    layout: {
      bounds: { min: { x: 0, y: -height / 2 }, max: { x: Math.max(0, x - FALLBACK_GAP), y: height / 2 } },
      nodes: placements,
      edges: edges.map(() => ({ kind: "direct", points: [] })),
      layer_count: 1,
      reversed: [],
      stats: { dummy_count: 0 },
    },
  };
}

const pathKey = (path: readonly number[]) => path.join(".");

/** The React Flow nodes and edges of `tree` at a layout of it. `ids[i]` is the editable node
 *  behind graph node `i`. */
export function treeFlow(
  tree: EditableTree,
  laid: LaidTree,
): { nodes: TreeFlowNode[]; edges: Edge<TreeEdgeData>[]; ids: string[] } {
  const invalid = invalidNodes(tree);
  const nodes: TreeFlowNode[] = [];
  const ids: string[] = [];
  const indexByPath = new Map<string, number>();
  laid.nodes.forEach((ref, i) => {
    const node = nodeAtPath(tree, ref.path);
    const placement = laid.layout.nodes[i];
    if (!node || !placement) return;
    indexByPath.set(pathKey(ref.path), i);
    ids[i] = node.id;
    const common = { id: node.id, position: placement.center };
    nodes.push(
      node.type === "Operator"
        ? {
            ...common,
            type: "operator",
            data: {
              operator_type: node.operator_type,
              size: placement.size,
              invalid: invalid.has(node.id),
            } satisfies OperatorData,
          }
        : {
            ...common,
            type: "leaf",
            data: { activity_label: node.activity_label, size: placement.size } satisfies LeafData,
          },
    );
  });

  const rows = rowBands(laid.layout.nodes);
  const band = (p: Placement) => rows.get(p.rank ?? 0) ?? extent(p);
  const edges: Edge<TreeEdgeData>[] = [];
  for (const ref of laid.edges) {
    const path = ref.path;
    const child = indexByPath.get(pathKey(path));
    if (child === undefined || path.length === 0) continue;
    const parent = indexByPath.get(pathKey(path.slice(0, -1)));
    if (parent === undefined || ids[parent] === undefined || ids[child] === undefined) continue;
    const from = laid.layout.nodes[parent];
    const to = laid.layout.nodes[child];
    edges.push({
      id: `${ids[parent]}->${ids[child]}`,
      source: ids[parent],
      target: ids[child],
      type: "tree",
      data: {
        down: band(from).bottom - extent(from).bottom,
        up: extent(to).top - band(to).top,
      },
    });
  }
  return { nodes, edges, ids };
}

const extent = (p: Placement) => ({
  top: p.center.y - p.size.height / 2,
  bottom: p.center.y + p.size.height / 2,
});

/** Where each row of the layout begins and ends vertically. */
function rowBands(placements: Placement[]): Map<number, { top: number; bottom: number }> {
  const rows = new Map<number, { top: number; bottom: number }>();
  for (const p of placements) {
    const { top, bottom } = extent(p);
    const row = rows.get(p.rank ?? 0);
    rows.set(
      p.rank ?? 0,
      row ? { top: Math.min(row.top, top), bottom: Math.max(row.bottom, bottom) } : { top, bottom },
    );
  }
  return rows;
}

/** A parent->child line as rust4pm's classic look draws it: straight down out of the parent's row,
 *  across the gap between the rows, and straight down into the child. */
export function treeEdgePoints(
  parent: { center: XYPosition; size: Size },
  child: { center: XYPosition; size: Size },
  { down, up }: Pick<TreeEdgeData, "down" | "up">,
): XYPosition[] {
  const start = parent.center.y + parent.size.height / 2;
  const end = child.center.y - child.size.height / 2;
  const points = [
    { x: parent.center.x, y: start },
    { x: parent.center.x, y: start + down },
    { x: child.center.x, y: end - up },
    { x: child.center.x, y: end },
  ];
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.01);
}
