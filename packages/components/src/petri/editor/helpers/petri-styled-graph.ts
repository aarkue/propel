/** Converts an already-laid-out Petri net into a generic `StyledGraph`, reading geometry/styling exactly as drawn on screen. */

import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode, TokenMark } from "../Editor";
import { arcRawPoints } from "./edge-geometry";
import { flattenColor } from "../../../dfg/util/colors";
import { resolveThemeColors } from "./petri-svg";
import { PLACE_SIZE, TRANSITION_SIZE } from "./layout-graph";
import { buildStyledGraph } from "../../../graph-svg/build-styled-graph";
import type {
  LegendGroup as ExternalLegendGroup,
  MarkingGroup,
  StyledGraph,
  StyledNode,
} from "../../../graph-svg/styled-graph";

function px(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function sizeOf(n: PetriNetNode): { width: number; height: number } {
  return n.type === "place" ? PLACE_SIZE : TRANSITION_SIZE;
}

function markingOf(n: PetriNetNode & { type: "place" }, bg: string): MarkingGroup[] {
  const marks = n.data.tokenMarks;
  if (marks && marks.length > 0) {
    // Each explicit mark can have its own color/opacity; the generic renderer draws a group as a
    // single color, so split into one one-count group per mark (still draws as one packed row).
    return marks.map((m: TokenMark) => ({
      kind: m.shape === "square" ? "square" : "dot",
      color: m.color ? flattenColor(m.color, bg) : m.color,
      count: 1,
    }));
  }
  const tokenColor = n.data.tokenColor ? flattenColor(n.data.tokenColor, bg) : n.data.tokenColor;
  const groups: MarkingGroup[] = [];
  if (n.data.tokens) groups.push({ kind: "dot", color: tokenColor, count: n.data.tokens });
  if (n.data.finalTokens) groups.push({ kind: "square", color: tokenColor, count: n.data.finalTokens });
  return groups;
}

function nodeToStyled(n: PetriNetNode, theme: ReturnType<typeof resolveThemeColors>): StyledNode {
  const s = sizeOf(n);
  const st = (n.data.style ?? {}) as React.CSSProperties;
  const strokeWidth = px(st.borderWidth, 1.75);
  // On-screen styles carry `var()` / `color-mix()` tokens (see shadeHex); the Rust renderer only
  // understands plain hex, so every screen-derived color is flattened against the export bg.
  const flat = (c: unknown, fallback: string) =>
    typeof c === "string" && c ? flattenColor(c, theme.exportBg) : fallback;

  if (n.type === "place") {
    return {
      cx: n.position.x,
      cy: n.position.y,
      w: s.width,
      h: s.height,
      shape: { kind: "circle" },
      fill: flat(st.background ?? st.backgroundColor, theme.nodeBg),
      stroke: flat(st.borderColor, theme.nodeBorder),
      stroke_width: strokeWidth,
      marking: markingOf(n, theme.exportBg),
    };
  }

  const label = n.data.label ?? "";
  const invisible = label === "";
  return {
    cx: n.position.x,
    cy: n.position.y,
    w: s.width,
    h: s.height,
    shape: { kind: "box", radius: 4 },
    fill: invisible ? theme.nodeText : flat(st.background ?? st.backgroundColor, theme.nodeBg),
    stroke: flat(st.borderColor, theme.nodeBorder),
    stroke_width: strokeWidth,
    labels: invisible
      ? []
      : [{ text: label, size: 12.5, weight: 500, color: flat(st.color, theme.nodeText), wrap: true }],
  };
}

/** Convert an already-laid-out Petri net into a `StyledGraph`. Pass `legend` for OCPN's object-type
 *  legend (absent for the plain case-centric Petri viewer, which has none). */
export function petriModelToStyledGraph(
  nodes: PetriNetNode[],
  edges: Edge<ArcData>[],
  legend: ExternalLegendGroup[] = [],
): StyledGraph | null {
  if (nodes.length === 0) return null;
  const theme = resolveThemeColors();
  return buildStyledGraph(nodes, edges, {
    id: (n) => n.id,
    source: (e) => e.source,
    target: (e) => e.target,
    nodeToStyled: (n) => nodeToStyled(n, theme),
    edgeToStyled: (e, src, tgt) => {
      const es = (e.style ?? {}) as React.CSSProperties;
      const color = es.stroke ? flattenColor(es.stroke as string, theme.exportBg) : theme.arcDefaultColor;
      const points = arcRawPoints({
        sourceCenter: src.position,
        targetCenter: tgt.position,
        sourceType: src.type,
        targetType: tgt.type,
        routing: e.data?.routing,
      });
      const weight = e.data?.weight;
      const labelText = e.data?.label ?? (weight != null && weight !== 1 ? String(weight) : undefined);
      return {
        points: points.map((p) => [p.x, p.y]),
        color,
        width: px(es.strokeWidth, 2),
        dash: es.strokeDasharray as string | undefined,
        marker_end: "arrow",
        rounded: 8,
        labels: labelText ? [{ text: labelText, at: 0.5, bg: theme.arcLabelBg, color }] : [],
      };
    },
    padding: 36,
    background: theme.exportBg,
    legend,
  });
}
