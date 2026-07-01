import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { TbFileImport } from "react-icons/tb";
import { NodeWrapper } from "./NodeWrapper";
import { getTypeColor } from "./utils";

/** An engine-owned artifact (e.g. a Petri net) sent into the pipeline by value. */
export type ArtifactNodeData = {
  value: unknown;
  returnType?: string;
  label?: string;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: unknown;
};

export type ArtifactNode = Node<ArtifactNodeData, "artifact">;

export function ArtifactNode({ data, selected }: NodeProps<ArtifactNode>) {
  const color = getTypeColor({ "x-registry-ref": data.returnType });
  return (
    <NodeWrapper
      selected={selected}
      executionStatus={data.executionStatus}
      title={data.label ?? data.returnType ?? "Artifact"}
      subtitle={data.returnType}
      icon={TbFileImport}
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
              <span className="font-semibold">Artifact</span>
              <span className="opacity-75 ml-1 font-mono">({data.returnType})</span>
            </div>
          </Handle>
        </div>
      }
    >
      <div className="text-[11px] text-gray-500 font-mono truncate">{data.returnType}</div>
    </NodeWrapper>
  );
}
