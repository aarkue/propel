import { Button } from "@r4pm/components/ui";
import {
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type EdgeTypes,
  Handle,
  type Node,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type CSSProperties, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PiArrowsOut } from "react-icons/pi";
import { useIsDarkMode } from "../viewer/dark-mode";
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import { type ColorResolver, colorForKey, useViewerConfig } from "../viewer/viewer-config";
import { modelSvg, type VizTransport } from "../viz";
import type { Point } from "../viz/types";
import {
  DIMMED_EDGE_OPACITY,
  DIMMED_NODE_OPACITY,
  type IndexedTypeGraph,
  type LaidTypeGraph,
  layoutTypeGraph,
  pointAlong,
  roundedPath,
  toTypeGraph,
  typeGraphOverrides,
} from "./type-graph";

// Above this many visible nodes, warn + cap (top-count first) instead of silently dropping.
const VISIBLE_CAP = 60;
const EDGE_WIDTH = 1.6;
const EDGE_COLOR = "var(--gray-11)";

export interface OcelTypeGraphNode {
  id: string;
  label: string;
  kind: "event" | "object";
  count?: number;
}

/** A qualified relation between two types. One from an object type is drawn as O2O (dashed), one
 *  from an event type as E2O. */
export interface OcelTypeGraphEdge {
  id: string;
  source: string;
  target: string;
  qualifier?: string;
}

export interface OcelTypeGraphProps {
  nodes: OcelTypeGraphNode[];
  edges: OcelTypeGraphEdge[];
  /** Ring color around a node (host-driven; e.g. path-schema source/target). */
  nodeRingColor?: (id: string) => string | undefined;
  /** Fade a node (host-driven; e.g. off-schema). */
  nodeDimmed?: (id: string) => boolean;
  /** Per-edge styling override (host-driven; e.g. schema highlight). */
  edgeStyle?: (id: string) => { color?: string; width?: number; dimmed?: boolean } | undefined;
  onNodeClick?: (id: string) => void;
  onEdgeClick?: (id: string) => void;
  /** Host-controlled visible node subset (scope). Omit to show all. Pair with a `TypeScopeSelector`. */
  visibleNodeIds?: Iterable<string>;
  /** Shared color resolver (`(scope, key) => hex`); defaults to the ViewerConfig / deterministic
   *  palette, so node colors match the app's other viewers. */
  colorOf?: ColorResolver;
  /** rust4pm's visualization, for the layout and the image export. Defaults to `ViewerConfig.viz`.
   *  Without one the event types sit in a row above the object types and there is no vector export. */
  viz?: VizTransport;
  className?: string;
}

const HIDDEN_HANDLE: CSSProperties = {
  width: 0,
  height: 0,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  background: "transparent",
};

interface TypeNodeData {
  label: string;
  kind: "event" | "object";
  count?: number;
  color: string;
  ring?: string;
  width: number;
  height: number;
  [key: string]: unknown;
}

/** A type as rust4pm draws it: a tinted box (event type) or pill (object type) in the type's color,
 *  with the count under the name. */
function TypeNode({ data }: { data: TypeNodeData }) {
  return (
    <div
      title={data.label}
      style={{
        backgroundColor: `color-mix(in srgb, ${data.color} 15%, Canvas)`,
        color: `color-mix(in srgb, ${data.color} 75%, CanvasText)`,
        border: `2px solid color-mix(in srgb, ${data.color} 80%, transparent)`,
        borderRadius: data.kind === "event" ? 6 : data.height / 2,
        padding: "0 10px",
        boxSizing: "border-box",
        width: data.width,
        height: data.height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        boxShadow: data.ring ? `0 0 0 4px ${data.ring}` : "none",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
      <span
        style={{
          maxWidth: "100%",
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: "15px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {data.label}
      </span>
      {data.count != null && (
        <span style={{ fontSize: 9.5, fontWeight: 700, lineHeight: "12px" }}>
          {data.count.toLocaleString("en")}
        </span>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { typeNode: TypeNode };

interface TypeEdgeData {
  /** The layout's route, border to border, source first. */
  points: Point[];
  labelAt?: Point;
  label?: string;
  color: string;
  width: number;
  opacity: number;
  o2o: boolean;
  [key: string]: unknown;
}

function TypeEdge({ data }: EdgeProps<Edge<TypeEdgeData>>) {
  // Edge `id` can contain chars that break an SVG id/url() fragment; derive a sanitized id instead.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!data || data.points.length < 2) return null;
  const markerId = `otg-arrow-${uid}`;
  const path = roundedPath(data.points, 4);
  const ms = Math.max(12, 2.5 * data.width);
  return (
    <>
      {/* color is set here so currentColor resolves inside the marker. A var() on marker content won't resolve. */}
      <g opacity={data.opacity} style={{ color: data.color }}>
        <defs>
          <marker
            id={markerId}
            markerWidth={ms}
            markerHeight={ms}
            viewBox="0 0 12 12"
            refX={11}
            refY={6}
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d="M 1,1 L 11,6 L 1,11 Z"
              fill="currentColor"
              stroke="currentColor"
              strokeLinejoin="round"
            />
          </marker>
        </defs>
        <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
        <path
          d={path}
          style={{
            fill: "none",
            stroke: data.color,
            strokeWidth: data.width,
            strokeDasharray: data.o2o ? "6 3" : undefined,
          }}
          markerEnd={`url(#${markerId})`}
        />
      </g>
      {data.label && data.labelAt && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${data.labelAt.x}px, ${data.labelAt.y}px)`,
              padding: "0 2px",
              borderRadius: 2,
              background: "var(--color-panel-solid)",
              color: "var(--gray-12)",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              fontSize: 10.5,
              lineHeight: "14px",
              whiteSpace: "nowrap",
              opacity: data.opacity,
              pointerEvents: "none",
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = { typeEdge: TypeEdge };

const scopeOf = (kind: "event" | "object") => (kind === "event" ? "activity" : "objectType");

function OcelTypeGraphInner({
  nodes,
  edges,
  nodeRingColor,
  nodeDimmed,
  edgeStyle,
  onNodeClick,
  onEdgeClick,
  colorOf,
  viz,
  visibleNodeIds,
}: OcelTypeGraphProps) {
  const { fitView } = useReactFlow();
  const cfg = useViewerConfig({ colorOf, viz });
  const isDark = useIsDarkMode();
  const colorFor = useCallback(
    (kind: "event" | "object", label: string): string =>
      cfg.colorOf?.(scopeOf(kind), label) ?? colorForKey(scopeOf(kind), label) ?? "#6366f1",
    [cfg.colorOf],
  );
  const [shown, setShown] = useState<{ indexed: IndexedTypeGraph; laid: LaidTypeGraph } | null>(null);

  const allIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const scopeSet = useMemo(() => (visibleNodeIds ? new Set(visibleNodeIds) : null), [visibleNodeIds]);

  // Visible set: the host-controlled scope (or all); capped (top-count) with a warning.
  const { visibleIds, capped } = useMemo(() => {
    let ids = (scopeSet ? [...scopeSet] : allIds).filter((id) => nodeById.has(id));
    let capped = false;
    if (ids.length > VISIBLE_CAP) {
      capped = true;
      ids = [...ids]
        .sort((a, b) => (nodeById.get(b)?.count ?? 0) - (nodeById.get(a)?.count ?? 0))
        .slice(0, VISIBLE_CAP);
    }
    return { visibleIds: new Set(ids), capped };
  }, [scopeSet, allIds, nodeById]);

  // In the order of `nodes`, so the same scope gives the same graph whatever order it was picked in.
  const indexed = useMemo(
    () =>
      toTypeGraph(
        nodes.filter((n) => visibleIds.has(n.id)),
        edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
      ),
    [nodes, edges, visibleIds],
  );
  const graphKey = useMemo(() => JSON.stringify(indexed), [indexed]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: graphKey captures the visible graph; relayout only when it changes.
  useEffect(() => {
    if (indexed.graph.nodes.length === 0) {
      setShown(null);
      return;
    }
    let cancelled = false;
    layoutTypeGraph(cfg.viz, indexed.graph, cfg.routing)
      .then((laid) => {
        if (!cancelled) setShown({ indexed, laid });
      })
      .catch((e) => console.error("[ocel-type-graph] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [graphKey, cfg.viz, cfg.routing]);

  const rfNodes: Node[] = useMemo(() => {
    if (!shown) return [];
    const { indexed, laid } = shown;
    return laid.nodes.map((i, k) => {
      const id = indexed.nodeIds[i];
      const n = indexed.graph.nodes[i];
      const { center, size } = laid.layout.nodes[k];
      return {
        id,
        type: "typeNode",
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        data: {
          label: n.label,
          kind: n.kind,
          count: n.count ?? undefined,
          color: colorFor(n.kind, n.label),
          ring: nodeRingColor?.(id),
          width: size.width,
          height: size.height,
        } satisfies TypeNodeData,
        width: size.width,
        height: size.height,
        style: { opacity: nodeDimmed?.(id) ? DIMMED_NODE_OPACITY : 1 },
      };
    });
  }, [shown, nodeRingColor, nodeDimmed, colorFor]);

  const rfEdges: Edge<TypeEdgeData>[] = useMemo(() => {
    if (!shown) return [];
    const { indexed, laid } = shown;
    return laid.edges.map((e, k) => {
      const id = indexed.edgeIds[e];
      const edge = indexed.graph.edges[e];
      const route = laid.layout.edges[k];
      const override = edgeStyle?.(id);
      return {
        id,
        source: indexed.nodeIds[edge.source],
        target: indexed.nodeIds[edge.target],
        type: "typeEdge",
        data: {
          points: route.points,
          labelAt: route.label_anchor ?? pointAlong(route.points, 0.5),
          label: edge.qualifier ?? undefined,
          color: override?.color ?? EDGE_COLOR,
          width: override?.width ?? EDGE_WIDTH,
          opacity: override?.dimmed ? DIMMED_EDGE_OPACITY : 1,
          o2o: indexed.graph.nodes[edge.source].kind === "object",
        },
      };
    });
  }, [shown, edgeStyle]);

  // rust4pm's drawing over the shown layout, with the host styling as overrides. Behind a ref so
  // the registered source stays stable.
  const toSvg = async (): Promise<string | null> => {
    if (!shown || !cfg.viz) return null;
    const { indexed, laid } = shown;
    const typeOf = new Map(indexed.nodeIds.map((id, i) => [id, indexed.graph.nodes[i]]));
    const overrides = typeGraphOverrides(indexed, laid, {
      colorOf: (id) => {
        const n = typeOf.get(id);
        if (!n) return undefined;
        const color = colorFor(n.kind, n.label);
        return color === colorForKey(scopeOf(n.kind), n.label) ? undefined : color;
      },
      ringOf: nodeRingColor,
      dimmed: nodeDimmed,
      edgeStyle,
    });
    return modelSvg(cfg.viz, "oc_type_graph", indexed.graph, laid.layout, { overrides });
  };
  const toSvgRef = useRef(toSvg);
  toSvgRef.current = toSvg;
  const exportSource = useMemo<VectorExportSource>(
    () => ({ label: "OCEL type graph", toSvg: () => toSvgRef.current() }),
    [],
  );
  useRegisterExport("ocel-type-graph", exportSource);

  // Refit only when a new layout lands (structure change), not on pan/zoom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fit only when a new layout lands.
  useEffect(() => {
    if (shown && rfNodes.length > 0) {
      requestAnimationFrame(() => fitView({ padding: 0.15 }));
    }
  }, [shown]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          zIndex: 5,
          top: 8,
          left: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Button size="1" variant="soft" onClick={() => fitView({ padding: 0.15 })} title="Fit view">
          <PiArrowsOut />
        </Button>
        {capped && (
          <span style={{ fontSize: 11, color: "var(--amber-11)" }}>
            showing top {VISIBLE_CAP} — refine scope
          </span>
        )}
      </div>
      <ReactFlow
        colorMode={isDark ? "dark" : "light"}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_e, node) => onNodeClick?.(node.id)}
        onEdgeClick={(_e, edge) => onEdgeClick?.(edge.id)}
        minZoom={0.1}
        maxZoom={3}
        panOnScroll
        selectionOnDrag={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

/** Generic, view-only OCEL type-graph viewer with built-in search, scope filtering, and fit; highlighting/selection is host-driven. */
export function OcelTypeGraph(props: OcelTypeGraphProps) {
  return (
    <ReactFlowProvider>
      <OcelTypeGraphInner {...props} />
    </ReactFlowProvider>
  );
}
