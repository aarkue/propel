import { Panel } from "@xyflow/react";
import { Button, Spinner } from "@r4pm/components/ui";
import { FaPlay } from "react-icons/fa";
import type { AppNode } from "./types";

interface PipelineRunPanelProps {
  runPipeline: () => void;
  isRunning: boolean;
  nodes: AppNode[];
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>;
}

export function PipelineRunPanel({ runPipeline, isRunning, nodes, setNodes }: PipelineRunPanelProps) {
  return (
    <Panel position="top-right" className="flex flex-col items-center gap-y-2">
      <Button
        onClick={runPipeline}
        disabled={nodes.length === 0 || isRunning}
        color={isRunning ? "gray" : "blue"}
      >
        {isRunning ? <Spinner loading /> : <FaPlay className="mr-1" />}
        {isRunning ? "Running..." : "Run Pipeline"}
      </Button>
      <Button
        size="2"
        variant="ghost"
        onClick={() => {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.type === "jsonView") {
                return {
                  ...n,
                  data: { ...n.data, value: undefined, executionStatus: undefined, output: undefined },
                } as AppNode;
              }
              return { ...n, data: { ...n.data, executionStatus: undefined, output: undefined } } as AppNode;
            }),
          );
        }}
        className="ml-2"
      >
        Reset
      </Button>
    </Panel>
  );
}
