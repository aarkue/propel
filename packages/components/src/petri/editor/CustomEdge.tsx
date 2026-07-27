import type { EdgeProps, Node } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useContext } from "react";
import RoutedEdge from "../../graph-edit/RoutedEdge";
import { geomOfType } from "./helpers/edge-geometry";
import { EditorPropsContext, type ArcData } from "./Editor";
import DeleteButton from "./DeleteButton";

const geomOf = (node: Node) => geomOfType(node.type as "place" | "transition");

export default function CustomEdge(props: EdgeProps) {
  const { getNode } = useReactFlow();
  const { arcOverlay } = useContext(EditorPropsContext);
  const source = getNode(props.source);
  const target = getNode(props.target);
  if (!source || !target) return null;

  const sourceType = source.type as "place" | "transition";
  const targetType = target.type as "place" | "transition";

  // Per-render overlay; endpoint kinds let the consumer tell place from transition.
  const ov = arcOverlay?.(
    { id: props.id, from: props.source, to: props.target, fromType: sourceType, toType: targetType },
    (props.data ?? {}) as ArcData,
  );
  const style = { ...((props.style ?? {}) as React.CSSProperties), ...(ov?.style ?? {}) };

  const baseData = props.data as ArcData | undefined;
  const weight = baseData?.weight;
  // Explicit arc label wins; otherwise show the weight when it carries info (> 1).
  const labelText =
    ov?.label ?? baseData?.label ?? (weight != null && weight !== 1 ? String(weight) : undefined);

  return (
    <RoutedEdge
      {...props}
      style={style}
      geomOf={geomOf}
      routing={baseData?.routing}
      pathClassName={ov?.className ?? baseData?.className}
      labelText={labelText}
      badge={ov?.badge}
      onEdgeClick={ov?.onClick ?? baseData?.onClick}
      onEdgeContextMenu={ov?.onContextMenu ?? baseData?.onContextMenu}
      midSlot={
        <span style={{ position: "relative", width: "0.75rem", height: "0.75rem" }}>
          <DeleteButton edgeID={props.id} />
        </span>
      }
    />
  );
}
