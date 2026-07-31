// The three transform nodes (Filter/Join/Union). They differ only in accent, icon, handle layout
// and the summary they show, so they share one body here rather than being three near-identical
// files.
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { PiFunnel, PiStack, PiTreeStructure } from "react-icons/pi";
import { useEditContext } from "../edit/edit-context";
import { describeNodeOp } from "../node-summary";
import { KIND_ACCENT, NodeShell } from "./NodeShell";
import { NODE_SIZE, type BlueprintNodeData } from "./types";

function Summary({ text }: { text: string }) {
  return (
    <div className="truncate font-mono text-[10px] leading-snug opacity-85" title={text}>
      {text}
    </div>
  );
}

function handleStyle(accent: string, top?: number) {
  return {
    background: `var(--${accent}-9)`,
    borderColor: "var(--color-panel-solid)",
    ...(top === undefined ? {} : { top }),
  };
}

/** `Filter { input, condition }`: one incoming edge, one outgoing. */
export function FilterNode({ id, data, selected }: NodeProps & { data: BlueprintNodeData }) {
  const { node, errorCount } = data;
  const edit = useEditContext();
  if (node.op.type !== "filter") return null;
  const accent = KIND_ACCENT.filter;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2"
        style={handleStyle(accent)}
      />
      <NodeShell
        id={id}
        kind="filter"
        icon={<PiFunnel size={13} />}
        title={node.label || "Filter"}
        selected={selected}
        errorCount={errorCount}
        warning={node.op.input ? undefined : "No input connected"}
        width={NODE_SIZE.filter.width}
        deleteLabel="Delete filter"
        onEdit={edit ? () => edit.onEditNode(id) : undefined}
        onAddChild={edit ? () => edit.onAddChild(id) : undefined}
      >
        <Summary text={describeNodeOp(node.op)} />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2"
        style={handleStyle(accent)}
      />
    </>
  );
}

/** `Join { left, right, on }`: two incoming edges, disambiguated by two named target handles
 *  ("left"/"right") -- `onConnect` reads `connection.targetHandle` to know which field to set. */
export function JoinNode({ id, data, selected }: NodeProps & { data: BlueprintNodeData }) {
  const { node, errorCount } = data;
  const edit = useEditContext();
  if (node.op.type !== "join") return null;
  const accent = KIND_ACCENT.join;
  const missing = !node.op.left
    ? "Connect the left input"
    : !node.op.right
      ? "Connect the right input"
      : undefined;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        title="left input"
        className="!size-3 !border-2"
        style={handleStyle(accent, 20)}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="right"
        title="right input"
        className="!size-3 !border-2"
        style={handleStyle(accent, 42)}
      />
      <span className="pointer-events-none absolute -left-[18px] top-[13px] text-[9px] font-semibold opacity-55">
        L
      </span>
      <span className="pointer-events-none absolute -left-[18px] top-[35px] text-[9px] font-semibold opacity-55">
        R
      </span>
      <NodeShell
        id={id}
        kind="join"
        icon={<PiTreeStructure size={13} />}
        title={node.label || "Join"}
        selected={selected}
        errorCount={errorCount}
        warning={missing}
        width={NODE_SIZE.join.width}
        deleteLabel="Delete join"
        onEdit={edit ? () => edit.onEditNode(id) : undefined}
        onAddChild={edit ? () => edit.onAddChild(id) : undefined}
      >
        <Summary text={describeNodeOp(node.op)} />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2"
        style={handleStyle(accent)}
      />
    </>
  );
}

/** `Union { inputs }`: N incoming edges on one fan-in target handle. */
export function UnionNode({ id, data, selected }: NodeProps & { data: BlueprintNodeData }) {
  const { node, errorCount } = data;
  const edit = useEditContext();
  if (node.op.type !== "union") return null;
  const accent = KIND_ACCENT.union;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2"
        style={handleStyle(accent)}
      />
      <NodeShell
        id={id}
        kind="union"
        icon={<PiStack size={13} />}
        title={node.label || "Union"}
        selected={selected}
        errorCount={errorCount}
        warning={node.op.inputs.length < 2 ? "Connect at least two inputs" : undefined}
        width={NODE_SIZE.union.width}
        deleteLabel="Delete union"
        onEdit={edit ? () => edit.onEditNode(id) : undefined}
        onAddChild={edit ? () => edit.onAddChild(id) : undefined}
      >
        <Summary text={describeNodeOp(node.op)} />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2"
        style={handleStyle(accent)}
      />
    </>
  );
}
