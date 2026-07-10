import { Select } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { Handle, type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { useCallback, useContext, useEffect } from "react";
import { TbDatabase } from "react-icons/tb";
import { BackendContext } from "../../BackendContext";
import { useDatasets } from "../../../stores";
import { NodeWrapper } from "./NodeWrapper";
import { getTypeColor } from "./utils";

export type ObjectNodeData = {
  type: string;
  selectedObject?: string;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: any;
};

export type ObjectNode = Node<ObjectNodeData, "object">;

export function ObjectNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const { type, selectedObject } = data;
  const { updateNodeData } = useReactFlow();
  const backend = useContext(BackendContext);
  const datasets = useDatasets((s) => s.datasets);
  const labelFor = (oid: string) => datasets.find((d) => d.id === oid)?.label ?? oid;

  const availableObjectsQuery = useQuery({
    queryKey: ["loaded-objects", `loaded-${type}`],
    queryFn: () =>
      backend.getObjectsWithType().then((objs) => objs.filter(([, t]) => t === type).map(([name]) => name)),
  });

  const updateSelection = useCallback(
    (val: string) => {
      updateNodeData(id, { selectedObject: val });
    },
    [id, updateNodeData],
  );

  // Auto-select first available if none selected
  useEffect(() => {
    if (availableObjectsQuery.data && availableObjectsQuery.data.length > 0 && !selectedObject) {
      updateSelection(availableObjectsQuery.data[0]);
    }
  }, [availableObjectsQuery.data, selectedObject, updateSelection]);

  const color = getTypeColor({ type: "string", "x-registry-ref": type });

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={data.executionStatus}
      title="Object Source"
      subtitle={type}
      icon={TbDatabase}
      minWidth="min-w-48"
      contentClassName="p-3"
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
              <span className="font-semibold">Object</span>
              <span className="opacity-75 ml-1 font-mono">({type})</span>
            </div>
          </Handle>
        </div>
      }
    >
      <Select.Root
        value={selectedObject || ""}
        onValueChange={updateSelection}
        size="1"
        disabled={!availableObjectsQuery.data?.length}
      >
        <Select.Trigger placeholder="Select object..." variant="soft" className="w-full" />
        <Select.Content>
          {availableObjectsQuery.data?.map((name) => (
            <Select.Item key={name} value={name}>
              {labelFor(name)}
            </Select.Item>
          ))}
          {availableObjectsQuery.data?.length === 0 && (
            <Select.Item value="none" disabled>
              No objects found
            </Select.Item>
          )}
        </Select.Content>
      </Select.Root>
    </NodeWrapper>
  );
}
