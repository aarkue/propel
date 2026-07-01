import { Handle, Position, type Node, type NodeProps, useNodeConnections } from "@xyflow/react";
import type { FunctionMeta } from "../../BackendContext";
import { getTypeColor } from "./utils";
import clsx from "clsx";
import { TbFunction } from "react-icons/tb";
import { NodeWrapper } from "./NodeWrapper";

export type FunctionNodeData = {
  functionMeta: FunctionMeta;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: any;
};

export type FunctionNode = Node<FunctionNodeData, "function">;

export function FunctionNode({ id, data, selected }: NodeProps<FunctionNode>) {
  const { functionMeta, executionStatus } = data;

  const inConnections = useNodeConnections({
    id,
    handleType: "target",
  });

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={executionStatus}
      title={functionMeta.name}
      icon={TbFunction}
      minWidth="min-w-48"
      contentClassName="space-y-3"
      handles={
        /* Output Handle */
        <div className="absolute h-full -right-1.5 top-0 flex flex-col justify-center">
          <Handle
            type="source"
            id="output"
            position={Position.Right}
            className="relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125"
            style={{ backgroundColor: getTypeColor(functionMeta.return_type) }}
          >
            <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 left-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
              <span className="font-semibold">Result</span>
              <span className="opacity-75 ml-1 font-mono">
                (
                {functionMeta.return_type["x-registry-ref"] ||
                  functionMeta.return_type.title ||
                  functionMeta.return_type.type ||
                  "Any"}
                )
              </span>
            </div>
          </Handle>
        </div>
      }
    >
      {/* Inputs */}
      {functionMeta.args.map(([argName, argSchema]) => {
        const isRequired = functionMeta.required_args.includes(argName);
        const color = getTypeColor(argSchema);
        const isConnected = inConnections.some((c) => c.targetHandle === argName);
        const typeName = argSchema["x-registry-ref"] || argSchema.type;

        return (
          <div key={argName} className="relative flex items-center justify-between group/row">
            {/* Input Handle */}
            <div className="absolute -left-[19px] top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
              <Handle
                type="target"
                id={argName}
                position={Position.Left}
                isConnectable={!isConnected}
                className={clsx(
                  "relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125",
                  !isRequired && "border-dashed!",
                )}
                style={{ backgroundColor: color }}
              >
                <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 right-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
                  <span className="font-semibold">{argName}</span>
                  <span className="opacity-75 ml-1 font-mono">({typeName})</span>
                </div>
              </Handle>
            </div>

            <div className="flex flex-col leading-tight">
              <span className={clsx("text-xs font-medium", isConnected ? "text-gray-900" : "text-gray-500")}>
                {argName}
                {isRequired && <span className="text-red-400 ml-0.5">*</span>}
              </span>
              <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{typeName}</span>
            </div>
          </div>
        );
      })}
    </NodeWrapper>
  );
}
