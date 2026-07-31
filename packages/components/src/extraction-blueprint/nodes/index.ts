import type { NodeTypes } from "@xyflow/react";
import { memo } from "react";
import { MappingNode } from "./MappingNode";
import { SourceNode } from "./SourceNode";
import { FilterNode, JoinNode, UnionNode } from "./TransformNodes";

export { SourceNode, FilterNode, JoinNode, UnionNode, MappingNode };
export { NodeShell, SummaryRows, KIND_ACCENT } from "./NodeShell";
export type { NodeKind } from "./NodeShell";
export type { BlueprintNodeData, MappingNodeData } from "./types";
export { NODE_SIZE } from "./types";

/** React Flow re-renders every registered node whenever the nodes array changes identity, which it
 *  does on each edit; `memo` skips the ones whose own props did not change. (Only a partial win:
 *  these components read `useEditContext`, and a context change re-renders them regardless.) */
export const blueprintNodeTypes: NodeTypes = {
  source: memo(SourceNode),
  filter: memo(FilterNode),
  join: memo(JoinNode),
  union: memo(UnionNode),
  mapping: memo(MappingNode),
};
