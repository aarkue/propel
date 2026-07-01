import { Handle, type NodeProps, Position, type Node, useReactFlow } from "@xyflow/react";
import { useContext } from "react";
import DeleteButton from "./DeleteButton";
import { EditorPropsContext, type PlaceData } from "./Editor";
import { PLACE_SIZE } from "./helpers/layout-graph";

export default function PlaceNode({ id, selected, data: liveData }: NodeProps<Node<PlaceData>>) {
  const { readOnly, placeOverlay } = useContext(EditorPropsContext);
  const { setNodes } = useReactFlow();

  // Per-render overlay; never overrides tokens/finalTokens (the stepper owns those).
  const ov = placeOverlay?.(id, liveData);
  const data: PlaceData = ov
    ? { ...liveData, ...ov, tokens: liveData.tokens, finalTokens: liveData.finalTokens }
    : liveData;

  const bump = (field: "tokens" | "finalTokens", delta: number) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...(n.data as PlaceData),
                [field]: Math.max(0, ((n.data as PlaceData)[field] ?? 0) + delta),
              },
            }
          : n,
      ),
    );

  return (
    <div
      title={data.label}
      className={`node place-node flex flex-wrap gap-0.5 place-content-center items-center justify-center ${selected ? "selected" : ""} ${data.className ?? ""}`}
      style={{
        width: PLACE_SIZE.width,
        height: PLACE_SIZE.height,
        cursor: data.onClick ? "pointer" : undefined,
        ...data.style,
      }}
      onClick={data.onClick}
      onContextMenu={data.onContextMenu}
    >
      {data.renderControls?.()}
      {data.renderMarking ? (
        data.renderMarking()
      ) : data.tokenMarks ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            maxWidth: 44,
          }}
        >
          {data.tokenMarks.map((m, i) => (
            <div
              key={i}
              title={m.title}
              style={{
                width: m.shape === "square" ? 11 : 12,
                height: m.shape === "square" ? 11 : 12,
                borderRadius: m.shape === "square" ? "2px" : "100%",
                background: m.color ?? "var(--r4pm-node-text)",
                opacity: m.opacity ?? 1,
              }}
            />
          ))}
        </div>
      ) : (
        <>
          {Array(data.tokens ?? 0)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                style={{
                  minHeight: "12px",
                  minWidth: "12px",
                  borderRadius: "100%",
                  background: data.tokenColor ?? "var(--r4pm-node-text)",
                }}
              ></div>
            ))}
          {Array(data.finalTokens ?? 0)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                style={{
                  minWidth: "10px",
                  minHeight: "10px",
                  borderRadius: "2px",
                  background: data.tokenColor ?? "var(--r4pm-node-text)",
                  opacity: 0.2,
                }}
              ></div>
            ))}
        </>
      )}
      {!readOnly && (
        <div className="nodrag pn-marking-stepper" onClick={(e) => e.stopPropagation()}>
          {(["tokens", "finalTokens"] as const).map((field) => (
            <div
              key={field}
              className="pn-step-row"
              title={`${field === "tokens" ? "Initial" : "Final"} marking`}
            >
              <span className="pn-step-label">{field === "tokens" ? "init" : "final"}</span>
              <button type="button" className="pn-step-btn" onClick={() => bump(field, -1)}>
                -
              </button>
              <span className="pn-step-count">{data[field] ?? 0}</span>
              <button type="button" className="pn-step-btn" onClick={() => bump(field, 1)}>
                +
              </button>
            </div>
          ))}
        </div>
      )}
      <DeleteButton nodeID={id} />
      <div className="dragHandle" />
      <Handle onConnect={(c) => (c.sourceHandle = "place")} type="target" position={Position.Top} />
      <Handle onConnect={(c) => (c.sourceHandle = "place")} type="source" position={Position.Bottom} />
    </div>
  );
}
