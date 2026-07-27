import type { Edge, Node, XYPosition } from "@xyflow/react";
import {
  Controls,
  type NodeOrigin,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { StyledGraphRenderer } from "../../graph-svg/styled-graph";
import { useRegisterExport, type VectorExportSource } from "../../viewer/export";
import { useViewerConfig } from "../../viewer/viewer-config";
import {
  copySubtrees,
  type EditableTree,
  findNode,
  groupNodes,
  type LeafLabel,
  moveSubtrees,
  OPERATOR_SYMBOL,
  OPERATOR_TITLE,
  OPERATOR_TYPES,
  type OperatorType,
  parentOf,
  type ProcessTree,
  remove,
  reorder,
  subtreeIds,
  toEditable,
  topmostIds,
  toProcessTree,
} from "../tree";
import "./editor.css";
import { useProcessTreeLayout } from "./helpers/layout-context";
import { OPERATOR_SIZE, type ProcessTreeLayoutFn } from "./helpers/layout-graph";
import { treeToNodes } from "./helpers/serialize";
import { treeModelToStyledGraph } from "./helpers/tree-styled-graph";
import LeafNode from "./LeafNode";
import OperatorNode from "./OperatorNode";
import TreeEdge from "./TreeEdge";

const nodeTypes = { operator: OperatorNode, leaf: LeafNode };
const edgeTypes = { tree: TreeEdge };
const nodeOrigin: NodeOrigin = [0.5, 0.5];

export type OperatorData = {
  operator_type: OperatorType;
  /** Breaks the child-count rule (Loop needs >= 2 children, others >= 1). Badged, not blocked. */
  invalid?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
};

export type LeafData = {
  activity_label: LeafLabel;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
};

export type ProcessTreeNode =
  | (Node<OperatorData> & { type: "operator" })
  | (Node<LeafData> & { type: "leaf" });

export type TreeNodePresentation = {
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
};

export type TreeEditorProps = {
  /** The tree to show, in the engine's wire shape (no node ids). */
  tree: ProcessTree;
  readOnly?: boolean;
  /** Turn on editing (operator type, add/wrap/delete, rename, reorder). `readOnly` still wins. */
  editable?: boolean;
  /** Fired on every structural edit with the new tree. */
  onChange?: (tree: ProcessTree) => void;
  /** Replace the layout from `ViewerConfig.layout.processTree`. */
  layoutOverride?: ProcessTreeLayoutFn;
  /** Cosmetics merged over a node's data at render time. */
  nodeOverlay?: (id: string, data: OperatorData | LeafData) => TreeNodePresentation | undefined;
  /** Defaults to `ViewerConfig.layout.renderSvg`. Without either there is no vector export. */
  renderSvg?: StyledGraphRenderer;
  /** Override to avoid a collision when several trees share one export frame. */
  exportKey?: string;
  children?: React.ReactNode;
  className?: string;
};

type EditorCtx = {
  readOnly: boolean;
  apply: (fn: (t: EditableTree) => EditableTree) => void;
  nodeOverlay?: TreeEditorProps["nodeOverlay"];
  /** Operator a dragged subtree currently hovers, so it can render its drop ring. */
  dropTarget: string | null;
  /** More than one subtree selected: per-node toolbars yield to the multi-selection toolbar. */
  multiSelect: boolean;
};

const TreeEditorContext = createContext<EditorCtx>({
  readOnly: true,
  apply: () => {},
  dropTarget: null,
  multiSelect: false,
});

function isCopyGesture(event: MouseEvent | TouchEvent): boolean {
  return "ctrlKey" in event && (event.ctrlKey || event.altKey);
}

export function useTreeEditor(): EditorCtx {
  return useContext(TreeEditorContext);
}

function InnerEditor(props: TreeEditorProps & { readOnly: boolean }) {
  const [tree, setTree] = useState<EditableTree>(() => toEditable(props.tree));
  const [nodes, setNodes, onNodesChange] = useNodesState<ProcessTreeNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Skip the tree we just emitted: re-seeding would re-assign every node id mid-edit.
  const lastEmitted = useRef<ProcessTree | null>(null);
  useEffect(() => {
    if (props.tree === lastEmitted.current) return;
    setTree(toEditable(props.tree));
  }, [props.tree]);

  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;
  const apply = useCallback((fn: (t: EditableTree) => EditableTree) => {
    setTree((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      const wire = toProcessTree(next);
      lastEmitted.current = wire;
      onChangeRef.current?.(wire);
      return next;
    });
  }, []);

  // Roots of the dragged subtrees plus every id inside them (excluded as drop targets).
  const dragRef = useRef<{ roots: string[]; ids: Set<string> } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const [copyDrag, setCopyDrag] = useState(false);

  const selectedIds = useMemo(() => new Set(nodes.filter((n) => n.selected).map((n) => n.id)), [nodes]);
  const multiTop = useMemo(
    () => (selectedIds.size > 1 ? topmostIds(tree, selectedIds) : []),
    [tree, selectedIds],
  );
  const multiSelect = multiTop.length > 1;
  const groupParent = multiSelect ? parentOf(tree, multiTop[0]) : undefined;
  const groupable = groupParent !== undefined && multiTop.every((id) => parentOf(tree, id) === groupParent);

  const ctx = useMemo<EditorCtx>(
    () => ({ readOnly: props.readOnly, apply, nodeOverlay: props.nodeOverlay, dropTarget, multiSelect }),
    [props.readOnly, apply, props.nodeOverlay, dropTarget, multiSelect],
  );

  const contextLayout = useProcessTreeLayout();
  const layoutFn = props.layoutOverride ?? contextLayout;

  // Read through refs at export time so the registered source stays stable across edits.
  const cfg = useViewerConfig({});
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const renderSvgRef = useRef<StyledGraphRenderer | undefined>(undefined);
  renderSvgRef.current = props.renderSvg ?? cfg.layout?.renderSvg;
  const exportSource = useMemo<VectorExportSource>(
    () => ({
      toSvg: async () => {
        const render = renderSvgRef.current;
        if (!render) return null;
        const graph = treeModelToStyledGraph(nodesRef.current, edgesRef.current);
        return graph ? render(graph) : null;
      },
    }),
    [],
  );
  useRegisterExport(props.exportKey ?? "process-tree", exportSource);

  // Selection lives on the node, which every edit re-derives, so carry it across or an edit closes
  // the toolbar of the node being worked on.
  const selectedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedRef.current = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  }, [nodes]);

  // Where the layout put each node, so a drag that changes nothing can be undone.
  const laidOut = useRef(new Map<string, XYPosition>());

  useEffect(() => {
    let cancelled = false;
    const derived = treeToNodes(tree);
    layoutFn(derived.nodes, derived.edges).then((laid) => {
      if (cancelled) return;
      laidOut.current = new Map(laid.nodes.map((n) => [n.id, n.position]));
      setNodes(
        laid.nodes.map((n) =>
          selectedRef.current.has(n.id) ? ({ ...n, selected: true } as ProcessTreeNode) : n,
        ),
      );
      setEdges(laid.edges);
    });
    return () => {
      cancelled = true;
    };
  }, [tree, layoutFn, setNodes, setEdges]);

  // Dragging a node that is part of a multi-selection drags every selected subtree.
  const onNodeDragStart = useCallback(
    (_: unknown, dragged: Node) => {
      if (props.readOnly) return;
      const selected = selectedRef.current;
      const roots = selected.has(dragged.id) && selected.size > 1 ? topmostIds(tree, selected) : [dragged.id];
      const ids = new Set<string>();
      for (const id of roots) {
        const node = findNode(tree, id);
        if (node) for (const sub of subtreeIds(node)) ids.add(sub);
      }
      dragRef.current = ids.size > 0 ? { roots, ids } : null;
    },
    [props.readOnly, tree],
  );

  // The dragged subtrees follow the pointer; the operator under it becomes the drop target.
  const onNodeDrag = useCallback(
    (event: MouseEvent | TouchEvent, dragged: Node) => {
      const drag = dragRef.current;
      const start = laidOut.current.get(dragged.id);
      if (!drag || !start) return;
      const dx = dragged.position.x - start.x;
      const dy = dragged.position.y - start.y;
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id === dragged.id || !drag.ids.has(n.id)) return n;
          const home = laidOut.current.get(n.id);
          return home ? { ...n, position: { x: home.x + dx, y: home.y + dy } } : n;
        }),
      );
      let target: string | null = null;
      for (const other of nodesRef.current) {
        if (other.type !== "operator" || drag.ids.has(other.id)) continue;
        const at = laidOut.current.get(other.id) ?? other.position;
        if (
          Math.abs(dragged.position.x - at.x) <= OPERATOR_SIZE.width / 2 + 6 &&
          Math.abs(dragged.position.y - at.y) <= OPERATOR_SIZE.height / 2 + 6
        ) {
          target = other.id;
          break;
        }
      }
      if (target !== dropTargetRef.current) {
        dropTargetRef.current = target;
        setDropTarget(target);
      }
      setCopyDrag(target !== null && isCopyGesture(event));
    },
    [setNodes],
  );

  // Dropping on an operator moves the subtree there (Ctrl/Alt copies); a drag that reorders nothing is undone.
  const onNodeDragStop = useCallback(
    (event: MouseEvent | TouchEvent, dragged: Node) => {
      const drag = dragRef.current;
      dragRef.current = null;
      const target = dropTargetRef.current;
      dropTargetRef.current = null;
      setDropTarget(null);
      setCopyDrag(false);
      if (props.readOnly) return;
      if (drag && target) {
        const parent = findNode(tree, target);
        const index =
          parent?.type === "Operator"
            ? parent.children
                .filter((c) => !drag.ids.has(c.id))
                .filter((c) => (laidOut.current.get(c.id)?.x ?? 0) < dragged.position.x).length
            : 0;
        const copy = isCopyGesture(event);
        apply((t) =>
          copy ? copySubtrees(t, drag.roots, target, index) : moveSubtrees(t, drag.roots, target, index),
        );
        return;
      }
      const parent = parentOf(tree, dragged.id);
      const siblings = parent?.type === "Operator" ? parent.children : undefined;
      const from = siblings?.findIndex((c) => c.id === dragged.id) ?? -1;
      if (parent && siblings && from >= 0) {
        const to = siblings
          .filter((c) => c.id !== dragged.id)
          .filter((c) => (laidOut.current.get(c.id)?.x ?? 0) < dragged.position.x).length;
        if (to !== from) {
          apply((t) => reorder(t, parent.id, from, to));
          return;
        }
      }
      setNodes((ns) => ns.map((n) => ({ ...n, position: laidOut.current.get(n.id) ?? n.position })));
    },
    [apply, props.readOnly, setNodes, tree],
  );

  return (
    <TreeEditorContext.Provider value={ctx}>
      <div
        className={`process-tree-editor ${copyDrag ? "pt-copy-drag" : ""} ${props.className ?? ""}`}
        style={{ width: "100%", height: "100%" }}
      >
        <ReactFlow<ProcessTreeNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodeOrigin={nodeOrigin}
          nodesDraggable={!props.readOnly}
          nodesConnectable={false}
          // Shift adds to the selection (click or box); Ctrl stays free as the copy-drop modifier.
          multiSelectionKeyCode="Shift"
          edgesFocusable={false}
          onBeforeDelete={async () => false}
          proOptions={{ hideAttribution: true }}
          fitView
          // Headroom for the selected node's toolbar, which renders above the node in screen space
          // and would otherwise be clipped for the root.
          fitViewOptions={{ padding: 0.2 }}
        >
          <Controls showInteractive={false} />
          {props.children}
        </ReactFlow>
        {!props.readOnly && multiSelect && (
          <div className="pt-toolbar pt-multi-toolbar">
            <span className="pt-multi-label">{multiTop.length} selected</span>
            <span className="pt-multi-label">Group into</span>
            {OPERATOR_TYPES.map((op) => (
              <button
                key={op}
                type="button"
                disabled={!groupable}
                title={groupable ? `Group into ${OPERATOR_TITLE[op]}` : "Only siblings can be grouped"}
                onClick={() => apply((t) => groupNodes(t, multiTop, op))}
              >
                {OPERATOR_SYMBOL[op]}
              </button>
            ))}
            <button
              type="button"
              className="pt-danger"
              title="Delete selected subtrees"
              onClick={() => apply((t) => multiTop.reduce((acc, id) => remove(acc, id), t))}
            >
              ✕ Delete
            </button>
          </div>
        )}
      </div>
    </TreeEditorContext.Provider>
  );
}

/** A process tree editor. The tree is the state; the layout is derived from its structure. */
export default function Editor(props: TreeEditorProps) {
  return (
    <ReactFlowProvider>
      <InnerEditor {...props} readOnly={props.readOnly ?? !props.editable} />
    </ReactFlowProvider>
  );
}
