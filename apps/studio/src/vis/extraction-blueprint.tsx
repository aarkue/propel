import { useMemo } from "react";
import { PiDatabase } from "react-icons/pi";
import type { IDockviewPanelProps } from "dockview";
import type {
  Blueprint as ClientBlueprint,
  ExtractionCatalog as ClientExtractionCatalog,
} from "@r4pm/client";
import {
  BlueprintGraph,
  newBlueprint,
  type BlueprintEditCallbacks,
  type Blueprint as ComponentBlueprint,
  type CompiledOcel as ComponentCompiledOcel,
  type EditorBlueprint,
  type EmissionShape as ComponentEmissionShape,
  type ExtractionCatalog as ComponentExtractionCatalog,
  type ExtractionReport as ComponentExtractionReport,
  type TablePreview as ComponentTablePreview,
  type ValidationError as ComponentValidationError,
} from "@r4pm/components/extraction-blueprint";
import { backend } from "../backends";
import { connectionForDroppedText, routeConnections } from "../extraction-sources";
import { uniqueDatasetLabel, useDatasets } from "../stores";
import { usePanelDraft, usePanelState } from "../panels/panel-state";
import { definePanel } from "./define-vis";

/**
 * `@r4pm/components` hand-mirrors the Blueprint model (see extraction-blueprint/types.ts's header)
 * so the package has no `@r4pm/client` dependency and stays usable by OCPQ too. Both sides agree on
 * the same serde/schemars JSON shape (the same Rust types generate both), so crossing this seam is
 * a type-level bridge only, never a data transform -- see the plan's Task B9/Part C notes.
 */
const asClientBlueprint = (b: ComponentBlueprint) => b as unknown as ClientBlueprint;

/** Returned when nothing is connected. A single frozen value, because `BlueprintGraph` keys a
 *  column-resolution cache on the catalog's identity. */
const NO_CATALOG = Object.freeze({ tables: {}, domains: {} }) as ComponentExtractionCatalog;

function ExtractionBlueprintPanel(props: IDockviewPanelProps) {
  // Both live in dockview `params`, so a blueprint survives closing the panel, switching layouts
  // and reloading -- captured by the same `toJSON()` that persists every other panel's config.
  // The blueprint goes through `usePanelDraft` rather than `usePanelState` because dragging a node
  // fires per frame, and serialising the whole document into params that often is wasteful.
  //
  // Connection strings ride along. They are session config, not part of the blueprint (spec 1.7,
  // 2.6), and this is not a file anyone shares -- but it does land in the saved session, so a
  // password typed here is stored with the layout.
  const [value, setValue] = usePanelDraft<EditorBlueprint>(props, "blueprint", newBlueprint());
  const [connections, setConnections] = usePanelState<Record<string, string>>(props, "connections", {});
  // Three tiers, not two. `extraction_validate`/`extraction_compile` are pure and work anywhere.
  // Sources held in the registry (`item://`) need only `ocel-sqlite`, so they work on wasm too --
  // and there they are the only option, since a browser has no filesystem. Connection strings
  // need `process_mining`'s `extraction-dbcon` feature, which the webserver/tauri backends
  // enable and the wasm build does not.
  const callbacks: BlueprintEditCallbacks = useMemo(() => {
    const discoverItems = async (sources: Record<string, string>) => {
      const catalog = await backend.callBinding(
        "process_mining::bindings::extraction_bindings::extraction_discover_catalog_items",
        { sources },
      );
      return catalog as unknown as ComponentExtractionCatalog;
    };

    /** Run against registry-held sources. Available on every backend, wasm included. */
    const runItems = async (
      blueprint: ComponentBlueprint,
      sources: Record<string, string>,
      catalog: ComponentExtractionCatalog,
    ) => {
      const ocelHandle = await backend.callBinding(
        "process_mining::bindings::extraction_bindings::extraction_run_items",
        {
          blueprint: asClientBlueprint(blueprint),
          sources,
          catalog: catalog as unknown as ClientExtractionCatalog,
        },
      );
      // No report: that binding returns the log itself, and a binding returns either a big type or
      // plain data, never both. Reported as absent rather than as an empty report -- an
      // `ExtractionReport` of zeroes would read as "ran fine, produced nothing".
      const id = ocelHandle as unknown as string;
      const datasetLabel = uniqueDatasetLabel("Extracted OCEL");
      useDatasets.getState().addDataset({ id, kind: "SlimLinkedOCEL", label: datasetLabel });
      useDatasets.getState().renameDataset(id, datasetLabel);
      return { ocelHandle: id, datasetLabel };
    };

    const NO_CONNECTOR =
      "This build has no database connector, so it cannot open a connection string. Drop the file itself to read it from memory instead.";

    const base: BlueprintEditCallbacks = {
      onDiscoverCatalog: async (conns) => {
        const route = routeConnections(conns);
        if (route.kind === "none") return NO_CATALOG;
        if (route.kind === "items") return discoverItems(route.sources);
        throw new Error(NO_CONNECTOR);
      },
      // Available here too: `extraction_run_items` reads bytes the registry already holds, so a
      // build with no connector -- and no filesystem -- can still run a blueprint end to end.
      onRun: async (blueprint, connections, catalog) => {
        const route = routeConnections(connections);
        if (route.kind === "none") throw new Error("Connect a source before running.");
        if (route.kind === "connections") throw new Error(NO_CONNECTOR);
        return runItems(blueprint, route.sources, catalog);
      },
      onValidate: async (blueprint, catalog) => {
        const errors = await backend.callBinding(
          "process_mining::bindings::extraction_bindings::extraction_validate",
          {
            blueprint: asClientBlueprint(blueprint),
            catalog: catalog as unknown as ComponentExtractionCatalog,
          },
        );
        return errors as unknown as ComponentValidationError[];
      },
      onCompile: async (blueprint, catalog, shape) => {
        const compiled = await backend.callBinding(
          "process_mining::bindings::extraction_bindings::extraction_compile",
          {
            blueprint: asClientBlueprint(blueprint),
            catalog: catalog as unknown as ComponentExtractionCatalog,
            shape: shape as unknown as ComponentEmissionShape,
          },
        );
        return compiled as unknown as ComponentCompiledOcel;
      },
    };
    if (backend.kind === "wasm") return base;
    return {
      ...base,
      onDiscoverCatalog: async (conns) => {
        const route = routeConnections(conns);
        if (route.kind === "none") return NO_CATALOG;
        if (route.kind === "items") return discoverItems(route.sources);
        const catalog = await backend.callBinding(
          "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog",
          { connections: route.connections },
        );
        return catalog as unknown as ComponentExtractionCatalog;
      },
      onColumnDomain: (connections, sourceId, table, column) =>
        backend.callBinding("process_mining::bindings::extraction_dbcon_bindings::extraction_column_domain", {
          connections,
          source_id: sourceId,
          table,
          column,
        }),
      // A native path is opened where it lies; a browser `File` has only a name, and its
      // bytes route is the picker's "as a data source" option instead.
      onConnectionForDrop: connectionForDroppedText,
      onPickFile: backend.pickFiles
        ? async (extensions) => {
            const paths = await backend.pickFiles!({
              multiple: false,
              filters: extensions.length ? [{ name: "Data source", extensions }] : undefined,
            });
            return paths?.[0];
          }
        : undefined,
      onTablePreview: async (connections, sourceId, table, limit) => {
        const preview = await backend.callBinding(
          "process_mining::bindings::extraction_dbcon_bindings::extraction_table_preview",
          { connections, source_id: sourceId, table, limit },
        );
        return preview as unknown as ComponentTablePreview;
      },
      onRun: async (blueprint, connections, catalog) => {
        // One extraction opens one set of providers, so registry-held and connection-string
        // sources cannot be combined in a single run; `routeConnections` refuses a mix outright
        // rather than running half the blueprint. The message lands in the run dialog.
        const route = routeConnections(connections);
        if (route.kind === "none") throw new Error("Connect a source before running.");
        if (route.kind === "items") return runItems(blueprint, route.sources, catalog);
        // `extraction_run` mutates an existing SlimLinkedOCEL handle in place rather than minting
        // one itself (see extraction_bindings.rs's header on the macro's tuple-return gap), so the
        // empty log is created first.
        //
        // Deliberately no `outputName`. Naming a binding's output re-keys it *and* records it as
        // `ItemRole::Result` -- a pipeline intermediate -- and `get_objects_with_type` filters
        // those out of `/objects`. The run then succeeded, its report rendered, and the log was
        // never listed anywhere. Every panel that produces a user-facing dataset lets the handle
        // be minted (keeping the default `Primary` role); `outputName` is for the pipeline editor,
        // whose intermediates are meant to be hidden.
        const ocelHandle = await backend.callBinding(
          "process_mining::bindings::slim_ocel_bindings::locel_new",
          {},
        );
        const report = await backend.callBinding("process_mining::bindings::extraction_dbcon_bindings::extraction_run", {
          ocel: ocelHandle,
          blueprint: asClientBlueprint(blueprint),
          connections: route.connections,
          // The editor discovered this to validate against; without it the runner would connect to
          // every source and read every schema again before reading a single row.
          catalog: catalog as unknown as ClientExtractionCatalog,
        });
        // The engine lists the object, so it becomes a dataset on the next `objects-changed`
        // sync either way; naming it here means it shows up already labelled rather than as a
        // raw handle, and `renameDataset` persists that label engine-side so it survives a
        // reload.
        const id = ocelHandle as string;
        const datasetLabel = uniqueDatasetLabel("Extracted OCEL");
        useDatasets.getState().addDataset({ id, kind: "SlimLinkedOCEL", label: datasetLabel });
        useDatasets.getState().renameDataset(id, datasetLabel);
        return {
          ocelHandle: id,
          datasetLabel,
          report: report as unknown as ComponentExtractionReport,
        };
      },
    };
  }, []);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <BlueprintGraph
        value={value}
        onChange={setValue}
        connections={connections}
        onConnectionsChange={setConnections}
        callbacks={callbacks}
      />
    </div>
  );
}

export const vis = definePanel({
  type: "extraction-blueprint",
  name: "Extraction Blueprint",
  description: "Build a relational-to-OCEL extraction blueprint, discover a catalog, and run it into a log.",
  category: "create",
  icon: PiDatabase,
  keywords: ["extraction", "blueprint", "relational", "sql", "import", "etl"],
  genericExport: false,
  order: 5,
  component: ExtractionBlueprintPanel,
});
