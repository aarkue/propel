import { useContext, useEffect, useState } from "react";
import { Handle, type NodeProps, Position, useReactFlow, type Node } from "@xyflow/react";
import DeleteButton from "./DeleteButton";
import { EditorPropsContext, type TransitionData } from "./Editor";
import { TRANSITION_SIZE } from "./helpers/layout-graph";

export default function TransitionNode({ data, id, selected }: NodeProps<Node<TransitionData>>) {
  const { setNodes } = useReactFlow();
  const { readOnly } = useContext(EditorPropsContext);
  const [editMode, setEditMode] = useState(false);
  const [invisible, setInvisible] = useState(data.label === undefined || data.label === "");
  useEffect(() => {
    setInvisible(data.label === undefined || data.label === "");
  }, [data.label]);

  function applyNameEdit(
    ev: React.FocusEvent<HTMLDivElement, Element> | React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) {
    const newLabel = ev.currentTarget.innerText.replace("\n", "");
    setEditMode(false);
    setNodes((nodes) => {
      const newNodes = [...nodes];
      newNodes.map((n) => {
        if (n.id === id) {
          n.data = { label: newLabel || undefined };
        }
        return n;
      });
      return newNodes;
    });
  }
  return (
    <div
      title={data.label ?? "Invisible"}
      className={`node transition-node ${selected ? "selected" : ""} ${data.className ?? ""}`}
      style={{
        width: TRANSITION_SIZE.width,
        height: TRANSITION_SIZE.height,
        backgroundColor: invisible ? "var(--r4pm-node-text)" : undefined,
        cursor: data.onClick ? "pointer" : undefined,
        ...data.style,
      }}
      onClick={data.onClick}
      onContextMenu={data.onContextMenu}
    >
      <DeleteButton nodeID={id} />
      <div className="dragHandle" />
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          justifyContent: "center",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        {data.renderContent ? (
          data.renderContent()
        ) : (
          <div
            contentEditable={readOnly !== true && editMode}
            suppressContentEditableWarning={true}
            onInput={(ev) => {
              setInvisible(ev.currentTarget.innerText.replace("\n", "") === "");
            }}
            onKeyDownCapture={
              readOnly
                ? undefined
                : (ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      ev.stopPropagation();
                      ev.currentTarget.blur();
                    }
                  }
            }
            onDoubleClickCapture={
              readOnly
                ? undefined
                : (ev) => {
                    if (editMode) {
                      applyNameEdit(ev);
                    } else {
                      setEditMode(true);
                      const el = ev.currentTarget;
                      setTimeout(() => {
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(el);
                        if (sel) {
                          sel.removeAllRanges();
                          sel.addRange(range);
                        }
                      }, 100);
                    }
                  }
            }
            onBlur={(ev) => {
              applyNameEdit(ev);
            }}
            style={{
              overflowWrap: "break-word",
              cursor: editMode ? "text" : undefined,
              overflowY: "hidden",
              padding: "0 0 0 0 ",
              margin: "0",
              maxWidth: "6rem",
              minWidth: "4rem",
              minHeight: "1.5rem",
              display: "block",
              marginInline: "auto",
              textAlign: "center",
              zIndex: 10,
              position: "relative",
              fontWeight: 500,
              fontSize: `${Math.min(Math.max(300 / (data.label?.length ?? 1), 8), 14)}px`,
            }}
          >
            {data.label}
          </div>
        )}
      </div>
      <Handle onConnect={(c) => (c.sourceHandle = "transition")} type="source" position={Position.Bottom} />
      <Handle onConnect={(c) => (c.sourceHandle = "transition")} type="target" position={Position.Top} />
    </div>
  );
}
