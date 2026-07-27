import { nodeValueRole, type AppNode } from "./components/pipeline/editor/types";

/** Strip per-run outputs, run-result `data.value` (see `nodeValueRole`), and React Flow interaction fields; user input/layout fields are kept. */
export function slimNode(n: AppNode): AppNode {
  const data = { ...(n.data as Record<string, unknown>) };
  delete data.output;
  delete data.executionStatus;
  if (nodeValueRole[n.type as keyof typeof nodeValueRole] === "run-result") {
    delete data.value;
    delete data.returnType;
    delete data.hasRun;
  }
  const { selected: _s, dragging: _d, resizing: _r, measured: _m, ...rest } = n as Record<string, unknown>;
  return { ...rest, data } as AppNode;
}
