import { describe, expect, it } from "vitest";
import {
  addMapping,
  addTransform,
  childCount,
  childPosition,
  convertEntry,
  convertNodeOp,
  defaultEntry,
  defaultNodeOp,
  freshId,
  renameSourceId,
  attributeNameFor,
  knownTypeNames,
  relationIdColumns,
  suggestJoinKeys,
  suggestMappingSeed,
  typeNameFromTable,
} from "./node-draft";
import { entryMappings, entryNode, singleEntry, type EditorBlueprint, type EditorNode } from "../model";
import { filterCatalog } from "./AddTableMenu";
import type { ExtractionCatalog } from "../types";

function model(over: Partial<EditorBlueprint> = {}): EditorBlueprint {
  return {
    version: 1,
    idRendering: "raw",
    nodes: [
      { id: "orders", op: { type: "source", source_id: "erp", table: "orders" }, position: { x: 0, y: 0 } },
    ],
    mappings: [],
    onMissingEndpoint: "drop",
    onDuplicateObject: "first-wins",
    ...over,
  };
}

describe("defaultEntry", () => {
  it("wires the new mapping to the node it was added from", () => {
    expect(entryNode(defaultEntry("event", "orders"))).toBe("orders");
  });

  it("starts an ordered group with two mappings, since a one-element group is just a Single", () => {
    const entry = defaultEntry("ordered", "orders");
    expect(entry.type).toBe("ordered");
    expect(entryMappings(entry)).toHaveLength(2);
  });

  it("defaults an event's type to a constant, not a column -- most event types are fixed per table", () => {
    const [m] = entryMappings(defaultEntry("event", "orders"));
    if (m.target.type !== "event") throw new Error("expected event");
    expect(m.target.event_type).toEqual({ type: "constant", value: "" });
  });
});

describe("defaultNodeOp", () => {
  it("leaves a Join's right input unset, since it comes from a second edge the user draws", () => {
    expect(defaultNodeOp("join", "orders")).toEqual({
      type: "join",
      left: "orders",
      right: "",
      on: [["", ""]],
    });
  });

  it("seeds a Union with the node it was added from", () => {
    expect(defaultNodeOp("union", "orders")).toEqual({ type: "union", inputs: ["orders"] });
  });
});

describe("convertEntry", () => {
  it("keeps the label when switching kinds, so typed text is not silently discarded", () => {
    const before = singleEntry({
      node: "orders",
      label: "my mapping",
      when: null,
      target: {
        type: "object",
        object_type: { type: "constant", value: "order" },
        id: { type: "column", column: "id" },
        timestamp: undefined,
        attributes: [],
      },
    });
    const after = convertEntry(before, "e2o", "orders");
    expect(entryMappings(after)[0].label).toBe("my mapping");
    expect(entryMappings(after)[0].target.type).toBe("e2o");
  });
});

describe("convertNodeOp", () => {
  it("carries the input across a kind change", () => {
    const filter = defaultNodeOp("filter", "orders");
    expect(convertNodeOp(filter, "union")).toEqual({ type: "union", inputs: ["orders"] });
    expect(convertNodeOp(filter, "join")).toMatchObject({ left: "orders" });
  });
});

describe("freshId", () => {
  it("skips ids already taken", () => {
    expect(freshId("mapping", [])).toBe("mapping-1");
    expect(freshId("mapping", ["mapping-1", "mapping-2"])).toBe("mapping-3");
  });
});

describe("renameSourceId", () => {
  it("repoints every Source node reading the old id, and leaves the rest alone", () => {
    const nodes = [
      { id: "a", op: { type: "source", source_id: "source-1", table: "orders" } },
      { id: "b", op: { type: "source", source_id: "other", table: "items" } },
      { id: "c", op: { type: "filter", input: "a", predicate: undefined } },
    ] as EditorNode[];
    const next = renameSourceId(nodes, "source-1", "olist");
    expect(next[0].op).toMatchObject({ source_id: "olist", table: "orders" });
    expect(next[1]).toBe(nodes[1]);
    expect(next[2]).toBe(nodes[2]);
  });
});

describe("childCount / childPosition", () => {
  it("counts every node and mapping reading a node, so siblings do not stack", () => {
    const m = model({
      nodes: [
        ...model().nodes,
        { id: "f", op: { type: "filter", input: "orders", condition: { type: "and", conditions: [] } } },
      ],
      mappings: [{ id: "mapping-1", entry: defaultEntry("event", "orders") }],
    });
    expect(childCount(m, "orders")).toBe(2);
  });

  it("places a child to the right, stepping down past its siblings", () => {
    expect(childPosition({ position: { x: 100, y: 50 } }, 0)).toEqual({ x: 380, y: 50 });
    expect(childPosition({ position: { x: 100, y: 50 } }, 2)).toEqual({ x: 380, y: 310 });
  });
});

describe("addMapping / addTransform", () => {
  it("forces the entry's node to the one it was added from, whatever the draft said", () => {
    const next = addMapping(model(), "orders", defaultEntry("event", "somewhere-else"));
    expect(entryNode(next.mappings[0].entry)).toBe("orders");
    expect(next.mappings[0].position).toEqual({ x: 280, y: 0 });
  });

  it("gives every mapping a unique canvas id", () => {
    let m = addMapping(model(), "orders", defaultEntry("event", "orders"));
    m = addMapping(m, "orders", defaultEntry("object", "orders"));
    expect(new Set(m.mappings.map((mp) => mp.id)).size).toBe(2);
  });

  it("appends a transform node reading the source node", () => {
    const next = addTransform(model(), "orders", "filter");
    expect(next.nodes).toHaveLength(2);
    expect(next.nodes[1].op).toMatchObject({ type: "filter", input: "orders" });
  });
});

describe("filterCatalog", () => {
  const catalog: ExtractionCatalog = {
    tables: {
      erp: {
        orders: { name: "orders", columns: {} },
        customers: { name: "customers", columns: {} },
      },
      crm: { leads: { name: "leads", columns: {} } },
    },
    domains: {},
  };

  it("lists every source with every table when there is no query", () => {
    expect(filterCatalog(catalog, "")).toEqual([
      { sourceId: "erp", tables: ["customers", "orders"] },
      { sourceId: "crm", tables: ["leads"] },
    ]);
  });

  it("keeps only the matching tables when the query matched a table, not the source", () => {
    expect(filterCatalog(catalog, "order")).toEqual([{ sourceId: "erp", tables: ["orders"] }]);
  });

  it("keeps every table when the query matched the source id itself", () => {
    expect(filterCatalog(catalog, "erp")).toEqual([{ sourceId: "erp", tables: ["customers", "orders"] }]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCatalog(catalog, "zzz")).toEqual([]);
  });
});

describe("typeNameFromTable", () => {
  it("singularises the common plural forms", () => {
    expect(typeNameFromTable("orders")).toBe("order");
    expect(typeNameFromTable("customers")).toBe("customer");
    expect(typeNameFromTable("companies")).toBe("company");
    expect(typeNameFromTable("boxes")).toBe("box");
  });

  it("leaves a word that legitimately ends in s alone", () => {
    for (const t of ["address", "status", "analysis", "bus"]) {
      expect(typeNameFromTable(t)).toBe(t);
    }
  });

  it("turns separators into spaces and only singularises the last word", () => {
    expect(typeNameFromTable("order_items")).toBe("order item");
    expect(typeNameFromTable("sales-orders")).toBe("sales order");
  });

  it("drops a schema qualifier", () => {
    expect(typeNameFromTable("public.orders")).toBe("order");
  });
});

describe("suggestMappingSeed", () => {
  const catalog: ExtractionCatalog = {
    tables: {
      erp: {
        orders: {
          name: "orders",
          columns: {
            order_id: { name: "order_id", col_type: "INTEGER", nullable: false },
            note: { name: "note", col_type: "TEXT", nullable: true },
          },
        },
        notes: {
          name: "notes",
          columns: { body: { name: "body", col_type: "TEXT", nullable: true } },
        },
      },
    },
    domains: {},
  };
  const nodes: EditorNode[] = [
    { id: "orders", op: { type: "source", source_id: "erp", table: "orders" } },
    { id: "f", op: { type: "filter", input: "orders", condition: { type: "and", conditions: [] } } },
    { id: "notes", op: { type: "source", source_id: "erp", table: "notes" } },
  ];

  it("names the type after the table and picks its id column", () => {
    expect(suggestMappingSeed(nodes, catalog, "orders")).toMatchObject({
      typeName: "order",
      idColumns: ["order_id"],
    });
  });

  it("traces through a transform to the table underneath", () => {
    expect(suggestMappingSeed(nodes, catalog, "f").typeName).toBe("order");
  });

  it("suggests no id when nothing in the table looks like one, rather than whatever sorts first", () => {
    expect(suggestMappingSeed(nodes, catalog, "notes").idColumns).toEqual([]);
  });

  it("seeds a new object mapping with both", () => {
    const seed = suggestMappingSeed(nodes, catalog, "orders");
    const [m] = entryMappings(defaultEntry("object", "orders", seed));
    if (m.target.type !== "object") throw new Error("expected object");
    expect(m.target.object_type).toEqual({ type: "constant", value: "order" });
    expect(m.target.id).toEqual({ type: "column", column: "order_id" });
  });
});

describe("knownTypeNames", () => {
  it("collects constant type names from every position that names one", () => {
    const mappings = [
      { entry: defaultEntry("object", "n", { typeName: "order" }) },
      { entry: defaultEntry("event", "n", { typeName: "place order" }) },
    ];
    const known = knownTypeNames(mappings);
    expect(known.objects).toContain("order");
    expect(known.events).toContain("place order");
  });

  it("ignores a blank or non-constant type, which names nothing usable", () => {
    const mappings = [
      { entry: defaultEntry("object", "n") },
      {
        entry: singleEntry({
          node: "n",
          label: undefined,
          when: null,
          target: {
            type: "object",
            object_type: { type: "column", column: "kind" },
            id: { type: "column", column: "id" },
            timestamp: undefined,
            attributes: [],
          },
        }),
      },
    ];
    expect(knownTypeNames(mappings).objects).toEqual([]);
  });

  it("reaches an event's inline object references and a relation's endpoints", () => {
    const entry = singleEntry({
      node: "n",
      label: undefined,
      when: null,
      target: {
        type: "event",
        event_type: { type: "constant", value: "place order" },
        id: undefined,
        timestamp: { type: "value", source: { type: "column", column: "ts" } },
        attributes: [],
        objects: [
          {
            object: {
              id: { type: "column", column: "id" },
              object_type: { type: "constant", value: "order" },
              split: undefined,
            },
            qualifier: undefined,
          },
        ],
      },
    });
    expect(knownTypeNames([{ entry }])).toEqual({ objects: ["order"], events: ["place order"] });
  });
});

describe("attributeNameFor", () => {
  it("fills an empty name from the column", () => {
    expect(attributeNameFor("", "", "status")).toBe("status");
  });

  it("keeps following the column while the two still agree", () => {
    expect(attributeNameFor("status", "status", "state")).toBe("state");
  });

  it("stops once the name has been edited by hand", () => {
    expect(attributeNameFor("Order status", "status", "state")).toBe("Order status");
  });
});

describe("relationIdColumns", () => {
  it("gives the two ends different columns", () => {
    expect(relationIdColumns({ idColumns: ["event_id", "order_id"] })).toEqual({
      event: "event_id",
      object: "order_id",
    });
  });

  it("leaves the event end unset when no column names one, rather than reusing the object's", () => {
    expect(relationIdColumns({ idColumns: ["order_id"] })).toEqual({
      event: undefined,
      object: "order_id",
    });
  });
});

describe("suggestJoinKeys", () => {
  const catalog: ExtractionCatalog = {
    tables: {
      erp: {
        orders: {
          name: "orders",
          columns: {
            id: { name: "id", col_type: "INTEGER", nullable: false },
            customer_id: { name: "customer_id", col_type: "INTEGER", nullable: true },
            note: { name: "note", col_type: "TEXT", nullable: true },
          },
        },
        customers: {
          name: "customers",
          columns: {
            id: { name: "id", col_type: "INTEGER", nullable: false },
            note: { name: "note", col_type: "TEXT", nullable: true },
          },
        },
        shipments: {
          name: "shipments",
          columns: { order_id: { name: "order_id", col_type: "INTEGER", nullable: true } },
        },
      },
    },
    domains: {},
  };
  const nodes: EditorNode[] = [
    { id: "orders", op: { type: "source", source_id: "erp", table: "orders" } },
    { id: "customers", op: { type: "source", source_id: "erp", table: "customers" } },
    { id: "shipments", op: { type: "source", source_id: "erp", table: "shipments" } },
  ];

  it("prefers an id-ish column shared by both sides over a plain one", () => {
    expect(suggestJoinKeys(nodes, catalog, "orders", "customers")[0]).toEqual(["id", "id"]);
  });

  it("matches a foreign key against the other side's key column", () => {
    expect(suggestJoinKeys(nodes, catalog, "shipments", "orders")).toContainEqual(["order_id", "id"]);
  });

  it("suggests nothing when a schema is unresolved, rather than guessing", () => {
    expect(suggestJoinKeys(nodes, { tables: {}, domains: {} }, "orders", "customers")).toEqual([]);
  });

  it("never proposes more than two pairs", () => {
    expect(suggestJoinKeys(nodes, catalog, "orders", "customers").length).toBeLessThanOrEqual(2);
  });
});

describe("seeded timestamps", () => {
  const catalog: ExtractionCatalog = {
    tables: {
      erp: {
        orders: {
          name: "orders",
          columns: {
            order_id: { name: "order_id", col_type: "INTEGER", nullable: false },
            created_at: { name: "created_at", col_type: "TIMESTAMP", nullable: true },
          },
        },
      },
    },
    domains: {},
  };
  const nodes: EditorNode[] = [{ id: "orders", op: { type: "source", source_id: "erp", table: "orders" } }];

  it("starts an event mapping on the table's timestamp column", () => {
    const seed = suggestMappingSeed(nodes, catalog, "orders");
    const [m] = entryMappings(defaultEntry("event", "orders", seed));
    if (m.target.type !== "event") throw new Error("expected event");
    expect(m.target.timestamp).toEqual({
      type: "value",
      source: { type: "column", column: "created_at" },
    });
  });
});
