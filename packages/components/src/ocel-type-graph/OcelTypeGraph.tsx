import { Button } from "@r4pm/components/ui";
import {
  Background,
  type Edge,
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
import { softBadgeStyle } from "../dfg/util/colors";
import { styledGraphToSvg } from "../graph-svg/styled-graph-svg";
import { useIsDarkMode } from "../viewer/dark-mode";
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import { type ColorResolver, colorForKey, useViewerConfig } from "../viewer/viewer-config";
import { type LayoutEdge, type LayoutNode, type LayoutResult, layoutTypeGraph } from "./elk-layout";
import {
  ocelTypeGraphToStyledGraph,
  type StyledTypeGraphEdge,
  type StyledTypeGraphNode,
} from "./styled-graph";

/** Layout contract: node positions + routed edge paths; host can inject a rust/wasm-backed impl over the bundled ELK default. */
export type TypeGraphLayoutFn = (nodes: LayoutNode[], edges: LayoutEdge[]) => Promise<LayoutResult>;

const NODE_WIDTH = 150;
const NODE_HEIGHT = 40;
// Above this many visible nodes, warn + cap (top-count first) instead of silently dropping.
const VISIBLE_CAP = 60;

export interface OcelTypeGraphNode {
  id: string;
  label: string;
  kind: "event" | "object";
  count?: number;
}

export interface OcelTypeGraphEdge {
  id: string;
  source: string;
  target: string;
  qualifier?: string;
  kind?: "e2o" | "o2o";
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
  /** Layout engine. Defaults to the bundled ELK layout; inject a rust/wasm-backed fn to override. */
  layout?: TypeGraphLayoutFn;
  /** Shared color resolver (`(scope, key) => hex`); defaults to the ViewerConfig / deterministic
   *  palette, so node colors match the app's other viewers. */
  colorOf?: ColorResolver;
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
  [key: string]: unknown;
}

function TypeNode({ data }: { data: TypeNodeData }) {
  const isEvent = data.kind === "event";
  const soft = softBadgeStyle(data.color);
  return (
    <div
      title={data.label}
      style={{
        ...soft,
        border: `2.5px solid color-mix(in srgb, ${data.color} 45%, transparent)`,
        borderRadius: isEvent ? 6 : 999,
        padding: "6px 13px",
        boxSizing: "border-box",
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 7,
        justifyContent: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        boxShadow: data.ring ? `0 0 0 4px ${data.ring}` : "none",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} />
      <div className="flex flex-col w-full items-center">
        <div className="flex w-fit max-w-full items-center gap-x-1">
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: isEvent ? 1 : 999,
              background: data.color,
              flex: "0 0 auto",
            }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{data.label}</span>
        </div>
        {data.count != null && (
          <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, flex: "0 0 auto" }}>
            {data.count.toLocaleString("en")}
          </span>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { typeNode: TypeNode };

interface TypeEdgeData {
  routedPath?: string;
  label?: string;
  color: string;
  width: number;
  opacity: number;
  isO2O: boolean;
  [key: string]: unknown;
}

function TypeEdge({ data }: EdgeProps) {
  // Edge `id` can contain chars that break an SVG id/url() fragment; derive a sanitized id instead.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const markerId = `otg-arrow-${uid}`;
  const labelId = `otg-elabel-${uid}`;
  const d = data as TypeEdgeData | undefined;
  const path = d?.routedPath;
  if (!path || !d) return null;
  // Same filled arrowhead the SVG exporter draws, so on-screen and export match.
  const ms = Math.max(12, 2.5 * d.width);
  return (
    // color is set here so currentColor resolves inside the marker; a var() on marker content won't resolve.
    <g opacity={d.opacity} style={{ color: d.color }}>
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
          <path d="M 1,1 L 11,6 L 1,11 Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
        </marker>
      </defs>
      <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={path}
        style={{
          fill: "none",
          stroke: d.color,
          strokeWidth: d.width,
          strokeDasharray: d.isO2O ? "6 3" : undefined,
        }}
        markerEnd={`url(#${markerId})`}
      />
      {d.label && (
        <>
          <path id={labelId} d={path} fill="none" stroke="none" />
          <text
            dy={-5}
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            paintOrder="stroke"
            // Panel-colored halo (not white) keeps the label legible over the pane in both themes.
            style={{ fill: d.color, stroke: "var(--color-panel-solid)", strokeWidth: 3 }}
          >
            <textPath href={`#${labelId}`} startOffset="50%" textAnchor="middle">
              {d.label}
            </textPath>
          </text>
        </>
      )}
    </g>
  );
}

const edgeTypes: EdgeTypes = { typeEdge: TypeEdge };

function OcelTypeGraphInner({
  nodes,
  edges,
  nodeRingColor,
  nodeDimmed,
  edgeStyle,
  onNodeClick,
  onEdgeClick,
  layout: layoutProp,
  colorOf,
  visibleNodeIds,
}: OcelTypeGraphProps) {
  const { fitView } = useReactFlow();
  const cfg = useViewerConfig({ colorOf });
  const isDark = useIsDarkMode();
  // Explicit prop wins, else the ambient engine (Rust/wasm when a host injects it), else bundled ELK.
  const layoutFn = layoutProp ?? cfg.layout?.typeGraph ?? layoutTypeGraph;
  const colorFor = useCallback(
    (n: OcelTypeGraphNode): string => {
      const scope = n.kind === "event" ? "activity" : "objectType";
      return cfg.colorOf?.(scope, n.label) ?? colorForKey(scope, n.label) ?? "#6366f1";
    },
    [cfg.colorOf],
  );
  const [layout, setLayout] = useState<LayoutResult | null>(null);

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

  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds],
  );

  const structureKey = useMemo(
    () =>
      `${[...visibleIds].sort().join(",")}|${visibleEdges
        .map((e) => e.id)
        .sort()
        .join(",")}`,
    [visibleIds, visibleEdges],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: structureKey captures the visible structure; relayout only on structural change.
  useEffect(() => {
    if (visibleIds.size === 0) {
      setLayout(null);
      return;
    }
    const layoutNodes = [...visibleIds].map((id) => ({ id, width: NODE_WIDTH, height: NODE_HEIGHT }));
    const layoutEdges = visibleEdges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
    let cancelled = false;
    layoutFn(layoutNodes, layoutEdges).then((res) => {
      if (!cancelled) setLayout(res);
    });
    return () => {
      cancelled = true;
    };
  }, [structureKey]);

  const rfNodes: Node[] = useMemo(() => {
    if (!layout) return [];
    return [...visibleIds].map((id) => {
      const n = nodeById.get(id);
      return {
        id,
        type: "typeNode",
        position: layout.nodes.get(id) ?? { x: 0, y: 0 },
        data: {
          label: n?.label ?? id,
          kind: n?.kind ?? "object",
          count: n?.count,
          color: n ? colorFor(n) : (colorForKey("objectType", id) ?? "#6366f1"),
          ring: nodeRingColor?.(id),
        } satisfies TypeNodeData,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        style: { opacity: nodeDimmed?.(id) ? 0.35 : 1 },
      };
    });
  }, [layout, visibleIds, nodeById, nodeRingColor, nodeDimmed, colorFor]);

  const rfEdges: Edge[] = useMemo(() => {
    if (!layout) return [];
    return visibleEdges.map((e) => {
      const override = edgeStyle?.(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "typeEdge",
        data: {
          routedPath: layout.edges.get(e.id)?.path,
          label: e.qualifier,
          color: override?.color ?? "var(--gray-11)",
          width: override?.width ?? 1.6,
          opacity: override?.dimmed ? 0.3 : 1,
          isO2O: e.kind === "o2o",
        } satisfies TypeEdgeData,
      };
    });
  }, [layout, visibleEdges, edgeStyle]);

  // Rebuilds a StyledGraph from live geometry at export time; kept behind a ref so the registered source stays stable.
  const buildStyled = () => {
    if (!layout) return null;
    const sNodes: StyledTypeGraphNode[] = [...visibleIds].map((id) => {
      const n = nodeById.get(id);
      return {
        id,
        label: n?.label ?? id,
        kind: n?.kind ?? "object",
        count: n?.count,
        color: n ? colorFor(n) : (colorForKey("objectType", id) ?? "#6366f1"),
        ring: nodeRingColor?.(id),
        dimmed: nodeDimmed?.(id),
      };
    });
    const sEdges: StyledTypeGraphEdge[] = visibleEdges.map((e) => {
      const o = edgeStyle?.(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        qualifier: e.qualifier,
        isO2O: e.kind === "o2o",
        color: o?.color ?? "var(--gray-11)",
        width: o?.width ?? 1.6,
        dimmed: o?.dimmed,
      };
    });
    return ocelTypeGraphToStyledGraph(sNodes, sEdges, layout);
  };
  const toSvg = async (): Promise<string | null> => {
    const graph = buildStyled();
    if (!graph) return null;
    const render = cfg.layout?.renderSvg;
    return render ? render(graph) : styledGraphToSvg(graph);
  };
  const toSvgRef = useRef(toSvg);
  toSvgRef.current = toSvg;
  const exportSource = useMemo<VectorExportSource>(() => ({ toSvg: () => toSvgRef.current() }), []);
  useRegisterExport("ocel-type-graph", exportSource);

  // Refit only when a new layout lands (structure change), not on pan/zoom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fit only when a new layout lands.
  useEffect(() => {
    if (layout && rfNodes.length > 0) {
      requestAnimationFrame(() => fitView({ padding: 0.15 }));
    }
  }, [layout]);

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
      >
        <Background gap={20} size={0.8} color="rgba(128,128,128,0.12)" />
      </ReactFlow>
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
