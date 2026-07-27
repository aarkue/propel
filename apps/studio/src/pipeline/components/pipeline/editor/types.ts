import type { Edge } from "@xyflow/react";
import type { FunctionNode } from "../FunctionNode";
import type { ObjectNode } from "../ObjectNode";
import type { PrimitiveNode } from "../PrimitiveNode";
import type { StructNode } from "../StructNode";
import type { ViewerOutputNode } from "../ViewerOutputNode";
import type { ArrayNode } from "../ArrayNode";
import type { ArtifactNode } from "../ArtifactNode";
import type { FileImportNode } from "../FileImportNode";
import type { PresetNode } from "../PresetNode";

export type AppNode =
  | FunctionNode
  | ObjectNode
  | PrimitiveNode
  | StructNode
  | ViewerOutputNode
  | ArrayNode
  | ArtifactNode
  | FileImportNode
  | PresetNode;

/** Per node type: "embedded-input" = data.value is content to keep, "run-result" = output to strip on persist. */
export const nodeValueRole: Partial<Record<NonNullable<AppNode["type"]>, "embedded-input" | "run-result">> = {
  artifact: "embedded-input",
  preset: "embedded-input",
  fileImport: "embedded-input",
  jsonView: "run-result",
};

export interface SavedPipeline {
  name: string;
  nodes: AppNode[];
  edges: Edge[];
  createdAt: number;
}

/** A project's pipeline state: its named/saved pipelines plus the unsaved working canvas. */
export interface ProjectPipelines {
  saved: SavedPipeline[];
  draft?: { nodes: AppNode[]; edges: Edge[] };
}
