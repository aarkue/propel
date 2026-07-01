import type { ExtendedJSONSchema } from "../../../BackendContext";
import type { AppNode } from "./types";

/** Deterministic registry id for a pipeline node's output, so a re-run overwrites the prior
 *  intermediate instead of minting a fresh `res_*` handle each time. The `__` join just keeps the
 *  id unique per (pipeline, node); the engine treats the whole string as an opaque handle name. */
export const outputNameFor = (pipelineId: string, nodeId: string): string => `${pipelineId}__${nodeId}`;

export const getNodeType = (node: AppNode): ExtendedJSONSchema | undefined => {
  if (node.type === "function") {
    return node.data.functionMeta.return_type;
  } else if (node.type === "object") {
    return { type: "string", "x-registry-ref": node.data.type };
  } else if (node.type === "primitive") {
    return { type: node.data.type };
  } else if (node.type === "struct") {
    return node.data.schema;
  } else if (node.type === "array") {
    return { type: "array" };
  } else if (node.type === "artifact") {
    return { type: "object", title: node.data.returnType } as ExtendedJSONSchema;
  } else if (node.type === "fileImport") {
    return { type: "object", title: node.data.returnType } as ExtendedJSONSchema;
  }
  return undefined;
};

export const getNodeInputs = (node: AppNode): ExtendedJSONSchema[] => {
  if (node.type === "function") {
    return node.data.functionMeta.args.map(([, schema]) => schema);
  } else if (node.type === "struct") {
    if (!node.data.schema.properties) return [];
    return Object.values(node.data.schema.properties) as ExtendedJSONSchema[];
  } else if (node.type === "jsonView") {
    // JsonView accepts anything
    return [{ type: "any" as any }];
  }
  return [];
};

export const areSchemasEqual = (a: ExtendedJSONSchema, b: ExtendedJSONSchema) => {
  return a.type === b.type && a["x-registry-ref"] === b["x-registry-ref"];
};

export const areInputsEqual = (a: ExtendedJSONSchema[], b: ExtendedJSONSchema[]) => {
  if (a.length !== b.length) return false;
  return a.every((s, i) => areSchemasEqual(s, b[i]));
};
