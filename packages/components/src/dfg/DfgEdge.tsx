import {
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type InternalNode,
  useInternalNode,
} from "@xyflow/react";
import { useId } from "react";
import { roundedPath } from "../ocel-type-graph/type-graph";
import type { Point } from "../viz";
import { type EdgeRoute, labelPoint, shownRoute } from "./viz-layout";

interface DfgEdgeData extends Record<string, unknown> {
  route: EdgeRoute;
  label: string;
  color: string;
  width: number;
}

export type DfgEdgeType = Edge<DfgEdgeData, "dfg">;

/** A node's centre on screen. */
function nodeCentre(n: Pick<InternalNode, "internals" | "measured" | "width" | "height">): Point {
  const w = n.width ?? n.measured?.width ?? 0;
  const h = n.height ?? n.measured?.height ?? 0;
  return { x: n.internals.positionAbsolute.x + w / 2, y: n.internals.positionAbsolute.y + h / 2 };
}

/** Trim the last segment by `by` so the arrowhead tip lands on the node border. */
function shortenEnd(pts: Point[], by: number): Point[] {
  if (by <= 0 || pts.length < 2) return pts;
  const out = [...pts];
  const last = out[out.length - 1];
  const prev = out[out.length - 2];
  const len = Math.hypot(last.x - prev.x, last.y - prev.y);
  if (len > by) {
    out[out.length - 1] = {
      x: last.x - ((last.x - prev.x) / len) * by,
      y: last.y - ((last.y - prev.y) / len) * by,
    };
  }
  return out;
}

/** A DFG arc along its route, bent along while its nodes move, with its label at the layout's anchor. */
export function DfgEdge({ id, source, target, data }: EdgeProps<DfgEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const uid = useId().replace(/[^\w-]/g, "");
  if (!data || !sourceNode || !targetNode || data.route.points.length < 2) return null;

  const { points, labelAnchor } = shownRoute(data.route, nodeCentre(sourceNode), nodeCentre(targetNode));
  const markerSize = Math.max(14, data.width * 4);
  const path = roundedPath(shortenEnd(points, 0.35 * markerSize), 4);
  const at = data.label ? labelPoint(points, labelAnchor) : undefined;
  const markerId = `dfg-arrow-${uid}-${id.replace(/[^\w-]/g, "_")}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth={markerSize}
          markerHeight={markerSize}
          viewBox="0 0 20 20"
          orient="auto"
          refX="7"
          refY="10"
          markerUnits="userSpaceOnUse"
        >
          {/* style, not fill/stroke attributes: color may be a var() token, which SVG attrs don't substitute */}
          <path
            d="M 0,2 L 14,10 L 0,18 Z"
            style={{ fill: data.color, stroke: data.color }}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={path}
        markerEnd={`url(#${markerId})`}
        style={{ stroke: data.color, strokeWidth: data.width, strokeLinecap: "butt" }}
        fill="none"
      />
      {at && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none tabular-nums"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)`,
              padding: "0 2px",
              borderRadius: 2,
              background: "var(--color-panel-solid)",
              color: "var(--gray-12)",
              fontSize: 10.5,
              lineHeight: "14px",
              whiteSpace: "nowrap",
              zIndex: 1,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const DFG_EDGE_TYPES = { dfg: DfgEdge };
