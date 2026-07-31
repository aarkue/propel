import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useState } from "react";
import {
  BlueprintGraph,
  type BlueprintEditCallbacks,
  type EditorBlueprint,
  type ExtractionCatalog,
  fromBlueprint,
  toBlueprint,
} from "@r4pm/components/extraction-blueprint";
import type { Blueprint } from "@r4pm/components/extraction-blueprint";

// A small but non-trivial blueprint: two sources, a join, a filter over the join, and one Object
// mapping with a nested (And(Compare, Not(IsNull))) `when` guard -- exercises Source/Filter/Join
// node types, a derived Join edge pair, and a multi-level Predicate in one screen.
const SAMPLE_BLUEPRINT: Blueprint = {
  version: 1,
  id_rendering: "type-prefixed",
  on_missing_endpoint: "create",
  on_duplicate_object: "first-wins",
  nodes: [
    { id: "orders", label: "orders", op: { type: "source", source_id: "erp", table: "orders" } },
    { id: "customers", label: "customers", op: { type: "source", source_id: "erp", table: "customers" } },
    {
      id: "orders_with_customer",
      label: "orders + customer",
      op: { type: "join", left: "orders", right: "customers", on: [["customer_id", "id"]] },
    },
    {
      id: "active_orders",
      label: "active orders",
      op: {
        type: "filter",
        input: "orders_with_customer",
        condition: {
          type: "and",
          conditions: [
            {
              type: "compare",
              left: { type: "column", column: "status" },
              op: "ne",
              right: { type: "literal", value: "cancelled" },
            },
            { type: "not", condition: { type: "is-null", column: "name" } },
          ],
        },
      },
    },
  ],
  mappings: [
    {
      type: "single",
      node: "active_orders",
      label: "customer order",
      when: undefined,
      target: {
        type: "object",
        object_type: { type: "constant", value: "order" },
        id: { type: "column", column: "id" },
        timestamp: undefined,
        attributes: [
          { source_column: "name", name: "customer_name", value_type: undefined },
          { source_column: "status", name: "status", value_type: "String" },
        ],
      },
    },
    {
      type: "single",
      node: "active_orders",
      label: "order placed",
      when: undefined,
      target: {
        type: "event",
        event_type: { type: "constant", value: "place order" },
        id: { type: "template", template: "EVT-{id}" },
        timestamp: { type: "value", source: { type: "column", column: "status" } },
        attributes: [],
        objects: [
          {
            object: {
              id: { type: "column", column: "id" },
              object_type: { type: "constant", value: "order" },
              split: undefined,
            },
            qualifier: { type: "constant", value: "concerns" },
          },
        ],
      },
    },
    {
      type: "single",
      node: "active_orders",
      label: "order belongs to customer",
      when: undefined,
      target: {
        type: "o2o",
        source: {
          id: { type: "column", column: "id" },
          object_type: { type: "constant", value: "order" },
          split: undefined,
        },
        target: {
          id: { type: "column", column: "customer_id" },
          object_type: { type: "constant", value: "customer" },
          split: undefined,
        },
        qualifier: { type: "constant", value: "placed-by" },
      },
    },
  ],
};

// Same graph as SAMPLE_BLUEPRINT, plus a second, deliberately uncompilable mapping (an Event
// target with no `id`, so the compiler's `RejectReason::SynthesizedId` fires -- the extractor
// would mint a random UUID per row, which has no relational denotation) -- exercises the "one
// mapping fails, the rest of the blueprint still compiles" path the compile panel has to make
// unmissable rather than hiding behind a toast.
const SAMPLE_BLUEPRINT_WITH_COMPILE_ERROR: Blueprint = {
  ...SAMPLE_BLUEPRINT,
  mappings: [
    ...SAMPLE_BLUEPRINT.mappings,
    {
      type: "single",
      node: "active_orders",
      label: "order placed (uncompilable: no id)",
      when: undefined,
      target: {
        type: "event",
        event_type: { type: "constant", value: "place order" },
        id: undefined,
        timestamp: { type: "value", source: { type: "column", column: "status" } },
        attributes: [],
        objects: [],
      },
    },
  ],
};

const SAMPLE_CATALOG: ExtractionCatalog = {
  tables: {
    erp: {
      orders: {
        name: "orders",
        columns: {
          id: { name: "id", col_type: "INTEGER", nullable: false },
          customer_id: { name: "customer_id", col_type: "INTEGER", nullable: true },
          status: { name: "status", col_type: "VARCHAR", nullable: true },
        },
      },
      customers: {
        name: "customers",
        columns: {
          id: { name: "id", col_type: "INTEGER", nullable: false },
          name: { name: "name", col_type: "VARCHAR", nullable: true },
        },
      },
    },
  },
  domains: {
    erp: { orders: { status: ["draft", "confirmed", "cancelled", "done"] } },
  },
};

// No real backend in Storybook: stub callbacks so the toolbar's Connections/Validate/Run
// affordances are all exercisable, matching what a host actually wires (Task B9).
function mockCallbacks(): BlueprintEditCallbacks {
  return {
    onDiscoverCatalog: async () => SAMPLE_CATALOG,
    onColumnDomain: async (_c, sourceId, table, column) =>
      SAMPLE_CATALOG.domains[sourceId]?.[table]?.[column] ?? [],
    onValidate: async (blueprint) => {
      // A tiny stand-in for `extraction_validate`: flags a Source with an empty table name.
      const errors: import("@r4pm/components/extraction-blueprint").ValidationError[] = [];
      for (const n of blueprint.nodes) {
        if (n.op.type === "source" && n.op.table === "") {
          errors.push({ type: "unknown-table", source_id: n.op.source_id, table: n.op.table });
        }
      }
      return errors;
    },
    onRun: async (blueprint) => ({
      ocelHandle: "mock-ocel-handle",
      report: {
        per_mapping: blueprint.mappings.map((m, i) => ({
          mapping: {
            index: i,
            label: m.type === "single" ? (m.label ?? null) : null,
            path: `$.mappings[${i}]`,
          },
          rows_read: 128,
          entities_emitted: 120,
          deduplicated: 3,
          // DropReason's real (generated) JSON is PascalCase (report.rs's default enum repr).
          dropped: { PredicateExcluded: 5, UnresolvedEndpoint: 0 },
        })),
        errors: [],
        rows_materialized: 256,
        finalize: {
          duplicates_removed: 0,
          objects_created: 120,
          resolved_relations: 0,
          unresolved_endpoints: 0,
        },
      },
    }),
    // A tiny stand-in for `extraction_compile`: emits one view per compilable Object/Event
    // mapping (skipped if `id` is absent -- `RejectReason::SynthesizedId`, since the extractor
    // would mint a random UUID per row with no relational denotation), named differently per
    // `shape` so switching the selector visibly changes the SQL. Not a real compiler -- Storybook
    // has no backend -- but the same shape `extraction_compile` itself returns.
    onCompile: async (blueprint, _catalog, shape) => {
      const views: { name: string; body: string }[] = [];
      const errors: {
        mapping: { index: number; label: string | null; path: string } | null;
        reason: { SynthesizedId: { field: string } } | { Invalid: { detail: string } };
      }[] = [];
      blueprint.mappings.forEach((entry, i) => {
        if (entry.type !== "single") return;
        const mappingRef = { index: i, label: entry.label ?? null, path: `$.mappings[${i}]` };
        const { target } = entry;
        if (target.type !== "object" && target.type !== "event") return;
        if (!target.id) {
          errors.push({ mapping: mappingRef, reason: { SynthesizedId: { field: "id" } } });
          return;
        }
        const typeExpr = target.type === "object" ? target.object_type : target.event_type;
        const typeName = typeExpr.type === "constant" ? typeExpr.value : "dynamic";
        const viewName = shape === "Consolidated" ? `${target.type}s` : `${target.type}_${typeName}`;
        if (!views.some((v) => v.name === viewName)) {
          views.push({
            name: viewName,
            body: `SELECT ${target.type}_pk AS ocel_id, '${typeName}' AS ocel_type\nFROM (${entry.node})`,
          });
        }
      });
      const objectView = views.find((v) => v.name.startsWith("object"));
      return {
        dialect: "DuckDb",
        shape,
        views,
        probes: objectView
          ? [
              {
                mapping: null,
                kind: "AmbiguousObjectIdentity",
                sql: `SELECT ocel_id FROM "${objectView.name}" GROUP BY ocel_id HAVING COUNT(*) > 1`,
              },
            ]
          : [],
        errors,
      };
    },
  };
}

const meta = {
  title: "Editors/Extraction Blueprint",
  component: BlueprintGraph,
  parameters: { frame: { mode: "canvas", height: 640 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof BlueprintGraph>;
export default meta;

export const Default: StoryObj = {
  name: "Editable blueprint (source -> join -> filter -> mapping)",
  render: () => {
    function Story() {
      const [value, setValue] = useState<EditorBlueprint>(() => fromBlueprint(SAMPLE_BLUEPRINT));
      const [connections, setConnections] = useState<Record<string, string>>({
        erp: "postgres://localhost/erp",
      });
      return (
        <BlueprintGraph
          value={value}
          onChange={setValue}
          connections={connections}
          onConnectionsChange={setConnections}
          callbacks={mockCallbacks()}
        />
      );
    }
    return <Story />;
  },
};

export const ReadOnly: StoryObj = {
  name: "Read-only (no onChange)",
  render: () => <BlueprintGraph value={fromBlueprint(SAMPLE_BLUEPRINT)} catalog={SAMPLE_CATALOG} />,
};

export const CompilePanelWithPartialError: StoryObj = {
  name: "Compile panel (one mapping uncompilable, rest still compiles)",
  render: () => {
    function Story() {
      const [value, setValue] = useState<EditorBlueprint>(() =>
        fromBlueprint(SAMPLE_BLUEPRINT_WITH_COMPILE_ERROR),
      );
      const [connections, setConnections] = useState<Record<string, string>>({
        erp: "postgres://localhost/erp",
      });
      return (
        <BlueprintGraph
          value={value}
          onChange={setValue}
          connections={connections}
          onConnectionsChange={setConnections}
          callbacks={mockCallbacks()}
        />
      );
    }
    return <Story />;
  },
};

export const RoundTripCheck: StoryObj = {
  name: "Round-trip check (console)",
  render: () => {
    const editor = fromBlueprint(SAMPLE_BLUEPRINT);
    const back = toBlueprint(editor);
    // eslint-disable-next-line no-console
    console.info(
      "[extraction-blueprint] round-trip equal:",
      JSON.stringify(back) === JSON.stringify(SAMPLE_BLUEPRINT),
    );
    return <BlueprintGraph value={editor} catalog={SAMPLE_CATALOG} />;
  },
};
