import { Checkbox, Text, TextField } from "@r4pm/components/ui";
import { Handle, type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { getTypeColor } from "./utils";
import { NodeWrapper } from "./NodeWrapper";

export type PrimitiveType = "string" | "integer" | "number" | "boolean";

export type PrimitiveNodeData = {
  type: PrimitiveType;
  value: any;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: any;
};

import { RxInput } from "react-icons/rx";

export type PrimitiveNode = Node<PrimitiveNodeData, "primitive">;

export function PrimitiveNode({ id, data, selected }: NodeProps<PrimitiveNode>) {
  const { type, value } = data;
  const { updateNodeData } = useReactFlow();
  const color = getTypeColor({ type });

  const updateValue = (val: any) => {
    updateNodeData(id, { value: val });
  };

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={data.executionStatus}
      title={type}
      icon={RxInput}
      minWidth="min-w-40"
      contentClassName="p-3 nodrag"
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
              <span className="opacity-75 ml-1 font-mono">({type})</span>
            </div>
          </Handle>
        </div>
      }
    >
      {type === "boolean" ? (
        <div className="flex items-center gap-2">
          <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => updateValue(checked === true)} />
          <Text size="1">{value ? "True" : "False"}</Text>
        </div>
      ) : (
        <TextField.Root
          size="1"
          value={value ?? ""}
          type={type === "string" ? "text" : "number"}
          onChange={(e) => {
            const val = e.target.value;
            if (type === "integer") {
              updateValue(parseInt(val, 10) || 0);
            } else if (type === "number") {
              updateValue(parseFloat(val) || 0);
            } else {
              updateValue(val);
            }
          }}
          placeholder={`Enter ${type}...`}
        />
      )}
    </NodeWrapper>
  );
}
