import { Select } from "@r4pm/components/ui";
import { Handle, type Node, type NodeProps, Position, useNodeConnections, useReactFlow } from "@xyflow/react";
import clsx from "clsx";
import { TbBraces } from "react-icons/tb";
import type { ExtendedJSONSchema } from "../../BackendContext";
import { NodeWrapper } from "./NodeWrapper";

export type StructNodeData = {
  name: string;
  schema: ExtendedJSONSchema;
  value?: any; // For Enums
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: any;
};

export type StructNode = Node<StructNodeData, "struct">;

export function StructNode({ id, data, selected }: NodeProps<StructNode>) {
  const { schema, executionStatus, value } = data;
  const { updateNodeData } = useReactFlow();
  const isEnum = !!schema.oneOf;
  const prefixItems = schema.prefixItems;
  const isTuple = !!prefixItems;

  const inConnections = useNodeConnections({
    id,
    handleType: "target",
  });

  const handleEnumChange = (val: string) => {
    updateNodeData(id, { value: val });
  };

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={executionStatus}
      title={schema.title || "Struct"}
      subtitle={Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type || "object"}
      icon={TbBraces}
      contentClassName="space-y-3"
      handles={
        <div className="absolute h-full -right-1.5 top-0 flex flex-col justify-center">
          <Handle
            type="source"
            id="output"
            position={Position.Right}
            className="relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125 bg-blue-500"
          >
            <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 left-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
              <span className="font-semibold">Output</span>
              <span className="opacity-75 ml-1 font-mono">({schema.title || "Object"})</span>
            </div>
          </Handle>
        </div>
      }
    >
      {/* Description */}
      {schema.description && (
        <div className="text-[10px] text-gray-600 font-light leading-2.5 max-w-64 whitespace-break-spaces">
          {schema.description}
        </div>
      )}

      {/* Enum Selection */}
      {isEnum && (
        <div>
          <Select.Root value={value || ""} onValueChange={handleEnumChange} size="1">
            <Select.Trigger placeholder="Select value..." variant="soft" className="w-full" />
            <Select.Content>
              {schema.oneOf?.map((option: any) => (
                <Select.Item key={option.const} value={option.const}>
                  {option.title || option.const}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>{" "}
          <p className="text-[10px] *: text-gray-600  leading-2.5 mt-1 max-w-64 whitespace-break-spaces">
            {(schema.oneOf?.find((v: any) => v.const === value) as any)?.description}
          </p>
        </div>
      )}

      {/* Tuple Items */}
      {isTuple &&
        prefixItems?.map((itemSchema, index) => {
          const isConnected = inConnections.some((c) => c.targetHandle === `item-${index}`);
          return (
            <div key={index} className="relative flex items-center justify-between group/row">
              {/* Input Handle */}
              <div className="absolute -left-[19px] top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                <Handle
                  type="target"
                  id={`item-${index}`}
                  position={Position.Left}
                  isConnectable={!isConnected}
                  className={clsx(
                    "relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125",
                    isConnected ? "bg-blue-500" : "bg-gray-300",
                  )}
                >
                  <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 right-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
                    <span className="font-semibold">Item {index}</span>
                    <span className="opacity-75 ml-1 font-mono">({itemSchema.title || itemSchema.type})</span>
                  </div>
                </Handle>
              </div>
              <div className="flex flex-col leading-tight">
                <span
                  className={clsx("text-xs font-medium", isConnected ? "text-gray-900" : "text-gray-500")}
                >
                  Item {index}
                </span>
                <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                  {itemSchema.title || itemSchema.type}
                </span>
              </div>
            </div>
          );
        })}

      {/* Properties */}
      {!isEnum &&
        !isTuple &&
        Object.entries(schema.properties || {}).map(([key, propSchema]) => {
          const isConnected = inConnections.some((c) => c.targetHandle === key);
          const isRequired = schema.required?.includes(key);

          return (
            <div key={key} className="relative flex items-center justify-between group/row">
              {/* Input Handle */}
              <div className="absolute -left-[19px] top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                <Handle
                  type="target"
                  id={key}
                  position={Position.Left}
                  isConnectable={!isConnected}
                  className={clsx(
                    "relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125",
                    isConnected ? "bg-blue-500" : "bg-gray-300",
                  )}
                >
                  <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 right-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
                    <span className="font-semibold">{key}</span>
                    <span className="opacity-75 ml-1 font-mono">
                      ({(propSchema as any).title || (propSchema as any).type})
                    </span>
                  </div>
                </Handle>
              </div>

              <div className="flex flex-col leading-tight">
                <span
                  className={clsx("text-xs font-medium", isConnected ? "text-gray-900" : "text-gray-500")}
                >
                  {key}
                  {isRequired && <span className="text-red-400 ml-0.5">*</span>}
                </span>
                <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                  {(propSchema as any).title || (propSchema as any).type}
                </span>
              </div>
            </div>
          );
        })}
    </NodeWrapper>
  );
}
