import { useState } from "react";
import type { Edge } from "@xyflow/react";
import toast from "react-hot-toast";
import type { AppNode } from "./types";
import type { CoreBackend } from "../../../BackendContext";
import { useQueryClient } from "@tanstack/react-query";
import { computeNodeOutput, topologicalOrder } from "./graph";
import { getNodeType, outputNameFor } from "./helpers";

export function usePipelineExecution(
  backend: CoreBackend,
  nodes: AppNode[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>,
  pipelineId: string,
) {
  const [isRunning, setIsRunning] = useState(false);

  const queryClient = useQueryClient();

  const runPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    const toastId = toast.loading("Running pipeline...");

    try {
      setNodes((nodes) =>
        nodes.map(
          (n) =>
            ({
              ...n,
              data: { ...n.data, executionStatus: undefined, output: undefined },
            }) as AppNode,
        ),
      );

      // 2. Topological sort (pure helper; throws on a cycle)
      const sortedOrder = topologicalOrder(
        nodes.map((n) => n.id),
        edges,
      );

      const results = new Map<string, unknown>();

      for (const nodeId of sortedOrder) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? ({ ...n, data: { ...n.data, executionStatus: { status: "running" } } } as AppNode)
              : n,
          ),
        );

        try {
          // Pure data-flow (input gathering + per-type assembly) lives in `computeNodeOutput`.
          // Function nodes get a deterministic output name so re-runs overwrite the prior (hidden)
          // intermediate instead of accumulating `res_*` handles.
          const result = await computeNodeOutput(node, edges, results, backend.executeFunction, (nid) =>
            outputNameFor(pipelineId, nid),
          );

          if (node.type === "jsonView") {
            // The sink node also stores UI state: the source's return-type title (any source kind,
            // not just functions) so the output node can resolve a viewer; `hasRun` distinguishes
            // "ran, empty result" from "never run / unconnected".
            const inputEdge = edges.find((e) => e.target === nodeId);
            const srcNode = inputEdge ? nodes.find((n) => n.id === inputEdge.source) : undefined;
            const returnType = srcNode ? (getNodeType(srcNode)?.title as string | undefined) : undefined;
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? ({ ...n, data: { ...n.data, value: result, returnType, hasRun: true } } as AppNode)
                  : n,
              ),
            );
          }

          results.set(nodeId, result);

          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? ({
                    ...n,
                    data: {
                      ...n.data,
                      executionStatus: { status: "success" },
                      output: result,
                    },
                  } as AppNode)
                : n,
            ),
          );
        } catch (error: any) {
          console.error(`Error executing node ${nodeId}:`, error);
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? ({
                    ...n,
                    data: {
                      ...n.data,
                      executionStatus: { status: "error", error: error.message },
                    },
                  } as AppNode)
                : n,
            ),
          );
          throw error; // Stop execution
        }
      }
      toast.success("Pipeline executed successfully", { id: toastId });
    } catch (error: any) {
      toast.error(`Pipeline execution failed: ${error.message}`, { id: toastId });
    } finally {
      setIsRunning(false);
      // Function could have changed the available objects, so refresh that query
      queryClient.invalidateQueries({ queryKey: ["loaded-objects"] });
    }
  };

  return { runPipeline, isRunning };
}
