import { exportBackgroundHex, flattenColor, hexTriple, mix } from "../dfg/util/colors";
import type { StyledEdge, StyledGraph, StyledNode } from "../graph-svg/styled-graph";
import { flattenSplinePoints, type LayoutResult } from "./elk-layout";

export interface StyledTypeGraphNode {
  id: string;
  label: string;
  kind: "event" | "object";
  count?: number;
  /** Base hex (same value the on-screen node uses). */
  color: string;
  /** Host-driven highlight ring color (on-screen `boxShadow`). */
  ring?: string;
  dimmed?: boolean;
}

export interface StyledTypeGraphEdge {
  id: string;
  source: string;
  target: string;
  qualifier?: string;
  isO2O?: boolean;
  /** Resolved edge color; a `var(...)` default falls back to a concrete neutral for export. */
  color: string;
  width?: number;
  dimmed?: boolean;
}

const NODE_W = 150;
const NODE_H = 40;
const DIM = 0.4;

const isDarkBg = (bg: string) => {
  const [r, g, b] = hexTriple(bg);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};

/** Build a `StyledGraph` from live type-graph geometry, mirroring on-screen styling with concrete hex colors. */
export function ocelTypeGraphToStyledGraph(
  nodes: StyledTypeGraphNode[],
  edges: StyledTypeGraphEdge[],
  layout: LayoutResult,
): StyledGraph | null {
  if (nodes.length === 0) return null;
  const bg = exportBackgroundHex();
  const dark = isDarkBg(bg);
  const contrast = dark ? "#ffffff" : "#000000";

  const styledNodes: StyledNode[] = [];
  for (const n of nodes) {
    const pos = layout.nodes.get(n.id);
    if (!pos) continue;
    // Normalize to #rrggbb: a host `colorOf` may return any CSS color, but the hex-alpha compositing
    // and `mix()` below require plain hex.
    const base = flattenColor(n.color, bg);
    const fill = flattenColor(`${base}2e`, bg);
    const stroke = flattenColor(`${base}73`, bg);
    const fg = mix(base, contrast, dark ? 0.35 : 0.45);
    const isEvent = n.kind === "event";
    const radius = isEvent ? 6 : 999;
    if (n.ring) {
      // The on-screen `boxShadow` ring, as a stroked box behind the node (drawn first, node on top).
      styledNodes.push({
        cx: pos.x + NODE_W / 2,
        cy: pos.y + NODE_H / 2,
        w: NODE_W + 7,
        h: NODE_H + 7,
        shape: { kind: "box", radius: radius + 3 },
        fill: "none",
        stroke: flattenColor(n.ring, bg),
        stroke_width: 4,
      });
    }
    const fgDimmed = n.dimmed ? mix(fg, bg, DIM) : fg;
    const nodeBg = n.dimmed ? mix(fill, bg, DIM) : fill;
    // dx 5.5 re-centers the bullet(7px)+gap(4px)+text group.
    const nameLabel = {
      text: n.label,
      size: 12.5,
      weight: 600,
      color: fgDimmed,
      dy: n.count != null ? -6.5 : 0,
      dx: 5.5,
      bullet: (isEvent ? "square" : "dot") as "square" | "dot",
      bullet_color: n.dimmed ? mix(base, bg, DIM) : base,
    };
    const countLabel =
      n.count != null
        ? [
            {
              text: n.count.toLocaleString("en"),
              size: 10,
              weight: 700,
              // The on-screen 0.7 opacity, composited over the node fill.
              color: mix(fgDimmed, nodeBg, 0.3),
              dy: 7.5,
            },
          ]
        : [];
    styledNodes.push({
      cx: pos.x + NODE_W / 2,
      cy: pos.y + NODE_H / 2,
      w: NODE_W,
      h: NODE_H,
      shape: { kind: "box", radius },
      fill: nodeBg,
      stroke: n.dimmed ? mix(stroke, bg, DIM) : stroke,
      stroke_width: 2.5,
      labels: [nameLabel, ...countLabel],
    });
  }

  const neutral = mix(bg, contrast, 0.45);
  const styledEdges: StyledEdge[] = [];
  for (const e of edges) {
    const route = layout.edges.get(e.id);
    if (!route || route.points.length < 2) continue;
    const resolved = e.color.startsWith("var(") ? neutral : flattenColor(e.color, bg);
    const color = e.dimmed ? mix(resolved, bg, DIM) : resolved;
    styledEdges.push({
      // Flatten Bezier control points to a dense list so the straight-segment exporter approximates the curve.
      points: flattenSplinePoints(route.points).map((p) => [p.x, p.y]),
      color,
      width: e.width ?? 1.6,
      dash: e.isO2O ? "6 3" : undefined,
      marker_end: "arrow",
      labels: e.qualifier ? [{ text: e.qualifier, color, bg }] : [],
    });
  }

  return { background: bg, padding: 32, nodes: styledNodes, edges: styledEdges, legend: [] };
}
