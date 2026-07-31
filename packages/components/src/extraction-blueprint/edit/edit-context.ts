import { createContext, useContext } from "react";
import type { EditorBlueprint } from "../model";
import type {
  Blueprint,
  CompiledOcel,
  EmissionShape,
  ExtractionCatalog,
  ExtractionReport,
  TablePreview,
  ValidationError,
} from "../types";

/** Injected backend callbacks; a missing one hides its own toolbar affordance (mirrors
 *  oc-declare's `EditCallbacks`). `connections` is a `Record<string,string>` (source id ->
 *  connection string) the host owns -- see `edit-context.ts`'s own header note below: connection
 *  strings are never part of `EditorBlueprint`/`Blueprint`. */
export interface BlueprintEditCallbacks {
  onDiscoverCatalog?: (connections: Record<string, string>) => Promise<ExtractionCatalog>;
  onColumnDomain?: (
    connections: Record<string, string>,
    sourceId: string,
    table: string,
    column: string,
  ) => Promise<string[]>;
  /** A few real rows of one table, for display only. Much cheaper than `onColumnDomain`, which is
   *  a `SELECT DISTINCT` per column and is the exact set the SQL compiler enumerates views from. */
  onTablePreview?: (
    connections: Record<string, string>,
    sourceId: string,
    table: string,
    limit?: number,
  ) => Promise<TablePreview>;
  /** A `dbcon` connection string for a file dropped on the canvas, or undefined if the host
   *  cannot open that file (an unknown extension, or a browser `File` with no real path).
   *  Dropping onto the canvas means "read this as data", so no disambiguation is needed. */
  onConnectionForDrop?: (pathOrName: string) => string | undefined;
  /** A native open dialog, resolving to an absolute path or undefined if cancelled. Absent where
   *  the host has no filesystem (a browser), which is what hides the Browse affordance. */
  onPickFile?: (extensions: string[]) => Promise<string | undefined>;
  onValidate?: (blueprint: Blueprint, catalog: ExtractionCatalog) => Promise<ValidationError[]>;
  /** `ocelHandle` in the result is an opaque string -- see index.tsx's header for why this package
   *  cannot type it as a branded `SlimLinkedOCELHandle` without depending on @r4pm/client.
   *
   *  `catalog` is the one the editor already discovered. Passing it lets the runner skip
   *  rediscovering every source's schema, which it otherwise does on every single run. */
  onRun?: (
    blueprint: Blueprint,
    connections: Record<string, string>,
    catalog: ExtractionCatalog,
  ) => Promise<{
    ocelHandle: string;
    /** Absent when the host's run path cannot produce one. Deliberately optional rather than
     *  something a host fakes with an empty report: zeroed counts render as "ran fine, produced
     *  nothing", which is a different and wrong claim. `RunPanel` says so instead. */
    report?: ExtractionReport;
    /** What the host called the resulting log in its own dataset list, when it keeps one. Shown
     *  instead of the opaque handle, so a successful run says where its output went. */
    datasetLabel?: string;
  }>;
  /** Compiles to SQL views instead of running -- pure, no connection needed (`extraction_compile`
   *  takes only a catalog, never `connections`), so a host can offer this even where `onRun` is
   *  hidden (no database connector feature/build). */
  onCompile?: (
    blueprint: Blueprint,
    catalog: ExtractionCatalog,
    shape: EmissionShape,
  ) => Promise<CompiledOcel>;
}

export interface EditContextValue {
  model: EditorBlueprint;
  mutate: (fn: (m: EditorBlueprint) => EditorBlueprint) => void;
  /** Connections are never part of `EditorBlueprint`/`Blueprint` (spec 1.7, 2.6: "connections are
   *  an argument, never part of the blueprint") -- held here, in the editor's own state (or the
   *  host's, via `onConnectionsChange`), so an "export blueprint as JSON" action can never
   *  accidentally serialize a secret into it. */
  connections: Record<string, string>;
  onConnectionsChange: (next: Record<string, string>) => void;
  catalog: ExtractionCatalog;
  errors: ValidationError[];
  callbacks: BlueprintEditCallbacks;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  runLayout: () => void;
  /** Open the add-child dialog with `nodeId` preselected as the row source. Called from the `+`
   *  affordance on a row-producing node, and from the canvas after a table is added. */
  onAddChild: (nodeId: string) => void;
  /** Open the configuration dialog for a Filter/Join/Union node. */
  onEditNode: (nodeId: string) => void;
  /** Open the configuration dialog for a mapping node. */
  onEditMapping: (mappingId: string) => void;
  /** Open the connections dialog. Held by the graph rather than by the toolbar, so the empty
   *  state can offer connecting a source as the first step. */
  onOpenConnections: () => void;
}

export const EditContext = createContext<EditContextValue | null>(null);

/** The active edit context, or null when the graph is read-only. */
export const useEditContext = () => useContext(EditContext);
