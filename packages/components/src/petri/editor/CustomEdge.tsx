import { EdgeLabelRenderer, type EdgeProps, useReactFlow } from "@xyflow/react";
import { useContext, useId, useState } from "react";
import { ARROW, arcGeometry, markerSizeFor } from "./helpers/edge-geometry";
import { EditorPropsContext, type ArcData } from "./Editor";
import DeleteButton from "./DeleteButton";

export default function CustomEdge(props: EdgeProps) {
  const { getNode } = useReactFlow();
  const { arcOverlay } = useContext(EditorPropsContext);
  const [hovered, setHovered] = useState(false);
  // Per-instance id: two renders of the same net must not emit colliding marker
  // ids, or url(#id) resolves to the wrong one and arrowheads vanish in Blink.
  const uid = useId().replace(/[^\w-]/g, "");
  const source = getNode(props.source);
  const target = getNode(props.target);
  if (!source || !target) return null;

  const targetType = target.type as "place" | "transition";
  const sourceType = source.type as "place" | "transition";

  // Per-render overlay; endpoint kinds let the consumer tell place from transition.
  const ov = arcOverlay?.(
    { id: props.id, from: props.source, to: props.target, fromType: sourceType, toType: targetType },
    (props.data ?? {}) as ArcData,
  );
  const style = { ...((props.style ?? {}) as React.CSSProperties), ...(ov?.style ?? {}) };
  const color = (style.stroke as string) ?? "var(--r4pm-node-border)";
  const strokeWidth = typeof style.strokeWidth === "number" ? style.strokeWidth : 2;

  const baseData = props.data as ArcData | undefined;
  const data: ArcData | undefined = ov
    ? {
        ...baseData,
        className: ov.className ?? baseData?.className,
        label: ov.label ?? baseData?.label,
        onClick: ov.onClick ?? baseData?.onClick,
        onContextMenu: ov.onContextMenu ?? baseData?.onContextMenu,
      }
    : baseData;
  const markerSize = markerSizeFor(strokeWidth);
  // Arc adornments (e.g. a variable-arc toggle) stay hidden until the edge is hovered or
  // it / one of its endpoints is selected - keeps a dense net uncluttered.
  const showBadge = !!ov?.badge && (hovered || !!props.selected || !!source.selected || !!target.selected);

  const {
    path: edgePath,
    labelX,
    labelY,
  } = arcGeometry({
    sourceCenter: source.position,
    targetCenter: target.position,
    sourceType,
    targetType,
    strokeWidth,
    routing: data?.routing,
  });

  const weight = data?.weight;
  // Explicit arc label wins; otherwise show the weight when it carries info (> 1).
  const labelText = data?.label ?? (weight != null && weight !== 1 ? String(weight) : undefined);
  const markerId = `pn-arrow-${uid}-${props.id.replace(/[^\w-]/g, "_")}`;

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
      {(data?.onClick || data?.onContextMenu || ov?.badge) && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(14, strokeWidth + 12)}
          style={{ cursor: data?.onClick ? "pointer" : undefined, pointerEvents: "stroke" }}
          onClick={data?.onClick}
          onContextMenu={data?.onContextMenu}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
      <path
        id={props.id}
        className={`react-flow__edge-path ${data?.className ?? ""}`}
        d={edgePath}
        markerEnd={`url(#${markerId})`}
        fill="none"
        style={{ stroke: color, strokeWidth, strokeLinecap: "butt", ...style }}
      />
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
          {showBadge && ov?.badge}
          {labelText != null && labelText !== "" && (
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
              {labelText}
            </span>
          )}
          <span style={{ position: "relative", width: "0.75rem", height: "0.75rem" }}>
            <DeleteButton edgeID={props.id} />
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
