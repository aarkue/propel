import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PiDatabase } from "react-icons/pi";
import toast from "react-hot-toast";
import type { IDockviewPanelProps } from "dockview";
import type {
  Blueprint as ClientBlueprint,
  ExtractionCatalog as ClientExtractionCatalog,
} from "@r4pm/client";
import {
  BlueprintGraph,
  newBlueprint,
  type BlueprintEditCallbacks,
  type ConnectionKind,
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
import { importFileAsSource } from "../data-import";
import { connectionForDroppedText, routeConnections } from "../extraction-sources";
import { uniqueDatasetLabel, useDatasets } from "../stores";
import { usePanelDraft, usePanelState } from "../panels/panel-state";
import { definePanel } from "./define-vis";

/**
 * `@r4pm/components` hand-mirrors the Blueprint model so the package has no `@r4pm/client`
 * dependency and stays usable by OCPQ too. Both sides share the same serde/schemars JSON shape, so
 * crossing this seam is a type-level bridge only, never a data transform.
 */
const asClientBlueprint = (b: ComponentBlueprint) => b as unknown as ClientBlueprint;

/** Returned when nothing is connected. A single frozen value, because `BlueprintGraph` keys a
 *  column-resolution cache on the catalog's identity. */
const NO_CATALOG = Object.freeze({ tables: {}, domains: {} }) as ComponentExtractionCatalog;

/** A browser open dialog, resolving to the chosen `File` or undefined if cancelled. A throwaway
 *  input rather than a mounted one, so no ref has to be threaded through the editor. */
const pickLocalFile = (extensions: string[]) =>
  new Promise<File | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (extensions.length) input.accept = extensions.map((e) => `.${e}`).join(",");
    input.onchange = () => resolve(input.files?.[0] ?? undefined);
    // Cancelling fires no `change` event in most browsers; `cancel` is the modern signal.
    input.oncancel = () => resolve(undefined);
    input.click();
  });

function ExtractionBlueprintPanel(props: IDockviewPanelProps) {
  // `usePanelDraft` over `usePanelState`: dragging a node fires per frame, and serializing the
  // whole document that often is wasteful. Connection strings ride along too, as session config
  // rather than part of the blueprint, so a password typed here lands in the saved layout.
  const [value, setValue] = usePanelDraft<EditorBlueprint>(props, "blueprint", newBlueprint());
  const [connections, setConnections] = usePanelState<Record<string, string>>(props, "connections", {});
  // Three tiers: validate/compile are pure and work anywhere; registry sources (`item://`) need
  // only `ocel-sqlite` and work on wasm too; connection strings need the `extraction-dbcon`
  // feature, absent from the wasm build. Not queried on wasm — `base` below fixes it there.
  const connectorKinds = useQuery({
    queryKey: ["extraction", "connection-kinds"],
    queryFn: async () =>
      (await backend.callBinding(
        "process_mining::bindings::extraction_dbcon_bindings::extraction_connection_kinds",
        {},
      )) as string[],
    enabled: backend.kind !== "wasm",
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
  const connectionKindAvailability = useMemo(() => {
    if (!connectorKinds) return undefined;
    const availability: Partial<Record<ConnectionKind, string>> = {};
    for (const k of ["csv", "parquet", "xlsx", "sqlite", "duckdb", "postgres"] as const) {
      if (!connectorKinds.includes(k)) availability[k] = "not enabled in this build";
    }
    return availability;
  }, [connectorKinds]);

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

    /** Distinct values of one column of a registry-held source. Available on every backend, so the
     *  browser can show example values too -- it could not before, which is why every column
     *  picker there listed bare names. */
    const columnDomainItems = (
      sources: Record<string, string>,
      sourceId: string,
      table: string,
      column: string,
    ) =>
      backend.callBinding("process_mining::bindings::extraction_bindings::extraction_column_domain_items", {
        sources,
        source_id: sourceId,
        table,
        column,
      });

    const tablePreviewItems = async (
      sources: Record<string, string>,
      sourceId: string,
      table: string,
      limit?: number,
    ) => {
      const preview = await backend.callBinding(
        "process_mining::bindings::extraction_bindings::extraction_table_preview_items",
        { sources, source_id: sourceId, table, limit },
      );
      return preview as unknown as ComponentTablePreview;
    };

    const NO_CONNECTOR =
      "This build has no database connector, so it cannot open a connection string. Drop the file itself to read it from memory instead.";

    const base: BlueprintEditCallbacks = {
      // No filesystem, no network connector: the bytes route is the only one, so the kinds it
      // cannot reach are shown disabled rather than hidden -- the desktop app opens them.
      connectionKindAvailability: {
        postgres: "desktop app or server",
        // The `duckdb` crate links a native library and has no wasm32 build, so unlike CSV and
        // SQLite it cannot be read in the browser even from dropped bytes.
        duckdb: "desktop app or server",
        custom: "desktop app or server",
      },
      // The bytes route reads CSV and the SQLite family, and nothing else here can be reached: no
      // DuckDB in the wasm build, no `extraction-dbcon` for Postgres, and a hand-written connection
      // string names something a browser cannot open at all.
      onAddFileSource: async (extensions) => {
        try {
          const file = await pickLocalFile(extensions);
          if (!file) return undefined;
          const { connection } = await importFileAsSource(backend, file);
          return connection;
        } catch (e) {
          toast.error(`Could not read that file: ${String(e)}`);
          return undefined;
        }
      },
      onDiscoverCatalog: async (conns) => {
        const route = routeConnections(conns);
        if (route.kind === "none") return NO_CATALOG;
        if (route.kind === "items") return discoverItems(route.sources);
        throw new Error(NO_CONNECTOR);
      },
      // Only the items route exists here; a connection string names something this build cannot
      // open at all, so there is nothing to read a domain or a preview out of.
      onColumnDomain: async (conns, sourceId, table, column) => {
        const route = routeConnections(conns);
        if (route.kind !== "items") throw new Error(NO_CONNECTOR);
        return columnDomainItems(route.sources, sourceId, table, column);
      },
      onTablePreview: async (conns, sourceId, table, limit) => {
        const route = routeConnections(conns);
        if (route.kind !== "items") throw new Error(NO_CONNECTOR);
        return tablePreviewItems(route.sources, sourceId, table, limit);
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
      onCompile: async (blueprint, catalog, shape, dialect) => {
        const compiled = await backend.callBinding(
          "process_mining::bindings::extraction_bindings::extraction_compile",
          {
            blueprint: asClientBlueprint(blueprint),
            catalog: catalog as unknown as ComponentExtractionCatalog,
            shape: shape as unknown as ComponentEmissionShape,
            // Omitted rather than defaulted here: the binding's own `#[bind(default)]` decides what
            // "no dialect" means, so that default lives in one place.
            ...(dialect ? { dialect } : {}),
          } as never,
        );
        return compiled as unknown as ComponentCompiledOcel;
      },
    };
    if (backend.kind === "wasm") return base;
    return {
      ...base,
      // The backend reports the kinds its build can open (its `extraction-dbcon*` features);
      // anything it doesn't list is shown disabled instead of failing after the form is filled in.
      connectionKindAvailability,
      // A path field and its Browse button, not the byte route: a filesystem-backed build opens the
      // file where it lies.
      onAddFileSource: undefined,
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
      // Which binding reads a source depends on the source, not on the build: a registry-held
      // `item://` entry is unreadable by dbcon even here.
      onColumnDomain: async (conns, sourceId, table, column) => {
        const route = routeConnections(conns);
        if (route.kind === "items") return columnDomainItems(route.sources, sourceId, table, column);
        return backend.callBinding(
          "process_mining::bindings::extraction_dbcon_bindings::extraction_column_domain",
          { connections: conns, source_id: sourceId, table, column },
        );
      },
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
      onTablePreview: async (conns, sourceId, table, limit) => {
        const route = routeConnections(conns);
        if (route.kind === "items") return tablePreviewItems(route.sources, sourceId, table, limit);
        const preview = await backend.callBinding(
          "process_mining::bindings::extraction_dbcon_bindings::extraction_table_preview",
          { connections: conns, source_id: sourceId, table, limit },
        );
        return preview as unknown as ComponentTablePreview;
      },
      onRun: async (blueprint, connections, catalog) => {
        // One extraction opens one set of providers; `routeConnections` refuses a mix rather than
        // running half the blueprint.
        const route = routeConnections(connections);
        if (route.kind === "none") throw new Error("Connect a source before running.");
        if (route.kind === "items") return runItems(blueprint, route.sources, catalog);
        // `extraction_run` mutates an existing SlimLinkedOCEL handle rather than minting one, so
        // the empty log is created first. No `outputName`: that would re-key the output and tag it
        // `ItemRole::Result`, which `get_objects_with_type` hides from `/objects`.
        const ocelHandle = await backend.callBinding(
          "process_mining::bindings::slim_ocel_bindings::locel_new",
          {},
        );
        const report = await backend.callBinding(
          "process_mining::bindings::extraction_dbcon_bindings::extraction_run",
          {
            ocel: ocelHandle,
            blueprint: asClientBlueprint(blueprint),
            connections: route.connections,
            // The editor discovered this to validate against; without it the runner would connect to
            // every source and read every schema again before reading a single row.
            catalog: catalog as unknown as ClientExtractionCatalog,
          },
        );
        // Naming it here shows it labelled immediately rather than as a raw handle;
        // `renameDataset` persists the label engine-side so it survives a reload.
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
  }, [connectionKindAvailability]);

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
