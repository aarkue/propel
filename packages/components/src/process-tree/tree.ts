/** Process tree model and structural edit operations. {@link ProcessTree} is the wire model (1:1 of
 *  Rust `process_mining::ProcessTree`, no ids); {@link EditableTree} adds a session-local id per node. */
import { uid } from "../shared/id";

export type OperatorType = "Sequence" | "ExclusiveChoice" | "Concurrency" | "Loop";

export type LeafLabel = { type: "Activity"; value: string } | { type: "Tau" };

export type PTNode =
  | { type: "Operator"; operator_type: OperatorType; children: PTNode[] }
  | { type: "Leaf"; activity_label: LeafLabel };

export interface ProcessTree {
  root: PTNode;
}

export type EditableNode =
  | { id: string; type: "Operator"; operator_type: OperatorType; children: EditableNode[] }
  | { id: string; type: "Leaf"; activity_label: LeafLabel };

export interface EditableTree {
  root: EditableNode;
}

/** The symbol drawn on an operator node. */
export const OPERATOR_SYMBOL: Record<OperatorType, string> = {
  Sequence: "→",
  ExclusiveChoice: "×",
  Concurrency: "∧",
  Loop: "↺",
};

export const OPERATOR_TYPES: OperatorType[] = ["Sequence", "ExclusiveChoice", "Concurrency", "Loop"];

/** The operator's user-facing name. */
export const OPERATOR_TITLE: Record<OperatorType, string> = {
  Sequence: "Sequence",
  ExclusiveChoice: "Exclusive choice",
  Concurrency: "Concurrency",
  Loop: "Loop",
};

export function newLeaf(label?: string): EditableNode {
  return {
    id: uid(),
    type: "Leaf",
    activity_label: label == null ? { type: "Tau" } : { type: "Activity", value: label },
  };
}

export function newOperator(op: OperatorType, children: EditableNode[] = []): EditableNode {
  return { id: uid(), type: "Operator", operator_type: op, children };
}

export function toEditable(tree: ProcessTree): EditableTree {
  const conv = (n: PTNode): EditableNode =>
    n.type === "Operator"
      ? { id: uid(), type: "Operator", operator_type: n.operator_type, children: n.children.map(conv) }
      : { id: uid(), type: "Leaf", activity_label: n.activity_label };
  return { root: conv(tree.root) };
}

export function toProcessTree(tree: EditableTree): ProcessTree {
  const conv = (n: EditableNode): PTNode =>
    n.type === "Operator"
      ? { type: "Operator", operator_type: n.operator_type, children: n.children.map(conv) }
      : { type: "Leaf", activity_label: n.activity_label };
  return { root: conv(tree.root) };
}

export function findNode(tree: EditableTree, id: string): EditableNode | undefined {
  const walk = (n: EditableNode): EditableNode | undefined => {
    if (n.id === id) return n;
    if (n.type !== "Operator") return undefined;
    for (const c of n.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(tree.root);
}

/** Every id in the subtree rooted at `node`, itself included. */
export function subtreeIds(node: EditableNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: EditableNode) => {
    ids.add(n.id);
    if (n.type === "Operator") n.children.forEach(walk);
  };
  walk(node);
  return ids;
}

export function parentOf(tree: EditableTree, id: string): EditableNode | undefined {
  const walk = (n: EditableNode): EditableNode | undefined => {
    if (n.type !== "Operator") return undefined;
    if (n.children.some((c) => c.id === id)) return n;
    for (const c of n.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(tree.root);
}

/** Rebuild the tree, replacing the node with `id` by `fn`'s result (undefined removes it). */
function mapNode(
  tree: EditableTree,
  id: string,
  fn: (n: EditableNode) => EditableNode | undefined,
): EditableTree {
  const walk = (n: EditableNode): EditableNode | undefined => {
    if (n.id === id) return fn(n);
    if (n.type !== "Operator") return n;
    return { ...n, children: n.children.map(walk).filter((c): c is EditableNode => c !== undefined) };
  };
  const root = walk(tree.root);
  // The root always survives: an empty tree is not representable.
  return root ? { root } : tree;
}

export function setOperator(tree: EditableTree, id: string, op: OperatorType): EditableTree {
  return mapNode(tree, id, (n) => (n.type === "Operator" ? { ...n, operator_type: op } : n));
}

export function addChild(tree: EditableTree, parentId: string, child: EditableNode): EditableTree {
  return mapNode(tree, parentId, (n) =>
    n.type === "Operator" ? { ...n, children: [...n.children, child] } : n,
  );
}

/** The node becomes the sole child of a new operator that takes its place. */
export function wrap(tree: EditableTree, id: string, op: OperatorType): EditableTree {
  return mapNode(tree, id, (n) => newOperator(op, [n]));
}

/** Delete a subtree. Removing the root is a no-op. */
export function remove(tree: EditableTree, id: string): EditableTree {
  if (tree.root.id === id) return tree;
  return mapNode(tree, id, () => undefined);
}

export function reorder(tree: EditableTree, parentId: string, from: number, to: number): EditableTree {
  return mapNode(tree, parentId, (n) => {
    if (n.type !== "Operator") return n;
    if (from < 0 || from >= n.children.length || to < 0 || to >= n.children.length) return n;
    const children = [...n.children];
    const [moved] = children.splice(from, 1);
    children.splice(to, 0, moved);
    return { ...n, children };
  });
}

/** Of `ids`, only those without a selected ancestor, in document order. */
export function topmostIds(tree: EditableTree, ids: ReadonlySet<string>): string[] {
  const top: string[] = [];
  const walk = (n: EditableNode) => {
    if (ids.has(n.id)) {
      top.push(n.id);
      return;
    }
    if (n.type === "Operator") n.children.forEach(walk);
  };
  walk(tree.root);
  return top;
}

/** Re-parent disjoint (topmost) subtrees under `parentId` at `index` (clamped), keeping their order. */
export function moveSubtrees(
  tree: EditableTree,
  ids: string[],
  parentId: string,
  index: number,
): EditableTree {
  if (ids.length === 0) return tree;
  if (findNode(tree, parentId)?.type !== "Operator") return tree;
  const nodes: EditableNode[] = [];
  for (const id of ids) {
    if (tree.root.id === id) return tree;
    const node = findNode(tree, id);
    if (!node || subtreeIds(node).has(parentId)) return tree;
    nodes.push(node);
  }
  let without = tree;
  for (const id of ids) without = mapNode(without, id, () => undefined);
  return mapNode(without, parentId, (p) => {
    if (p.type !== "Operator") return p;
    const children = [...p.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, ...nodes);
    return { ...p, children };
  });
}

/** Wrap several children of one parent in a new operator that takes the first one's place; `ids` must be topmost. */
export function groupNodes(tree: EditableTree, ids: string[], op: OperatorType): EditableTree {
  if (ids.length === 0) return tree;
  const picked = new Set(ids);
  const parent = parentOf(tree, ids[0]);
  if (parent?.type !== "Operator") return tree;
  for (const id of ids) if (parentOf(tree, id) !== parent) return tree;
  return mapNode(tree, parent.id, (p) => {
    if (p.type !== "Operator") return p;
    const grouped = p.children.filter((c) => picked.has(c.id));
    const children = p.children.flatMap((c) =>
      c.id === grouped[0].id ? [newOperator(op, grouped)] : picked.has(c.id) ? [] : [c],
    );
    return { ...p, children };
  });
}

/** Deep copy with fresh ids on every node. */
export function cloneWithNewIds(node: EditableNode): EditableNode {
  return node.type === "Operator"
    ? { ...node, id: uid(), children: node.children.map(cloneWithNewIds) }
    : { ...node, id: uid() };
}

/** Insert fresh-id copies of several subtrees under `parentId` at `index` (clamped), in order. */
export function copySubtrees(
  tree: EditableTree,
  ids: string[],
  parentId: string,
  index: number,
): EditableTree {
  const copies: EditableNode[] = [];
  for (const id of ids) {
    const node = findNode(tree, id);
    if (!node) return tree;
    copies.push(cloneWithNewIds(node));
  }
  if (copies.length === 0) return tree;
  return mapNode(tree, parentId, (p) => {
    if (p.type !== "Operator") return p;
    const children = [...p.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, ...copies);
    return { ...p, children };
  });
}

export function setLabel(tree: EditableTree, id: string, value: string): EditableTree {
  return mapNode(tree, id, (n) =>
    n.type === "Leaf" ? { ...n, activity_label: { type: "Activity", value } } : n,
  );
}

/** Toggle a leaf between a silent (tau) and a named activity. */
export function setTau(tree: EditableTree, id: string, silent: boolean): EditableTree {
  return mapNode(tree, id, (n) => {
    if (n.type !== "Leaf") return n;
    if (silent) return { ...n, activity_label: { type: "Tau" } };
    if (n.activity_label.type === "Activity") return n;
    return { ...n, activity_label: { type: "Activity", value: "" } };
  });
}

/** Mirrors the Rust `Node::check_children_valid`. */
function nodeChildrenValid(n: EditableNode | PTNode): boolean {
  if (n.type !== "Operator") return true;
  return n.operator_type === "Loop" ? n.children.length >= 2 : n.children.length > 0;
}

/** Ids of every node breaking the child-count rule. */
export function invalidNodes(tree: EditableTree): Set<string> {
  const bad = new Set<string>();
  const walk = (n: EditableNode) => {
    if (!nodeChildrenValid(n)) bad.add(n.id);
    if (n.type === "Operator") n.children.forEach(walk);
  };
  walk(tree.root);
  return bad;
}

/** Mirrors the Rust `ProcessTree::is_valid`. */
export function isValid(tree: EditableTree): boolean {
  return invalidNodes(tree).size === 0;
}
