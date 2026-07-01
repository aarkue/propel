import type { Edge } from "@xyflow/react";
import type { FunctionNode } from "../FunctionNode";
import type { ObjectNode } from "../ObjectNode";
import type { PrimitiveNode } from "../PrimitiveNode";
import type { StructNode } from "../StructNode";
import type { ViewerOutputNode } from "../ViewerOutputNode";
import type { ArrayNode } from "../ArrayNode";
import type { ArtifactNode } from "../ArtifactNode";
import type { FileImportNode } from "../FileImportNode";

export type AppNode =
  | FunctionNode
  | ObjectNode
  | PrimitiveNode
  | StructNode
  | ViewerOutputNode
  | ArrayNode
  | ArtifactNode
  | FileImportNode;

export interface SavedPipeline {
  name: string;
  nodes: AppNode[];
  edges: Edge[];
  createdAt: number;
}
