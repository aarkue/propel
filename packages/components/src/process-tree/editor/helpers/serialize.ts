import type { Edge } from "@xyflow/react";
import type { EditableNode, EditableTree } from "../../tree";
import { invalidNodes } from "../../tree";
import type { LeafData, OperatorData, ProcessTreeNode } from "../Editor";

/** Derive the React Flow graph from the tree; positions are placeholders that a layout fn replaces. */
export function treeToNodes(tree: EditableTree): { nodes: ProcessTreeNode[]; edges: Edge[] } {
  const invalid = invalidNodes(tree);
  const nodes: ProcessTreeNode[] = [];
  const edges: Edge[] = [];

  const walk = (n: EditableNode, parent: EditableNode | undefined) => {
    if (n.type === "Operator") {
      nodes.push({
        id: n.id,
        type: "operator",
        position: { x: 0, y: 0 },
        data: { operator_type: n.operator_type, invalid: invalid.has(n.id) } satisfies OperatorData,
      });
    } else {
      nodes.push({
        id: n.id,
        type: "leaf",
        position: { x: 0, y: 0 },
        data: { activity_label: n.activity_label } satisfies LeafData,
      });
    }
    if (parent) {
      edges.push({ id: `${parent.id}->${n.id}`, source: parent.id, target: n.id, type: "tree" });
    }
    if (n.type === "Operator") {
      for (const c of n.children) walk(c, n);
    }
  };

  walk(tree.root, undefined);
  return { nodes, edges };
}
