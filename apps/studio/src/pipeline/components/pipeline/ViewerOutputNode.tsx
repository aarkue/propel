import { IconButton, ScrollArea, Select } from "@r4pm/components/ui";
import { Handle, type Node, type NodeProps, NodeResizer, Position, useNodeConnections } from "@xyflow/react";
import { useContext, useMemo, useState } from "react";
import { RxMagnifyingGlass, RxOpenInNewWindow } from "react-icons/rx";
import { resolveAllViewersForReturnType } from "../../../viewers";
import { PetriNetActions } from "../../../vis/components/PetriNetActions";
import { ViewerExportFrame } from "@r4pm/components";
import { BackendContext, ViewerRegistryContext, OpenAsPanelContext } from "../../BackendContext";
import { NodeWrapper } from "./NodeWrapper";
import { getTypeColor } from "./utils";

export type ViewerOutputNodeData = {
  value?: any;
  /** Return-type title of the producing source node, used to resolve a viewer. */
  returnType?: string;
  /** True once the pipeline has executed this node (distinguishes "ran, empty" from "never run"). */
  hasRun?: boolean;
  executionStatus?: {
    status: "idle" | "running" | "success" | "error";
    error?: string;
  };
  output?: any;
};

export type ViewerOutputNode = Node<ViewerOutputNodeData, "jsonView">;

export function ViewerOutputNode({ data, id, selected }: NodeProps<ViewerOutputNode>) {
  const { value, returnType, hasRun } = data;
  const color = getTypeColor({ type: "any" });
  const inConnections = useNodeConnections({ id, handleType: "target" });
  const registry = useContext(ViewerRegistryContext);
  const openAsPanel = useContext(OpenAsPanelContext);
  const backend = useContext(BackendContext);
  // All viewers that can render this output; the user picks which one (multiple per result).
  const viewers = useMemo(
    () => (registry && returnType ? resolveAllViewersForReturnType(registry, returnType) : []),
    [registry, returnType],
  );
  const [pickedId, setPickedId] = useState<string>();
  const viewer = viewers.find((v) => v.id === pickedId) ?? viewers[0];
  const Viewer = viewer?.component;

  // Memoized so reactflow drags (position/selection re-renders) don't re-render the (heavy) viewer.
  const body = useMemo(() => {
    if (!hasRun) return <span className="text-gray-400 italic text-[10px]">Connect an input and run</span>;
    if (value === undefined)
      return <span className="text-gray-400 italic text-[10px]">No data (empty result)</span>;
    if (Viewer) {
      // nodrag + nowheel so the inner viewer (often its own ReactFlow) captures
      // BOTH pan (drag) and zoom (wheel) instead of the pipeline grabbing the drag.
      return (
        <div
          className="nodrag nowheel"
          style={{ width: "100%", height: "100%", flex: 1, display: "flex", flexDirection: "column" }}
        >
          <ViewerExportFrame
            filename={(viewer?.title ?? "output").replace(/\s+/g, "-").toLowerCase()}
            onSave={(d, f) => backend.downloadBinary(d.buffer as ArrayBuffer, f)}
            style={{ width: "100%", height: "100%", flex: 1, display: "flex", flexDirection: "column" }}
            showMenu={true}
          >
            <Viewer data={value} returnType={returnType} />
          </ViewerExportFrame>
        </div>
      );
    }
    return (
      <ScrollArea
        type="auto"
        scrollbars="vertical"
        className="nowheel w-full bg-gray-50 rounded p-2 border border-gray-100 h-32!"
      >
        <pre className="text-[10px] font-mono whitespace-pre-wrap break-all nowheel">
          {JSON.stringify(value, null, 2)}
        </pre>
      </ScrollArea>
    );
  }, [value, hasRun, Viewer, viewer?.title, returnType, backend]);

  return (
    <NodeWrapper
      selected={selected}
      executionStatus={data.executionStatus}
      title={viewer ? viewer.title : "Output"}
      icon={RxMagnifyingGlass}
      minWidth=""
      fill={!!Viewer}
      style={Viewer ? { minWidth: 420, minHeight: 280 } : undefined}
      resizer={Viewer ? <NodeResizer minWidth={420} minHeight={280} isVisible={!!selected} /> : undefined}
      headerRight={
        viewers.length > 1 ? (
          <Select.Root size="1" value={viewer?.id} onValueChange={setPickedId}>
            <Select.Trigger variant="soft" className="nodrag" title="Choose visualization" />
            <Select.Content>
              {viewers.map((v) => (
                <Select.Item key={v.id} value={v.id}>
                  {v.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        ) : undefined
      }
      handles={
        <div className="absolute h-full -left-1.5 top-0 flex flex-col justify-center">
          <Handle
            type="target"
            id="input"
            isConnectable={inConnections.length === 0}
            position={Position.Left}
            className="relative! top-0! transform-none! w-3! h-3! border-2! border-white! transition-transform hover:scale-125"
            style={{ backgroundColor: color }}
          >
            <div className="hidden group-hover:block absolute top-1/2 -translate-y-1/2 right-4 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-sm border border-gray-700">
              <span className="font-semibold">Input</span>
            </div>
          </Handle>
        </div>
      }
    >
      {body}
      {value !== undefined && (
        <div className="absolute bottom-4 right-4 flex gap-1">
          {returnType === "PetriNet" && <PetriNetActions net={value} />}
          {openAsPanel && (
            <IconButton
              size="1"
              variant="soft"
              color="gray"
              onClick={() => openAsPanel(returnType, value)}
              title="Open as panel"
            >
              <RxOpenInNewWindow className="size-3" />
            </IconButton>
          )}
        </div>
      )}
    </NodeWrapper>
  );
}
