import { createContext } from "react";
import type { ExtendedJSONSchema, FunctionMeta, ItemKindInfo } from "@r4pm/client";
import type { ViewerRegistry } from "../viewers";

export type { ExtendedJSONSchema, FunctionMeta, ItemKindInfo };

/**
 * The backend surface the lifted pipeline calls. PipelineEditor adapts a
 * `@r4pm/client` `BackendContext` into this shape (executeFunction -> callBinding,
 * getObjectsWithType -> listObjects) and provides it via this React context.
 */
export type CoreBackend = {
  executeFunction: (functionID: string, args: unknown, opts?: { outputName?: string }) => Promise<unknown>;
  listFunctions: () => Promise<FunctionMeta[]>;
  getObjectsWithType: () => Promise<Array<[string, string]>>;
  listItemKinds: () => Promise<ItemKindInfo[]>;
  unloadObject: (id: string) => Promise<void>;
  downloadBinary: (binary: ArrayBuffer, filename: string) => Promise<void> | void;
  getArtifact: (id: string) => Promise<unknown>;
  loadArtifactBytes: (id: string, kind: string, data: Uint8Array, format: string) => Promise<void>;
  loadArtifactPath?: (id: string, kind: string, path: string) => Promise<void>;
  pickFiles?: (opts: {
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }) => Promise<string[] | null>;
};

const THROW_NO_BACKEND = () => {
  throw new Error("PipelineEditor: no backend provided. Pass a `backend` prop.");
};

const PLACEHOLDER_BACKEND: CoreBackend = {
  executeFunction: THROW_NO_BACKEND,
  listFunctions: THROW_NO_BACKEND,
  getObjectsWithType: THROW_NO_BACKEND,
  listItemKinds: THROW_NO_BACKEND,
  unloadObject: THROW_NO_BACKEND,
  downloadBinary: THROW_NO_BACKEND,
  getArtifact: THROW_NO_BACKEND,
  loadArtifactBytes: THROW_NO_BACKEND,
};

export const BackendContext = createContext<CoreBackend>(PLACEHOLDER_BACKEND);

/** Viewer registry used by output nodes to resolve a viewer for a result type. */
export const ViewerRegistryContext = createContext<ViewerRegistry | undefined>(undefined);

/** Optional bridge: open a node's output as a standalone viewer panel in the host. */
export type OpenAsPanelFn = (returnType: string | undefined, data: unknown) => void;
export const OpenAsPanelContext = createContext<OpenAsPanelFn | undefined>(undefined);
