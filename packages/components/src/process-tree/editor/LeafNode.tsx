import { Handle, type Node, type NodeProps, NodeToolbar, Position } from "@xyflow/react";
import { useEffect, useState } from "react";
import { remove, setLabel, setTau } from "../tree";
import { type LeafData, useTreeEditor } from "./Editor";
import { LEAF_SIZE } from "./helpers/layout-graph";
import { InsertParentButton } from "./menus";

export default function LeafNode({ data, id, selected }: NodeProps<Node<LeafData>>) {
  const { readOnly, apply, nodeOverlay, multiSelect } = useTreeEditor();
  const ov = nodeOverlay?.(id, data);
  const onClick = ov?.onClick ?? data.onClick;
  const tau = data.activity_label.type === "Tau";
  const label = data.activity_label.type === "Activity" ? data.activity_label.value : "";

  // Editing is opt-in: an always-on input would need `nodrag`, which would swallow the drag that
  // reorders siblings. Draft is local so a keystroke does not re-derive the layout.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  useEffect(() => setDraft(label), [label]);

  // Like the Petri editor: an empty name means silent (tau); the fill tracks the draft live.
  const silent = editing ? draft === "" : tau;

  const commit = () => {
    setEditing(false);
    if (draft === "") {
      if (!tau) apply((t) => setTau(t, id, true));
    } else if (draft !== label || tau) {
      apply((t) => setLabel(t, id, draft));
    }
  };

  return (
    <>
      <NodeToolbar isVisible={!readOnly && selected && !multiSelect} position={Position.Top}>
        <div className="pt-toolbar">
          <InsertParentButton id={id} />
          <button
            type="button"
            className="pt-danger"
            title="Delete this activity"
            onClick={() => apply((t) => remove(t, id))}
          >
            ✕ Delete
          </button>
        </div>
      </NodeToolbar>
      <div
        title={
          tau
            ? "Silent (tau): double-click and type a name to make it an activity"
            : label || "Unnamed activity"
        }
        className={`node leaf-node ${selected ? "selected" : ""} ${silent ? "tau" : ""} ${
          ov?.className ?? data.className ?? ""
        }`}
        style={{
          width: LEAF_SIZE.width,
          height: LEAF_SIZE.height,
          cursor: onClick ? "pointer" : undefined,
          ...data.style,
          ...ov?.style,
        }}
        onClick={onClick}
        onDoubleClick={readOnly ? undefined : () => setEditing(true)}
      >
        {editing ? (
          <input
            ref={(el) => el?.focus()}
            className="leaf-input nodrag"
            aria-label="Activity name (empty = silent)"
            title="Empty name = silent (τ)"
            value={draft}
            placeholder="τ"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(label);
                setEditing(false);
              }
            }}
          />
        ) : tau ? (
          <span className="tau-symbol">τ</span>
        ) : (
          <span className="leaf-label">{label || (readOnly ? "" : "activity")}</span>
        )}
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    </>
  );
}
