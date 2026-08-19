import { createContext, useContext } from "react";
import type { EditorBlueprint } from "../model";
import type { ConnectionKind } from "./connection-string";
import type {
  Blueprint,
  CompiledOcel,
  EmissionShape,
  ExtractionCatalog,
  ExtractionReport,
  SqlDialect,
  TablePreview,
  ValidationError,
} from "../types";

/** Injected backend callbacks; a missing one hides its own toolbar affordance (mirrors oc-declare's `EditCallbacks`). */
export interface BlueprintEditCallbacks {
  onDiscoverCatalog?: (connections: Record<string, string>) => Promise<ExtractionCatalog>;
  onColumnDomain?: (
    connections: Record<string, string>,
    sourceId: string,
    table: string,
    column: string,
  ) => Promise<string[]>;
  /** A few real rows of one table, for display only. Cheaper than `onColumnDomain`'s `SELECT DISTINCT` per column. */
  onTablePreview?: (
    connections: Record<string, string>,
    sourceId: string,
    table: string,
    limit?: number,
  ) => Promise<TablePreview>;
  /** A `dbcon` connection string for a file dropped on the canvas, or undefined if the host cannot open it. */
  onConnectionForDrop?: (pathOrName: string) => string | undefined;
  /** A native open dialog, resolving to an absolute path or undefined if cancelled. Absent on hosts with no filesystem, which hides the Browse affordance. */
  onPickFile?: (extensions: string[]) => Promise<string | undefined>;
  /** Per-kind availability on this host. Absent from the map = available; mapped to a string = shown but disabled, naming where it does work. */
  connectionKindAvailability?: Partial<Record<ConnectionKind, string>>;
  /** Pick a file and get back a finished connection string, for a backend with no filesystem that
   *  reads bytes into the registry and returns an `item://` string instead of a path. */
  onAddFileSource?: (extensions: string[]) => Promise<string | undefined>;
  onValidate?: (blueprint: Blueprint, catalog: ExtractionCatalog) => Promise<ValidationError[]>;
  /** `ocelHandle` is an opaque string, since this package cannot depend on @r4pm/client for a branded type.
   *  `catalog` is what the editor already discovered, so the runner need not rediscover it. */
  onRun?: (
    blueprint: Blueprint,
    connections: Record<string, string>,
    catalog: ExtractionCatalog,
  ) => Promise<{
    ocelHandle: string;
    /** Absent when the host's run path cannot produce one; left optional rather than faked with a zeroed report, which `RunPanel` would misread as "ran fine, produced nothing". */
    report?: ExtractionReport;
    /** What the host calls the resulting log in its own dataset list, shown instead of the opaque handle. */
    datasetLabel?: string;
  }>;
  /** Compiles to SQL views instead of running -- pure, no connection needed, so a host can offer this even where `onRun` is hidden. */
  onCompile?: (
    blueprint: Blueprint,
    catalog: ExtractionCatalog,
    shape: EmissionShape,
    dialect?: SqlDialect,
  ) => Promise<CompiledOcel>;
}

export interface EditContextValue {
  model: EditorBlueprint;
  mutate: (fn: (m: EditorBlueprint) => EditorBlueprint) => void;
  /** Never part of `EditorBlueprint`/`Blueprint` (spec 1.7, 2.6), so "export blueprint as JSON" can't leak a secret into it. */
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
