/** Converts an already-laid-out process tree into a generic `StyledGraph`, reading geometry exactly as drawn on screen. */
import type { Edge } from "@xyflow/react";
import { edgeRawPoints } from "../../../graph-edit/routing";
import { buildStyledGraph } from "../../../graph-svg/build-styled-graph";
import type { StyledEdge, StyledGraph, StyledNode } from "../../../graph-svg/styled-graph";
import { resolveThemeColors } from "../../../petri/editor/helpers/petri-svg";
import { OPERATOR_SYMBOL } from "../../tree";
import type { ProcessTreeNode } from "../Editor";
import { geomOfType, LEAF_SIZE, OPERATOR_SIZE } from "./layout-graph";

export function treeModelToStyledGraph(nodes: ProcessTreeNode[], edges: Edge[]): StyledGraph | null {
  if (nodes.length === 0) return null;
  const theme = resolveThemeColors();

  const nodeToStyled = (n: ProcessTreeNode): StyledNode => {
    if (n.type === "operator") {
      return {
        cx: n.position.x,
        cy: n.position.y,
        w: OPERATOR_SIZE.width,
        h: OPERATOR_SIZE.height,
        shape: { kind: "circle" },
        fill: theme.nodeBg,
        stroke: theme.nodeBorder,
        stroke_width: 1.75,
        labels: [
          { text: OPERATOR_SYMBOL[n.data.operator_type], size: 22, weight: 600, color: theme.nodeText },
        ],
      };
    }
    const tau = n.data.activity_label.type === "Tau";
    const text = n.data.activity_label.type === "Activity" ? n.data.activity_label.value : "τ";
    return {
      cx: n.position.x,
      cy: n.position.y,
      w: LEAF_SIZE.width,
      h: LEAF_SIZE.height,
      shape: { kind: "box", radius: 4 },
      // A silent leaf is filled, mirroring the on-screen `.leaf-node.tau` rule.
      fill: tau ? theme.nodeText : theme.nodeBg,
      stroke: theme.nodeBorder,
      stroke_width: 1.75,
      labels: [
        {
          text,
          size: 13,
          weight: 500,
          color: tau ? theme.nodeBg : theme.nodeText,
          wrap: true,
        },
      ],
    };
  };

  const edgeToStyled = (_e: Edge, src: ProcessTreeNode, tgt: ProcessTreeNode): StyledEdge | null => {
    const pts = edgeRawPoints({
      sourceCenter: src.position,
      targetCenter: tgt.position,
      source: geomOfType(src.type),
      target: geomOfType(tgt.type),
    });
    if (pts.length < 2) return null;
    return {
      points: pts.map((p) => [p.x, p.y] as [number, number]),
      color: theme.arcDefaultColor,
      width: 2,
      marker_end: "arrow",
      rounded: 8,
    };
  };

  return buildStyledGraph(nodes, edges, {
    id: (n) => n.id,
    source: (e) => e.source,
    target: (e) => e.target,
    nodeToStyled,
    edgeToStyled,
    padding: 20,
    background: theme.exportBg,
  });
}
