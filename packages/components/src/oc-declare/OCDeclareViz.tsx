import {
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH, ActivityNode } from "./ActivityNode";
import { ConstraintEdge } from "./ConstraintEdge";
import { computeElkLayout } from "./elkLayout";
import type { ActivityNodeData, ConstraintEdgeData, RawConstraint } from "./types";
import { type ColorResolver, VizProvider } from "./VizContext";

export interface OCDeclareVizProps {
  constraints: RawConstraint[];
  /** Resolver for activity colors (usually backed by the host app's persisted color store). */
  activityColor: ColorResolver;
  /** Resolver for object-type colors (same store by convention). */
  objectTypeColor: ColorResolver;
  /**
   * Per-activity object-type involvement counts from the OCEL, used to
   * render the dot strip on each activity node. Shape matches the backend
   * `get_ocel_activity_object_involvements` result.
   */
  activityInvolvements?: {
    [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
  };
  /** Event-type occurrence counts from the OCEL (activity -> count). */
  eventTypeCounts?: Record<string, number>;
  hiddenArcTypes?: Set<string>;
  hiddenObjectTypes?: Set<string>;
  className?: string;
  /** Optional callback when the focused node changes. */
  onFocusChange?: (id: string | null) => void;
  /** Layout direction. Defaults to "RIGHT" (horizontal, temporal
   *  sequence reads left-to-right). "DOWN" produces a vertical layout
   *  that fits narrow, page-shaped surfaces. */
  direction?: "RIGHT" | "DOWN";
}

/** Imperative handle for the viz: exposes current laid-out nodes/edges for export. */
export interface OCDeclareVizHandle {
  getLayoutedNodes: () => Node<ActivityNodeData, "activity">[];
  getLayoutedEdges: () => Edge<ConstraintEdgeData, "constraint">[];
}

const NODE_TYPES = { activity: ActivityNode };
const EDGE_TYPES = { constraint: ConstraintEdge };

type InvolvementsMap = {
  [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
};

/**
 * Convert the backend involvements map into the node-data shape, sorted by
 * object-type name for stable rendering.
 */
function buildActivityObjectTypes(
  involvements: InvolvementsMap | undefined,
  activity: string,
): { name: string; min: number; max: number }[] {
  const perType = involvements?.[activity];
  if (!perType) return [];
  const out: { name: string; min: number; max: number }[] = [];
  for (const [name, c] of Object.entries(perType)) {
    if (!c || c.max <= 0) continue;
    out.push({ name, min: c.min, max: c.max });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Group edges between the same (source, target) pair so parallel arcs can be spread. */
function bundleEdges(edges: Edge[]): Edge[] {
  const keyOf = (e: Edge) => `${e.source}|${e.target}`;
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = keyOf(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)?.push(e);
  }
  const result: Edge[] = [];
  for (const group of groups.values()) {
    group.forEach((e, i) => {
      const data = e.data as ConstraintEdgeData;
      result.push({
        ...e,
        data: { ...data, bundleIndex: i, bundleTotal: group.length },
      });
    });
  }
  return result;
}

const OCDeclareVizInner = forwardRef<OCDeclareVizHandle, OCDeclareVizProps>(function OCDeclareVizInner(
  {
    constraints,
    activityColor,
    objectTypeColor,
    activityInvolvements,
    eventTypeCounts = {},
    hiddenArcTypes = new Set(),
    hiddenObjectTypes = new Set(),
    onFocusChange,
    direction = "RIGHT",
  },
  ref,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ActivityNodeData, "activity">>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ConstraintEdgeData, "constraint">>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  useImperativeHandle(
    ref,
    () => ({
      getLayoutedNodes: () => nodes,
      getLayoutedEdges: () => edges,
    }),
    [nodes, edges],
  );

  // Rebuild nodes + edges whenever the constraint set changes, then run ELK.
  useEffect(() => {
    const activities = Array.from(new Set(constraints.flatMap((c) => [c.from, c.to]))).sort();
    const initNodes: Node<ActivityNodeData, "activity">[] = activities.map((act) => ({
      id: act,
      type: "activity",
      position: { x: 0, y: 0 },
      data: {
        label: act,
        objectTypes: buildActivityObjectTypes(activityInvolvements, act),
      },
    }));
    const initEdges: Edge<ConstraintEdgeData, "constraint">[] = constraints.map((c, i) => ({
      id: `oc-c${i}`,
      source: c.from,
      target: c.to,
      type: "constraint",
      data: {
        arcType: c.arc_type,
        counts: c.counts,
        label: c.label,
        bundleIndex: 0,
        bundleTotal: 1,
        constraintIndex: i,
      },
    }));
    const bundled = bundleEdges(initEdges);

    let cancelled = false;
    computeElkLayout(initNodes, bundled, { direction }).then((r) => {
      if (cancelled) return;
      setNodes(r.nodes);
      setEdges(r.edges as Edge<ConstraintEdgeData, "constraint">[]);
      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    });
    return () => {
      cancelled = true;
    };
  }, [constraints, activityInvolvements, direction, setNodes, setEdges, fitView]);

  const ctxValue = useMemo(
    () => ({
      activityColor,
      objectTypeColor,
      hiddenArcTypes,
      hiddenObjectTypes,
      focusedNodeId,
      hoveredNodeId,
      eventTypeCounts,
    }),
    [
      activityColor,
      objectTypeColor,
      hiddenArcTypes,
      hiddenObjectTypes,
      focusedNodeId,
      hoveredNodeId,
      eventTypeCounts,
    ],
  );

  return (
    <VizProvider value={ctxValue}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          const next = focusedNodeId === node.id ? null : node.id;
          setFocusedNodeId(next);
          onFocusChange?.(next);
        }}
        onPaneClick={() => {
          setFocusedNodeId(null);
          onFocusChange?.(null);
        }}
        onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        proOptions={{ hideAttribution: true }}
      />
    </VizProvider>
  );
});

export const OCDeclareViz = forwardRef<OCDeclareVizHandle, OCDeclareVizProps>(
  function OCDeclareViz(props, ref) {
    return (
      <div
        className={`oc-declare-viz-root ${props.className ?? "w-full h-full"}`}
        style={{
          minHeight: ACT_NODE_HEIGHT + 20,
          minWidth: ACT_NODE_WIDTH + 20,
        }}
      >
        <ReactFlowProvider>
          <OCDeclareVizInner ref={ref} {...props} />
        </ReactFlowProvider>
      </div>
    );
  },
);
