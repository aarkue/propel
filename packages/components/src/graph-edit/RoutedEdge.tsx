import { EdgeLabelRenderer, type EdgeProps, type Node, useReactFlow } from "@xyflow/react";
import { useId, useState } from "react";
import { ARROW, edgeGeometry, type EdgeRouting, markerSizeFor, type NodeGeom } from "./routing";

export type RoutedEdgeProps = EdgeProps & {
  /** Border shape and size of an endpoint node, used to clip the edge at the border. */
  geomOf: (node: Node) => NodeGeom;
  routing?: EdgeRouting;
  pathClassName?: string;
  labelText?: string;
  /** Shown only while the edge or an endpoint is hovered or selected. */
  badge?: React.ReactNode;
  /** Always-rendered midpoint slot (e.g. a delete affordance); visibility is the consumer's CSS. */
  midSlot?: React.ReactNode;
  onEdgeClick?: (e: React.MouseEvent) => void;
  onEdgeContextMenu?: (e: React.MouseEvent) => void;
};

/** An edge drawn from bend-point {@link EdgeRouting}, or clipped border-to-border when unrouted. */
export default function RoutedEdge(props: RoutedEdgeProps) {
  const { getNode } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  // Per-instance id: two renders of the same graph must not emit colliding marker
  // ids, or url(#id) resolves to the wrong one and arrowheads vanish in Blink.
  const uid = useId().replace(/[^\w-]/g, "");
  const source = getNode(props.source);
  const target = getNode(props.target);
  if (!source || !target) return null;

  const style = (props.style ?? {}) as React.CSSProperties;
  const color = (style.stroke as string) ?? "var(--r4pm-node-border)";
  const strokeWidth = typeof style.strokeWidth === "number" ? style.strokeWidth : 2;
  const markerSize = markerSizeFor(strokeWidth);
  // Adornments stay hidden until hover/selection, keeping a dense graph uncluttered.
  const showBadge = !!props.badge && (hovered || !!props.selected || !!source.selected || !!target.selected);

  const {
    path: edgePath,
    labelX,
    labelY,
  } = edgeGeometry({
    // Positions are centres: every editor using this sets nodeOrigin=[0.5,0.5].
    sourceCenter: source.position,
    targetCenter: target.position,
    source: props.geomOf(source),
    target: props.geomOf(target),
    strokeWidth,
    routing: props.routing,
  });

  const markerId = `edge-arrow-${uid}-${props.id.replace(/[^\w-]/g, "_")}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth={markerSize}
          markerHeight={markerSize}
          viewBox={ARROW.viewBox}
          orient="auto"
          refX={ARROW.refX}
          refY={ARROW.refY}
          markerUnits="userSpaceOnUse"
        >
          <path d={ARROW.path} fill={color} stroke={color} strokeLinejoin="round" />
        </marker>
      </defs>
      {(props.onEdgeClick || props.onEdgeContextMenu || props.badge) && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(14, strokeWidth + 12)}
          style={{ cursor: props.onEdgeClick ? "pointer" : undefined, pointerEvents: "stroke" }}
          onClick={props.onEdgeClick}
          onContextMenu={props.onEdgeContextMenu}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
      <path
        id={props.id}
        className={`react-flow__edge-path ${props.pathClassName ?? ""}`}
        d={edgePath}
        markerEnd={`url(#${markerId})`}
        fill="none"
        style={{ stroke: color, strokeWidth, strokeLinecap: "butt", ...style }}
      />
      {(props.labelText || props.badge || props.midSlot) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
            className={`edge ${props.selected ? "selected" : ""}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {showBadge && props.badge}
            {props.labelText ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color,
                  background: "var(--xy-edge-label-background-color, var(--r4pm-node-bg, #fff))",
                  borderRadius: 3,
                  padding: "0 3px",
                  pointerEvents: "none",
                }}
              >
                {props.labelText}
              </span>
            ) : null}
            {props.midSlot}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
