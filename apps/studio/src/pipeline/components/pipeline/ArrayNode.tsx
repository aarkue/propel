import { Handle, Position, type Node, type NodeProps, useNodeConnections, useReactFlow } from "@xyflow/react";
import clsx from "clsx";
import { TbList } from "react-icons/tb";
import { IconButton } from "@r4pm/components/ui";
import { RxMinus, RxPlus } from "react-icons/rx";
import { NodeWrapper } from "./NodeWrapper";

export type ArrayNodeData = {
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: any;
  itemCount: number;
};

export type ArrayNode = Node<ArrayNodeData, "array">;

export function ArrayNode({ id, data, selected }: NodeProps<ArrayNode>) {
  const { executionStatus, itemCount } = data;
  const { updateNodeData, setEdges } = useReactFlow();

  const inConnections = useNodeConnections({
    id,
    handleType: "target",
  });

  const addItem = () => {
    updateNodeData(id, { itemCount: (itemCount || 0) + 1 });
  };

  const removeItem = () => {
    if ((itemCount || 0) > 0) {
      const lastIndex = (itemCount || 0) - 1;
      const handleId = `item-${lastIndex}`;

      setEdges((edges) => edges.filter((edge) => !(edge.target === id && edge.targetHandle === handleId)));

      updateNodeData(id, { itemCount: lastIndex });
    }
  };

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={executionStatus}
      title="Array"
      icon={TbList}
      minWidth="min-w-32"
      contentClassName="flex flex-col flex-1 gap-1"
      handles={
        <div className="absolute h-full -right-1.5 top-0 flex flex-col justify-center">
          <Handle
            type="source"
            id="output"
            position={Position.Right}
            className="relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125 bg-pink-500"
          >
            <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 left-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
              <span className="font-semibold">Array</span>
              <span className="opacity-75 ml-1 font-mono">(Array)</span>
            </div>
          </Handle>
        </div>
      }
    >
      {Array.from({ length: itemCount || 0 }).map((_, i) => {
        const isConnected = inConnections.some((c) => c.targetHandle === `item-${i}`);
        return (
          <div key={i} className="relative flex items-center group/row h-6">
            {/* Input Handle */}
            <div className="absolute -left-[19px] top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
              <Handle
                type="target"
                id={`item-${i}`}
                position={Position.Left}
                isConnectable={!isConnected}
                className={clsx(
                  "relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125",
                  isConnected ? "bg-pink-500" : "bg-gray-300",
                )}
              >
                <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 right-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
                  <span className="font-semibold">Item {i + 1}</span>
                  <span className="opacity-75 ml-1 font-mono">(Any)</span>
                </div>
              </Handle>
            </div>
            <div className="flex items-center text-xs text-gray-500 pl-1">Item {i + 1}</div>
          </div>
        );
      })}

      <div className="mt-auto mb-1 text-[10px] text-gray-400 flex items-center gap-1.5 justify-center w-full pt-2">
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          className="rounded-full w-4 h-4"
          onClick={removeItem}
          title="Remove Item"
        >
          <RxMinus />
        </IconButton>
        {itemCount || 0} items
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          className="rounded-full w-4 h-4"
          onClick={addItem}
          title="Add Item"
        >
          <RxPlus />
        </IconButton>
      </div>
    </NodeWrapper>
  );
}
