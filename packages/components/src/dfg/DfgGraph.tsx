import { Card } from "@r4pm/components/ui";
import {
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ViewerAction, ViewerTarget } from "../viewer/viewer-config";
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import { applyLayoutToNodes } from "./util/auto-layout";
import { colorToHex } from "./util/colors";
import { durationColor } from "./util/duration";
import {
  type DfgArc,
  type DfgCoverage,
  type DfgMetric,
  DFG_END_ID,
  DFG_START_ID,
  OCEL_NODE_HEIGHT,
  OCEL_NODE_WIDTH,
  TERM_NODE_SIZE,
  computeMetricValue,
  formatMetricValue,
  isPerformanceMetric,
} from "./util/dfg-model";
import { DFG_EDGE_TYPES, type DfgEdgeType } from "./DfgEdge";
import DfgSettings, { metricDisplayName } from "./DfgSettings";
import { buildDfgSvgFromPanel } from "./util/svg-export";

export type { DfgArc } from "./util/dfg-model";

/** Node / edge types shared by every DFG-style panel. */
export type DfgActivityNode = Node<{ activity: string; count: number }, "activity">;
export type DfgTerminalNode = Node<{ kind: "start" | "end"; count: number }, "terminal">;
export type DfgNode = DfgActivityNode | DfgTerminalNode;

/** Context used to pass the activity-color resolver and an optional click
 *  handler into the ReactFlow node components (which can't receive arbitrary
 *  props from the parent). Decouples the node renderers from any global
 *  state context. */
interface DfgNodeContextValue {
  activityColor: (act: string) => string;
  activityForeground: (act: string) => string;
  onActivityClick?: (act: string) => void;
  onActivityContextMenu?: (act: string, e: { clientX: number; clientY: number }) => void;
}
const DfgNodeContext = createContext<DfgNodeContextValue>({
  activityColor: () => "#9ca3af",
  activityForeground: () => "#374151",
});

function ActivityNode({ data }: NodeProps<DfgActivityNode>) {
  const ctx = useContext(DfgNodeContext);
  const base = ctx.activityColor(data.activity);
  const longName = data.activity.length >= 20;
  const displayName = data.activity.length > 32 ? `${data.activity.slice(0, 31)}…` : data.activity;
  return (
    <div
      className="font-semibold border-2 rounded-lg px-2 py-1 shadow-sm flex flex-col items-center justify-center box-border overflow-hidden"
      style={{
        backgroundColor: `${base}26`,
        borderColor: `${base}cc`,
        color: "CanvasText",
        width: OCEL_NODE_WIDTH,
        height: OCEL_NODE_HEIGHT,
        cursor: ctx.onActivityClick ? "pointer" : undefined,
      }}
      title={data.activity}
      onClick={() => ctx.onActivityClick?.(data.activity)}
      onContextMenu={
        ctx.onActivityContextMenu
          ? (e) => {
              e.preventDefault();
              ctx.onActivityContextMenu?.(data.activity, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
    >
      <div
        className={`text-center leading-tight font-bold ${longName ? "text-[10px]" : "text-[12px]"}`}
        style={{
          color: ctx.activityForeground(data.activity),
          wordBreak: "break-word",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {displayName}
      </div>
      <span className="text-[10px] opacity-80 tabular-nums">{data.count.toLocaleString("en")}</span>
      <Handle
        type="source"
        position={Position.Bottom}
        id="s"
        style={{ opacity: 0 }}
        isConnectableStart={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="t"
        style={{ opacity: 0 }}
        isConnectableStart={false}
      />
    </div>
  );
}

function TerminalNode({ data }: NodeProps<DfgTerminalNode>) {
  const isStart = data.kind === "start";
  const bg = isStart ? "#a855f7" : "#ef4444";
  const title = isStart
    ? `Start: ${data.count.toLocaleString("en")}`
    : `End: ${data.count.toLocaleString("en")}`;
  return (
    <div
      title={title}
      className="relative flex items-center justify-center rounded-full shadow-sm"
      style={{ width: TERM_NODE_SIZE, height: TERM_NODE_SIZE, backgroundColor: bg }}
    >
      {isStart ? (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <polygon points="3,2 3,12 12,7" fill="#ffffff" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="0" y="0" width="12" height="12" rx="1" fill="#ffffff" />
        </svg>
      )}
      {isStart ? (
        <Handle
          className="customHandle"
          position={Position.Bottom}
          type="source"
          isConnectableStart={false}
          style={{ opacity: 0 }}
        />
      ) : (
        <Handle
          className="customHandle"
          position={Position.Top}
          type="target"
          isConnectableStart={false}
          style={{ opacity: 0 }}
        />
      )}
    </div>
  );
}

/** Node type registry shared by every DFG-style panel. */
export const DFG_NODE_TYPES = { activity: ActivityNode, terminal: TerminalNode };

export interface UseDfgPanelReturn {
  attachRef: (instance: unknown) => void;
  edgeSlider: number;
  setEdgeSlider: (v: number | ((prev: number) => number)) => void;
  coverage: DfgCoverage;
  selection: {
    filteredArcs: DfgArc[];
    keptActivities: Set<string>;
  };
  getLayoutedNodes: () => DfgNode[] | null;
  getLayoutedEdges: () => DfgEdgeType[] | null;
}

interface LayoutedNodeMinimal {
  id: string;
  position: { x: number; y: number };
  type?: string;
}

function edgeLabelMidpoint(
  edge: DfgEdgeType,
  nodeById: Map<string, LayoutedNodeMinimal>,
  nodeSize: (n: LayoutedNodeMinimal) => { w: number; h: number },
): { x: number; y: number } | null {
  const src = nodeById.get(edge.source);
  const tgt = nodeById.get(edge.target);
  if (!src || !tgt) return null;

  const { w: srcW, h: srcH } = nodeSize(src);
  const { w: tgtW } = nodeSize(tgt);

  if (edge.source === edge.target) {
    const pIdx = edge.data?.parallelIndex ?? 0;
    const loopW = 36 + pIdx * 24;
    return {
      x: src.position.x + srcW + loopW * 0.75,
      y: src.position.y + srcH / 2,
    };
  }

  const routing = edge.data?.routing;
  if (routing?.kind === "polyline" && routing.points.length >= 2) {
    const pts = routing.points;
    const isCubicChain = (pts.length - 1) % 3 === 0 && pts.length >= 4;
    const anchors = isCubicChain ? pts.filter((_, i) => i % 3 === 0) : pts;
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const dx = anchors[i].x - anchors[i - 1].x;
      const dy = anchors[i].y - anchors[i - 1].y;
      segs.push(Math.sqrt(dx * dx + dy * dy));
      total += segs[segs.length - 1];
    }
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= total / 2) {
        const t = segs[i] === 0 ? 0 : (total / 2 - acc) / segs[i];
        return {
          x: anchors[i].x + (anchors[i + 1].x - anchors[i].x) * t,
          y: anchors[i].y + (anchors[i + 1].y - anchors[i].y) * t,
        };
      }
      acc += segs[i];
    }
    return anchors[anchors.length - 1];
  }

  const srcCx = src.position.x + srcW / 2;
  const tgtCx = tgt.position.x + tgtW / 2;
  return {
    x: (srcCx + tgtCx) / 2,
    y: (src.position.y + srcH + tgt.position.y) / 2,
  };
}

const LABEL_CHAR_W = 7;
const LABEL_H = 16;
const LABEL_PAD = 6;

/** Post-layout pass: compute where each edge's label will appear, detect
 *  overlaps, and write `labelOffset` into the edge data. */
export function deOverlapEdgeLabels(
  nodes: LayoutedNodeMinimal[],
  edges: DfgEdgeType[],
  nodeSize: (n: LayoutedNodeMinimal) => { w: number; h: number },
): void {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  interface LabelInfo {
    edge: DfgEdgeType;
    x: number;
    y: number;
    w: number;
    anchored: boolean;
  }

  const labels: LabelInfo[] = [];
  for (const e of edges) {
    const text = e.data?.label;
    if (!text) continue;
    const mid = edgeLabelMidpoint(e, nodeById, nodeSize);
    if (!mid) continue;
    labels.push({
      edge: e,
      x: mid.x,
      y: mid.y,
      w: text.length * LABEL_CHAR_W + LABEL_PAD * 2,
      anchored: e.source === e.target,
    });
  }

  labels.sort((a, b) => (a.anchored === b.anchored ? 0 : a.anchored ? -1 : 1));

  const placed: { x: number; y: number; w: number }[] = [];
  for (const lbl of labels) {
    if (lbl.anchored) {
      placed.push({ x: lbl.x, y: lbl.y, w: lbl.w });
      continue;
    }
    let ly = lbl.y;
    for (let iter = 0; iter < 12; iter++) {
      let overlap = false;
      for (const p of placed) {
        if (Math.abs(lbl.x - p.x) < (lbl.w + p.w) / 2 + 2 && Math.abs(ly - p.y) < LABEL_H + 1) {
          overlap = true;
          ly += ly >= p.y ? LABEL_H + 2 : -(LABEL_H + 2);
          break;
        }
      }
      if (!overlap) break;
    }
    const dy = ly - lbl.y;
    if (dy !== 0 && lbl.edge.data) {
      lbl.edge.data.labelOffset = { dx: 0, dy };
    }
    placed.push({ x: lbl.x, y: ly, w: lbl.w });
  }
}

/** The hook: pass in your current `{ activityCounts, arcs }`. Owns the
 *  sliders, the `ReactFlow` ref, and the layout-and-apply effect. */
export function useDfgPanel({
  activityCounts,
  arcs,
  metric = "count",
  formatDuration,
  heatmap = false,
}: {
  activityCounts: Record<string, number>;
  arcs: DfgArc[];
  metric?: DfgMetric;
  formatDuration?: (ms: number) => string;
  heatmap?: boolean;
}): UseDfgPanelReturn {
  const flowRef = useRef<ReactFlowInstance<DfgNode, DfgEdgeType>>();
  const [userEdgeSlider, setUserEdgeSlider] = useState<number | null>(null);

  const selection = useMemo(() => {
    const arcsByGroup = new Map<string, DfgArc[]>();
    for (const a of arcs) {
      const g = a.group ?? "_default";
      const list = arcsByGroup.get(g) ?? [];
      list.push(a);
      arcsByGroup.set(g, list);
    }
    for (const list of arcsByGroup.values()) {
      list.sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
    }
    const maxGroupSize = Math.max(1, ...[...arcsByGroup.values()].map((list) => list.length));

    let effectiveSlider: number;
    if (userEdgeSlider === null) {
      // Seed the slider so the *combined* arcs across all groups cover ~80% of total arc
      // mass: the same coverage % the UI displays. The slider is one global top-N applied
      // per group, so grow N until the union of per-group top-N reaches the target. This
      // tracks the shown metric directly (rather than overshooting via a per-group max).
      const groupCounts = [...arcsByGroup.values()].map((list) => list.map((a) => a.count));
      const totalMass = groupCounts.reduce((s, cs) => s + cs.reduce((t, c) => t + c, 0), 0);
      const target = totalMass * 0.8;
      let seed = 1;
      let covered = 0;
      for (let n = 1; n <= maxGroupSize; n++) {
        for (const cs of groupCounts) {
          if (n - 1 < cs.length) covered += cs[n - 1];
        }
        seed = n;
        if (covered >= target) break;
      }
      effectiveSlider = Math.min(Math.max(seed, 1), maxGroupSize);
    } else {
      effectiveSlider = userEdgeSlider;
    }
    const edgeN = Math.min(Math.max(0, effectiveSlider), maxGroupSize);
    const filteredArcs: DfgArc[] = [];
    for (const list of arcsByGroup.values()) {
      filteredArcs.push(...list.slice(0, edgeN));
    }
    const keptActivities = new Set<string>();
    for (const a of filteredArcs) {
      keptActivities.add(a.from);
      keptActivities.add(a.to);
    }

    const totalActs = Object.keys(activityCounts).length;
    const totalActivityEvents = Object.values(activityCounts).reduce((s, v) => s + (v ?? 0), 0);
    const shownActivityEvents = [...keptActivities].reduce((s, k) => s + (activityCounts[k] ?? 0), 0);
    const totalArcCount = arcs.reduce((s, a) => s + a.count, 0);
    const shownArcCount = filteredArcs.reduce((s, a) => s + a.count, 0);
    const edgePct =
      totalArcCount > 0
        ? filteredArcs.length >= arcs.length
          ? 100
          : Math.min(99, Math.round((100 * shownArcCount) / totalArcCount))
        : 0;
    const actPct =
      totalActivityEvents > 0
        ? keptActivities.size >= totalActs
          ? 100
          : Math.min(99, Math.round((100 * shownActivityEvents) / totalActivityEvents))
        : 0;
    const coverage: DfgCoverage = {
      edges: {
        shown: filteredArcs.length,
        total: arcs.length,
        sliderMax: maxGroupSize,
        pct: edgePct,
      },
      activities: {
        shown: keptActivities.size,
        total: totalActs,
        pct: actPct,
      },
    };
    return {
      filteredArcs,
      keptActivities,
      coverage,
      effectiveSlider,
      maxPerGroup: new Map<string, number>(
        [...arcsByGroup.entries()].map(([g, list]) => [g, Math.max(1, ...list.map((a) => a.count))]),
      ),
    };
  }, [userEdgeSlider, arcs, activityCounts]);

  useEffect(() => {
    // The ELK layout below is async and ends by replacing the whole ReactFlow graph.
    // Without this guard, a slower older layout (e.g. the larger default selection) can
    // resolve after a newer, smaller one and overwrite it, leaving the canvas showing a
    // stale selection that no longer matches the picker. `cancelled` makes only the latest
    // effect run commit; superseded runs bail before touching the graph.
    let cancelled = false;
    const { filteredArcs, keptActivities, maxPerGroup } = selection;

    const nodes: DfgNode[] = [...keptActivities].map((act): DfgNode => {
      if (act === DFG_START_ID || act === DFG_END_ID) {
        const kind: "start" | "end" = act === DFG_START_ID ? "start" : "end";
        return {
          id: act,
          type: "terminal",
          position: { x: 0, y: 0 },
          data: { kind, count: activityCounts[act] ?? 0 },
          ...({
            layoutOptions: {
              "elk.layered.layering.layerConstraint": kind === "start" ? "FIRST" : "LAST",
            },
          } as object),
        };
      }
      return {
        id: act,
        type: "activity",
        position: { x: 0, y: 0 },
        data: { activity: act, count: activityCounts[act] ?? 0 },
      };
    });

    const metricValues = new Map<string, number>();
    for (const a of filteredArcs) {
      const val = computeMetricValue(a, metric, activityCounts);
      if (val != null) metricValues.set(a.key, val);
    }
    const allVals = [...metricValues.values()];
    const valMin = allVals.length > 0 ? Math.min(...allVals) : 0;
    const valMax = allVals.length > 0 ? Math.max(...allVals) : 1;
    const isPerf = isPerformanceMetric(metric);

    const parallelCountByPair = new Map<string, number>();
    const parallelIndexByKey = new Map<string, number>();
    for (const a of filteredArcs) {
      const pair = `${a.from}\u0000${a.to}`;
      const idx = parallelCountByPair.get(pair) ?? 0;
      parallelIndexByKey.set(a.key, idx);
      parallelCountByPair.set(pair, idx + 1);
    }

    const edges: DfgEdgeType[] = filteredArcs.map((a) => {
      const maxInGroup = maxPerGroup.get(a.group ?? "_default") ?? 1;
      let color = a.color ?? "#9ca3af";
      const val = metricValues.get(a.key);
      let label: string;
      let strokeWidth: number;

      if (val != null) {
        label = formatMetricValue(val, metric, formatDuration);
        if (isPerf || metric === "pct_source") {
          const t = valMax > valMin ? (val - valMin) / (valMax - valMin) : 0.5;
          strokeWidth = 1.5 + 4.5 * Math.sqrt(t);
          if (heatmap && isPerf && a.duration != null) color = durationColor(t);
        } else {
          strokeWidth = Math.min(6, 1 + Math.log2(1 + (6 * a.count) / maxInGroup));
        }
      } else {
        label = "";
        strokeWidth = 1.5;
      }

      const pair = `${a.from}\u0000${a.to}`;
      return {
        id: a.key,
        source: a.from,
        target: a.to,
        type: "default",
        data: {
          label,
          color,
          parallelIndex: parallelIndexByKey.get(a.key) ?? 0,
          parallelCount: parallelCountByPair.get(pair) ?? 1,
        },
        style: {
          stroke: color,
          strokeWidth,
        },
        ...(a.title ? { ariaLabel: a.title } : {}),
      };
    });
    applyLayoutToNodes(
      nodes as unknown as Node<Record<string, unknown>>[],
      edges,
      {
        "elk.direction": "DOWN",
        "elk.algorithm": "layered",
        "elk.edgeRouting": "SPLINES",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
        "elk.spacing.nodeNode": "90",
        "elk.spacing.edgeNode": "30",
        "elk.spacing.edgeEdge": "20",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      } as Record<string, string>,
      (n) =>
        n.type === "terminal"
          ? { width: TERM_NODE_SIZE, height: TERM_NODE_SIZE }
          : { width: OCEL_NODE_WIDTH, height: OCEL_NODE_HEIGHT },
    )
      .then(() => {
        if (cancelled) return;
        deOverlapEdgeLabels(nodes, edges, (n) =>
          n.type === "terminal"
            ? { w: TERM_NODE_SIZE, h: TERM_NODE_SIZE }
            : { w: OCEL_NODE_WIDTH, h: OCEL_NODE_HEIGHT },
        );

        flowRef.current
          ?.deleteElements({
            nodes: flowRef.current.getNodes(),
            edges: flowRef.current.getEdges(),
          })
          .finally(() => {
            if (cancelled) return;
            flowRef.current?.setNodes(nodes);
            flowRef.current?.setEdges(edges);
            flowRef.current?.fitView();
          });
      })
      .catch((e) => console.error("[useDfgPanel] layout failed:", e));

    return () => {
      cancelled = true;
    };
  }, [selection, activityCounts, metric, formatDuration, heatmap]);

  return {
    attachRef: (instance) => {
      flowRef.current = instance as ReactFlowInstance<DfgNode, DfgEdgeType>;
    },
    edgeSlider: selection.effectiveSlider,
    setEdgeSlider: (v) => {
      setUserEdgeSlider((prev) => {
        const current = prev ?? selection.effectiveSlider;
        return typeof v === "function" ? v(current) : v;
      });
    },
    coverage: selection.coverage,
    selection: {
      filteredArcs: selection.filteredArcs,
      keptActivities: selection.keptActivities,
    },
    getLayoutedNodes: () => {
      const instance = flowRef.current;
      if (!instance) return null;
      return instance.getNodes();
    },
    getLayoutedEdges: () => {
      const instance = flowRef.current;
      if (!instance) return null;
      return instance.getEdges();
    },
  };
}

export interface DfgGraphProps {
  activityCounts: Record<string, number>;
  arcs: DfgArc[];
  metric: DfgMetric;
  setMetric: (m: DfgMetric) => void;
  hasPerformanceData: boolean;
  /** Recolor edges with a duration heatmap (blue->red) when a performance metric is
   *  active. Case-centric only; OC keeps its object-type edge coloring. */
  heatmap?: boolean;
  /** Resolves the base color (`#rrggbb`) for an activity node. */
  activityColor: (act: string) => string;
  /** Resolves the foreground/text color for an activity node. */
  activityForeground: (act: string) => string;
  /** Duration formatter for performance metric labels (from shared `format.duration`). */
  formatDuration?: (ms: number) => string;
  /** Extra legend rows for the SVG export (e.g. object-type chips). */
  legend?: { title: string; items: { label: string; color: string; hideDot?: boolean }[] }[];
  /** Optional extra UI rendered inside the top-right settings card (e.g. the
   *  object-type chip selector for the OC-DFG). */
  topRightExtra?: React.ReactNode;
  /** Emit a selection when an activity node is clicked. */
  onSelect?: (s: ViewerTarget) => void;
  /** Right-click actions shown on activity nodes (declarative; viewer renders the menu). */
  actions?: ViewerAction[];
  /** Escape hatch: report a right-click and let the host build a fully custom menu. */
  onElementContextMenu?: (t: ViewerTarget, e: { clientX: number; clientY: number }) => void;
}

/**
 * The full DFG render shell: ReactFlow graph + settings card. Advertises a vector export of
 * itself to a surrounding `<ViewerExportFrame>` via `useRegisterExport`.
 */
export function DfgGraph({
  activityCounts,
  arcs,
  metric,
  setMetric,
  hasPerformanceData,
  heatmap,
  activityColor,
  activityForeground,
  formatDuration,
  legend = [],
  topRightExtra,
  onSelect,
  actions,
  onElementContextMenu,
}: DfgGraphProps) {
  const { attachRef, edgeSlider, setEdgeSlider, coverage, selection, getLayoutedNodes, getLayoutedEdges } =
    useDfgPanel({
      activityCounts,
      arcs,
      metric,
      formatDuration,
      heatmap,
    });

  const [menu, setMenu] = useState<{ x: number; y: number; act: string } | null>(null);
  const activityActions = useMemo(
    () => (actions ?? []).filter((a) => !a.scope || a.scope === "activity"),
    [actions],
  );

  const nodeContext = useMemo<DfgNodeContextValue>(
    () => ({
      activityColor,
      activityForeground,
      onActivityClick: onSelect ? (act: string) => onSelect({ scope: "activity", key: act }) : undefined,
      onActivityContextMenu:
        activityActions.length || onElementContextMenu
          ? (act, e) => {
              onElementContextMenu?.({ scope: "activity", key: act }, e);
              if (activityActions.length) setMenu({ x: e.clientX, y: e.clientY, act });
            }
          : undefined,
    }),
    [activityColor, activityForeground, onSelect, activityActions, onElementContextMenu],
  );

  const buildSvgInputs = () => {
    const layoutedNodes = getLayoutedNodes();
    if (!layoutedNodes) return null;
    const rfEdges = getLayoutedEdges();
    const routingByKey = new Map<string, DfgArc["routing"]>();
    const swByKey = new Map<string, number>();
    if (rfEdges) {
      for (const e of rfEdges) {
        const r = e.data?.routing;
        if (r?.kind === "polyline") {
          routingByKey.set(e.id, { points: r.points, srcPos: r.srcPos, tgtPos: r.tgtPos });
        }
        if (typeof e.style?.strokeWidth === "number") {
          swByKey.set(e.id, e.style.strokeWidth);
        }
      }
    }
    const arcsWithRouting = selection.filteredArcs.map((a) => ({
      ...a,
      routing: routingByKey.get(a.key) ?? a.routing,
      strokeWidth: swByKey.get(a.key) ?? a.strokeWidth,
    }));
    return {
      layoutedNodes,
      filteredArcs: arcsWithRouting,
      activityCounts,
      activityColor,
      formatDuration,
      metric,
      heatmap,
      legend: [
        ...legend,
        { title: "Metric", items: [{ label: metricDisplayName(metric), color: "#6b7280", hideDot: true }] },
      ],
    };
  };

  const toSvg = () => {
    const inputs = buildSvgInputs();
    return inputs ? buildDfgSvgFromPanel(inputs) : null;
  };
  // Read the latest layout/props at export time through a ref, so the registered source is stable.
  const toSvgRef = useRef(toSvg);
  toSvgRef.current = toSvg;
  const exportSource = useMemo<VectorExportSource>(() => ({ toSvg: () => toSvgRef.current() }), []);
  useRegisterExport("dfg", exportSource);

  return (
    <DfgNodeContext.Provider value={nodeContext}>
      <div
        style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 256 }}
      >
        <div
          className="inner-flow relative"
          style={{ flex: "1 1 auto", width: "100%", height: "100%", minHeight: 0 }}
        >
          <ReactFlowProvider>
            <ReactFlow
              defaultEdges={[]}
              defaultNodes={[]}
              nodeTypes={DFG_NODE_TYPES}
              edgeTypes={DFG_EDGE_TYPES}
              onBeforeDelete={async () => false}
              onInit={attachRef}
              className="node-dfg"
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Panel position="top-right">
                <Card
                  className=" mt-4 p-1! bg-(--color-panel-translucent) backdrop-blur-sm"
                  style={{ width: topRightExtra ? 180 : 100 }}
                >
                  {topRightExtra}
                  <DfgSettings
                    metric={metric}
                    onMetricChange={setMetric}
                    edgeSlider={edgeSlider}
                    setEdgeSlider={setEdgeSlider}
                    coverage={coverage}
                    hasPerformanceData={hasPerformanceData}
                  />
                </Card>
              </Panel>
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        {menu && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 999 }}
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              style={{
                position: "fixed",
                top: menu.y,
                left: menu.x,
                zIndex: 1000,
                minWidth: 160,
                padding: 4,
                borderRadius: 8,
                border: "1px solid var(--gray-a5)",
                background: "var(--color-panel-solid)",
                boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {activityActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    a.run({ scope: "activity", key: menu.act });
                    setMenu(null);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "5px 8px",
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--gray-12)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </DfgNodeContext.Provider>
  );
}

export { colorToHex };
