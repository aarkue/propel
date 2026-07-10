/**
 * DFG SVG-model builder + small SVG/DOM utilities. `buildDfgSvgModel` turns a live DFG panel's state
 * (laid-out node positions/sizes + edge metadata: color, count, per-pair parallel index) into an
 * intermediate `DfgSvgNode`/`DfgSvgEdge` model, doing all the metric/color/parallel-index computation
 * once. The `StyledGraph` builder (`dfg/util/styled-graph.ts`) consumes that model and the generic
 * `export_graph_svg` renderer draws it, so nothing here draws pixels itself.
 */

import {
  type DfgArc,
  type DfgMetric,
  computeMetricValue,
  formatMetricValue,
  isPerformanceMetric,
} from "./dfg-model";
import { durationColor } from "./duration";

export const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Serialize an `<svg>` element to a standalone XML string. */
export function serializeSvg(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

/** Darken a `#rrggbb` color by a fraction (0..1). Returns `rgb(...)`. */
export function darken(hex: string, amount = 0.35): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

/** Browser-side download of a Blob with a given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** One node the renderer knows how to draw. `x` and `y` are the top-left
 *  of the node in the final coordinate system (post-layout). */
export interface DfgSvgNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Visible label. For terminals this can be the empty string. */
  label: string;
  /** Secondary line under the label (usually the frequency count). */
  sublabel?: string;
  /** Fill / stroke color base; activity-color-like. */
  color: string;
  /** Foreground color for the label text. */
  foreground?: string;
  /** Draw a rounded pill (activity) or a circular terminal. */
  shape?: "rect" | "terminal";
  /** For `terminal` shape: which inner symbol to draw. */
  terminalKind?: "start" | "end";
}

/** One edge the renderer draws. */
export interface DfgSvgEdge {
  key: string;
  source: string;
  target: string;
  label: string;
  color: string;
  strokeWidth?: number;
  parallelIndex?: number;
  parallelCount?: number;
  routing?: {
    points: { x: number; y: number }[];
    srcPos: { x: number; y: number };
    tgtPos: { x: number; y: number };
  };
  /** Label displacement from the on-screen de-overlap pass. */
  labelOffset?: { dx: number; dy: number };
}

export interface DfgSvgExportOptions {
  nodes: DfgSvgNode[];
  edges: DfgSvgEdge[];
  legend?: { title: string; items: { label: string; color: string; hideDot?: boolean }[] }[];
}

/** Minimal layouted node shape pulled from ReactFlow's `getNodes()`. */
export interface LayoutedNodeLite {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export interface DfgSvgBuilderInputs {
  layoutedNodes: LayoutedNodeLite[];
  filteredArcs: DfgArc[];
  activityCounts: Record<string, number>;
  activityColor: (name: string) => string;
  formatDuration?: (ms: number) => string;
  metric?: DfgMetric;
  /** Recolor edges with the duration heatmap (case-centric, performance metric). */
  heatmap?: boolean;
  legend?: { title: string; items: { label: string; color: string; hideDot?: boolean }[] }[];
  /** Layout flow direction; positions self-loops on the free cross-axis. Defaults to "TB". */
  direction?: "TB" | "LR";
}

/** Convert a live DFG panel's state into the intermediate `DfgSvgNode`/`DfgSvgEdge` model shared
 *  by both the built-in JS drawer (`buildDfgSvg`) and the generic `StyledGraph` builder
 *  (`dfg/util/styled-graph.ts`) - all the metric/color/parallel-index computation lives here once. */
export function buildDfgSvgModel(
  inputs: DfgSvgBuilderInputs,
): { nodes: DfgSvgNode[]; edges: DfgSvgEdge[]; legend?: DfgSvgExportOptions["legend"] } | null {
  const {
    layoutedNodes,
    filteredArcs,
    activityCounts,
    activityColor,
    formatDuration,
    metric: inputMetric,
    heatmap,
    legend,
  } = inputs;
  const metric = inputMetric ?? "count";

  const touched = new Set<string>();
  for (const a of filteredArcs) {
    touched.add(a.from);
    touched.add(a.to);
  }
  const nodeSvgs: DfgSvgNode[] = [];
  for (const n of layoutedNodes) {
    if (!touched.has(n.id)) continue;
    const width = n.measured?.width ?? n.width ?? 160;
    const height = n.measured?.height ?? n.height ?? 50;
    const isTerminal = n.id === "__START" || n.id === "__END";
    if (isTerminal) {
      const isStart = n.id === "__START";
      nodeSvgs.push({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width,
        height,
        label: "",
        color: isStart ? "#a855f7" : "#ef4444",
        shape: "terminal",
        terminalKind: isStart ? "start" : "end",
      });
    } else {
      nodeSvgs.push({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        width,
        height,
        label: n.id,
        sublabel: (activityCounts[n.id] ?? 0).toLocaleString("en"),
        color: activityColor(n.id),
        shape: "rect",
      });
    }
  }

  const parallelCountByPair = new Map<string, number>();
  const parallelIndexByKey = new Map<string, number>();
  for (const a of filteredArcs) {
    const pair = `${a.from}\u0000${a.to}`;
    const idx = parallelCountByPair.get(pair) ?? 0;
    parallelIndexByKey.set(a.key, idx);
    parallelCountByPair.set(pair, idx + 1);
  }
  const metricValues = new Map<string, number>();
  for (const a of filteredArcs) {
    const val = computeMetricValue(a, metric, activityCounts);
    if (val != null) metricValues.set(a.key, val);
  }
  const allVals = [...metricValues.values()];
  const valMin = allVals.length > 0 ? Math.min(...allVals) : 0;
  const valMax = allVals.length > 0 ? Math.max(...allVals) : 1;
  const isPerf = isPerformanceMetric(metric);
  const maxCount = Math.max(1, ...filteredArcs.map((a) => a.count));

  const edgeSvgs: DfgSvgEdge[] = filteredArcs.map((a) => {
    const val = metricValues.get(a.key);
    const label = val != null ? formatMetricValue(val, metric, formatDuration) : "";
    let strokeWidth: number;
    if (a.strokeWidth != null) {
      strokeWidth = a.strokeWidth;
    } else if (val != null) {
      if (isPerf || metric === "pct_source") {
        const t = valMax > valMin ? (val - valMin) / (valMax - valMin) : 0.5;
        strokeWidth = 1.5 + 4.5 * Math.sqrt(t);
      } else {
        strokeWidth = Math.min(6, 1 + Math.log2(1 + (6 * a.count) / maxCount));
      }
    } else {
      strokeWidth = 1.5;
    }
    let color = a.color ?? "#9ca3af";
    if (heatmap && isPerf && a.duration != null && val != null) {
      const t = valMax > valMin ? (val - valMin) / (valMax - valMin) : 0.5;
      color = durationColor(t);
    }
    return {
      key: a.key,
      source: a.from,
      target: a.to,
      label,
      color,
      strokeWidth,
      parallelIndex: parallelIndexByKey.get(a.key) ?? 0,
      parallelCount: parallelCountByPair.get(`${a.from}\u0000${a.to}`) ?? 1,
      routing: a.routing,
      labelOffset: a.labelOffset,
    };
  });

  if (nodeSvgs.length === 0) return null;
  return { nodes: nodeSvgs, edges: edgeSvgs, legend };
}
