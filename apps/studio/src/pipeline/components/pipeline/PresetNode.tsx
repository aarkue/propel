import { Handle, type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { useEffect, useState } from "react";
import { IconButton } from "@r4pm/components/ui";
import { TbAdjustments, TbBraces, TbCheck, TbCopy } from "react-icons/tb";
import { NodeWrapper } from "./NodeWrapper";
import { getTypeColor, summarizePreset } from "./utils";

/** A by-value config input recorded from lineage (a non-source function arg passed as a literal). */
export type PresetNodeData = {
  value: unknown;
  argType?: string;
  label?: string;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: unknown;
};

export type PresetNode = Node<PresetNodeData, "preset">;

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export function PresetNode({ id, data, selected }: NodeProps<PresetNode>) {
  const { updateNodeData } = useReactFlow();
  const color = getTypeColor({ type: data.argType });

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => pretty(data.value));
  const [invalid, setInvalid] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editing) setText(pretty(data.value));
  }, [data.value, editing]);

  const commit = (next: string) => {
    setText(next);
    try {
      updateNodeData(id, { value: JSON.parse(next) });
      setInvalid(false);
    } catch {
      setInvalid(true); // value stays at the last valid parse
    }
  };

  const copy = () => {
    void navigator.clipboard?.writeText(pretty(data.value)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={data.executionStatus}
      title={data.label ?? "Config"}
      subtitle={data.argType}
      icon={TbAdjustments}
      minWidth="min-w-40"
      contentClassName="p-3 space-y-2"
      handles={
        <div className="absolute h-full -right-1.5 top-0 flex flex-col justify-center">
          <Handle
            type="source"
            id="output"
            position={Position.Right}
            className="relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125"
            style={{ backgroundColor: color }}
          >
            <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 left-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
              <span className="font-semibold">Value</span>
              {data.argType && <span className="opacity-75 ml-1 font-mono">({data.argType})</span>}
            </div>
          </Handle>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-sky-600 truncate max-w-40" title={pretty(data.value)}>
          {summarizePreset(data.value)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton size="1" variant="ghost" onClick={copy} title="Copy JSON">
            {copied ? <TbCheck /> : <TbCopy />}
          </IconButton>
          <IconButton
            size="1"
            variant={editing ? "solid" : "ghost"}
            onClick={() => setEditing((e) => !e)}
            title="Edit as JSON"
          >
            <TbBraces />
          </IconButton>
        </div>
      </div>

      {editing && (
        <textarea
          className={`nodrag nowheel w-64 h-40 resize-none rounded border p-2 font-mono text-[11px] leading-tight focus:outline-none ${
            invalid ? "border-red-400 bg-red-50" : "border-gray-200"
          }`}
          spellCheck={false}
          value={text}
          onChange={(e) => commit(e.target.value)}
        />
      )}
      {editing && invalid && <div className="text-[10px] text-red-500">Invalid JSON - not applied.</div>}
    </NodeWrapper>
  );
}
