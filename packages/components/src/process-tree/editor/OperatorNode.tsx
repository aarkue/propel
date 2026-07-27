import { Handle, type Node, type NodeProps, NodeToolbar, Position } from "@xyflow/react";
import {
  OPERATOR_SYMBOL,
  OPERATOR_TITLE,
  OPERATOR_TYPES,
  type OperatorType,
  remove,
  setOperator,
} from "../tree";
import { type OperatorData, useTreeEditor } from "./Editor";
import { OPERATOR_SIZE } from "./helpers/layout-graph";
import { AddChildSlot, InsertParentButton } from "./menus";

export default function OperatorNode({ data, id, selected }: NodeProps<Node<OperatorData>>) {
  const { readOnly, apply, nodeOverlay, dropTarget, multiSelect } = useTreeEditor();
  const ov = nodeOverlay?.(id, data);
  const onClick = ov?.onClick ?? data.onClick;

  return (
    <>
      <NodeToolbar isVisible={!readOnly && selected && !multiSelect} position={Position.Top}>
        <div className="pt-toolbar">
          <div className="pt-segmented">
            {OPERATOR_TYPES.map((op) => (
              <button
                key={op}
                type="button"
                title={OPERATOR_TITLE[op]}
                aria-pressed={op === data.operator_type}
                className={op === data.operator_type ? "active" : ""}
                onClick={() => apply((t) => setOperator(t, id, op as OperatorType))}
              >
                {OPERATOR_SYMBOL[op]}
              </button>
            ))}
          </div>
          <InsertParentButton id={id} />
          <button
            type="button"
            className="pt-danger"
            title="Delete this operator and everything below it"
            onClick={() => apply((t) => remove(t, id))}
          >
            ✕ Delete
          </button>
        </div>
      </NodeToolbar>
      <div
        title={`${OPERATOR_TITLE[data.operator_type]}${data.invalid ? " (needs more children)" : ""}`}
        className={`node operator-node ${selected ? "selected" : ""} ${data.invalid ? "invalid" : ""} ${
          dropTarget === id ? "drop-target" : ""
        } ${ov?.className ?? data.className ?? ""}`}
        style={{
          width: OPERATOR_SIZE.width,
          height: OPERATOR_SIZE.height,
          cursor: onClick ? "pointer" : undefined,
          ...data.style,
          ...ov?.style,
        }}
        onClick={onClick}
      >
        <span className="operator-symbol">{OPERATOR_SYMBOL[data.operator_type]}</span>
        {data.invalid && (
          <span className="invalid-badge" title="Loop needs 2 children; other operators need at least 1">
            !
          </span>
        )}
        {!readOnly && <AddChildSlot id={id} />}
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    </>
  );
}
