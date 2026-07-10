/**
 * Converts the DFG SVG model (`buildDfgSvgModel`) into a generic `StyledGraph`, drawn by the
 * `export_graph_svg` renderer (the backend binding in studio, or the bundled wasm standalone).
 * Geometry (node boxes, edge polylines) is exactly the on-screen model's, so the export matches the
 * screen pixel-for-pixel; only the actual pixel pushing is generic.
 */

import type { StyledGraph, StyledNode } from "../../graph-svg/styled-graph";
import { buildStyledGraph } from "../../graph-svg/build-styled-graph";
import { exportBackgroundHex, flattenColor } from "./colors";
import { type FlowDirection, selfLoopBezier } from "./self-loop";
import {
  buildDfgSvgModel,
  darken,
  type DfgSvgBuilderInputs,
  type DfgSvgEdge,
  type DfgSvgNode,
} from "./svg-export";

type Pt = { x: number; y: number };

/** Sample a cubic Bezier at `n` evenly-spaced parameter steps (inclusive of both ends). */
function sampleCubicBezier(p0: Pt, c1: Pt, c2: Pt, p3: Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y;
    pts.push({ x, y });
  }
  return pts;
}

/** Same self-loop geometry as `DfgEdge.tsx`'s on-screen renderer (via `selfLoopBezier`), sampled to a
 *  polyline. */
function selfLoopPoints(
  src: DfgSvgNode,
  parallelIndex: number,
  strokeWidth: number,
  direction: FlowDirection,
): [number, number][] {
  const { p0, c1, c2, p3 } = selfLoopBezier(src, parallelIndex, strokeWidth, direction);
  return sampleCubicBezier(p0, c1, c2, p3, 32).map((p) => [p.x, p.y]);
}

function edgePoints(
  src: DfgSvgNode,
  tgt: DfgSvgNode,
  edge: DfgSvgEdge,
  direction: FlowDirection,
): [number, number][] | null {
  const strokeWidth = edge.strokeWidth ?? 2;
  if (src.id === tgt.id) return selfLoopPoints(src, edge.parallelIndex ?? 0, strokeWidth, direction);

  if (edge.routing && edge.routing.points.length >= 2) {
    const pts: Pt[] = edge.routing.points.map((p) => ({ x: p.x, y: p.y }));
    const srcDx = src.x - edge.routing.srcPos.x;
    const srcDy = src.y - edge.routing.srcPos.y;
    const tgtDx = tgt.x - edge.routing.tgtPos.x;
    const tgtDy = tgt.y - edge.routing.tgtPos.y;
    if (srcDx !== 0 || srcDy !== 0) pts[0] = { x: pts[0].x + srcDx, y: pts[0].y + srcDy };
    if (tgtDx !== 0 || tgtDy !== 0) {
      const n = pts.length;
      pts[n - 1] = { x: pts[n - 1].x + tgtDx, y: pts[n - 1].y + tgtDy };
    }
    return pts.map((p) => [p.x, p.y]);
  }

  // Fallback: straight bottom-center -> top-center (no routing available).
  return [
    [src.x + src.width / 2, src.y + src.height],
    [tgt.x + tgt.width / 2, tgt.y],
  ];
}

function nodeToStyled(n: DfgSvgNode, bgHex: string): StyledNode {
  if (n.shape === "terminal") {
    return {
      cx: n.x + n.width / 2,
      cy: n.y + n.height / 2,
      w: n.width,
      h: n.height,
      shape: { kind: "circle" },
      fill: n.color,
      stroke: n.color,
      stroke_width: 0,
      icon: { kind: n.terminalKind === "start" ? "triangle" : "square", color: "#ffffff" },
    };
  }
  const fg = n.foreground ?? darken(n.color, 0.55);
  const fill = flattenColor(
    n.color.length === 7 && n.color.startsWith("#") ? `${n.color}26` : n.color,
    bgHex,
  );
  const maxChars = Math.max(8, Math.floor(n.width / 9));
  const label = n.label.length > maxChars ? `${n.label.slice(0, maxChars - 1).trimEnd()}…` : n.label;
  return {
    cx: n.x + n.width / 2,
    cy: n.y + n.height / 2,
    w: n.width,
    h: n.height,
    shape: { kind: "box", radius: 10 },
    fill,
    stroke: n.color,
    stroke_width: 2,
    labels: [
      { text: label, size: 12, weight: 600, color: fg, dy: n.sublabel ? -6 : 0 },
      ...(n.sublabel ? [{ text: n.sublabel, size: 10, weight: 400, color: fg, dy: 8 }] : []),
    ],
  };
}

/** Convert an already-computed DFG SVG model into a `StyledGraph`. */
export function dfgModelToStyledGraph(
  nodes: DfgSvgNode[],
  edges: DfgSvgEdge[],
  legend: { title: string; items: { label: string; color: string; hideDot?: boolean }[] }[] = [],
  direction: FlowDirection = "TB",
): StyledGraph {
  const bgHex = exportBackgroundHex();
  return buildStyledGraph(nodes, edges, {
    id: (n) => n.id,
    source: (e) => e.source,
    target: (e) => e.target,
    nodeToStyled: (n) => nodeToStyled(n, bgHex),
    edgeToStyled: (edge, src, tgt) => {
      const points = edgePoints(src, tgt, edge, direction);
      if (!points) return null;
      // Self-loops are already a sampled curve (rounding would fight the sampling); regular
      // polylines get the same corner radius the on-screen edge uses.
      const isLoop = src.id === tgt.id;
      return {
        points,
        color: edge.color,
        width: edge.strokeWidth ?? 2,
        marker_end: "arrow",
        rounded: isLoop ? 0 : 18,
        labels: edge.label
          ? [
              {
                text: edge.label,
                at: 0.5,
                dx: edge.labelOffset?.dx ?? 0,
                dy: edge.labelOffset?.dy ?? 0,
                bg: flattenColor("#ffffffcc", bgHex),
                color: edge.color,
              },
            ]
          : [],
      };
    },
    padding: 40,
    background: bgHex,
    legend: legend.map((g) => ({
      title: g.title,
      items: g.items.map((i) => ({ label: i.label, color: i.hideDot ? undefined : i.color })),
    })),
  });
}

/** Convert a live DFG panel's state directly into a `StyledGraph` (shares all metric/color
 *  computation with `buildDfgSvgFromPanel` via `buildDfgSvgModel`). */
export function buildDfgStyledGraph(inputs: DfgSvgBuilderInputs): StyledGraph | null {
  const model = buildDfgSvgModel(inputs);
  return model
    ? dfgModelToStyledGraph(model.nodes, model.edges, model.legend, inputs.direction ?? "TB")
    : null;
}
