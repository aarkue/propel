import { describe, expect, it } from "vitest";
import type { EditorNode } from "./model";
import {
  declaredKind,
  guessColumnKind,
  rankedColumnInfo,
  previewSamples,
  resolveAllNodeColumns,
  resolveColumnInfo,
  resolveNodeColumns,
} from "./schema-resolution";
import type { ExtractionCatalog } from "./types";

function catalog(): ExtractionCatalog {
  return {
    tables: {
      erp: {
        orders: {
          name: "orders",
          columns: { id: col("INTEGER"), name: col("TEXT"), customer_id: col("INTEGER") },
        },
        customers: { name: "customers", columns: { id: col("INTEGER"), name: col("TEXT") } },
        archived_orders: { name: "archived_orders", columns: { id: col("INTEGER"), name: col("TEXT") } },
      },
    },
    domains: {},
  };
}
function col(col_type: string) {
  return { name: "c", col_type, nullable: true };
}

describe("resolveNodeColumns", () => {
  it("Source resolves to the catalog table's own columns", () => {
    const nodes: EditorNode[] = [{ id: "a", op: { type: "source", source_id: "erp", table: "orders" } }];
    expect(resolveNodeColumns(nodes, catalog(), "a")).toEqual(["customer_id", "id", "name"]);
  });

  it("a Join of two tables sharing a column produces name + right_name in the derived schema", () => {
    const nodes: EditorNode[] = [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "b", op: { type: "source", source_id: "erp", table: "customers" } },
      { id: "j", op: { type: "join", left: "a", right: "b", on: [["customer_id", "id"]] } },
    ];
    expect(resolveNodeColumns(nodes, catalog(), "j")).toEqual([
      "customer_id",
      "id",
      "name",
      "right_id",
      "right_name",
    ]);
  });

  it("Filter over a Join inherits the join's derived schema unchanged", () => {
    const nodes: EditorNode[] = [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "b", op: { type: "source", source_id: "erp", table: "customers" } },
      { id: "j", op: { type: "join", left: "a", right: "b", on: [["customer_id", "id"]] } },
      { id: "f", op: { type: "filter", input: "j", condition: { type: "is-null", column: "id" } } },
    ];
    expect(resolveNodeColumns(nodes, catalog(), "f")).toEqual(resolveNodeColumns(nodes, catalog(), "j"));
  });

  it("Union of two tables where one lacks a column present in the other includes that column", () => {
    const nodes: EditorNode[] = [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "c", op: { type: "source", source_id: "erp", table: "archived_orders" } },
      { id: "u", op: { type: "union", inputs: ["a", "c"] } },
    ];
    expect(resolveNodeColumns(nodes, catalog(), "u")).toEqual(["customer_id", "id", "name"]);
  });
});

describe("declaredKind", () => {
  it("maps common col_types case-insensitively by substring", () => {
    expect(declaredKind("INTEGER")).toBe("integer");
    expect(declaredKind("TIMESTAMPTZ")).toBe("timestamp");
    expect(declaredKind("bool")).toBe("boolean");
    expect(declaredKind("VARCHAR")).toBe("text");
    expect(declaredKind("GEOMETRY")).toBeUndefined();
  });
});

describe("guessColumnKind", () => {
  it("resolves through a Source directly", () => {
    const nodes: EditorNode[] = [{ id: "a", op: { type: "source", source_id: "erp", table: "orders" } }];
    expect(guessColumnKind(nodes, catalog(), "a", "id")).toBe("integer");
  });

  it("traces transparently through Filter", () => {
    const nodes: EditorNode[] = [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "f", op: { type: "filter", input: "a", condition: { type: "is-null", column: "id" } } },
    ];
    expect(guessColumnKind(nodes, catalog(), "f", "id")).toBe("integer");
  });

  it("does not trace through Join (ambiguous), falling back to undefined", () => {
    const nodes: EditorNode[] = [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "b", op: { type: "source", source_id: "erp", table: "customers" } },
      { id: "j", op: { type: "join", left: "a", right: "b", on: [["customer_id", "id"]] } },
    ];
    expect(guessColumnKind(nodes, catalog(), "j", "id")).toBeUndefined();
  });
});

describe("resolveColumnInfo / rankedColumnInfo", () => {
  const catalog: ExtractionCatalog = {
    tables: {
      erp: {
        orders: {
          name: "orders",
          columns: {
            order_id: { name: "order_id", col_type: "INTEGER", nullable: false },
            placed_at: { name: "placed_at", col_type: "TIMESTAMP", nullable: true },
            status: { name: "status", col_type: "VARCHAR", nullable: true },
          },
        },
      },
    },
    domains: { erp: { orders: { status: ["draft", "done"] } } },
  };
  const nodes: EditorNode[] = [
    { id: "orders", op: { type: "source", source_id: "erp", table: "orders" } },
    { id: "f", op: { type: "filter", input: "orders", condition: { type: "and", conditions: [] } } },
  ];

  it("decorates each column with its declared type and kind", () => {
    const infos = resolveColumnInfo(nodes, catalog, "orders");
    expect(infos.find((i) => i.name === "placed_at")).toMatchObject({
      colType: "TIMESTAMP",
      kind: "timestamp",
      nullable: true,
    });
  });

  it("carries the catalog's fetched domain through as sample values", () => {
    const status = resolveColumnInfo(nodes, catalog, "orders").find((i) => i.name === "status");
    expect(status?.samples).toEqual(["draft", "done"]);
  });

  it("traces metadata through a Filter, whose schema is its input's unchanged", () => {
    expect(resolveColumnInfo(nodes, catalog, "f").find((i) => i.name === "order_id")?.colType).toBe(
      "INTEGER",
    );
  });

  it("floats id-ish columns for an id field and time-ish ones for a timestamp field", () => {
    expect(rankedColumnInfo(nodes, catalog, "orders", "id")[0].name).toBe("order_id");
    expect(rankedColumnInfo(nodes, catalog, "orders", "timestamp")[0].name).toBe("placed_at");
    expect(rankedColumnInfo(nodes, catalog, "orders", "type")[0].name).toBe("status");
  });

  it("keeps the original order without a hint, so the list does not reshuffle unpredictably", () => {
    const plain = resolveColumnInfo(nodes, catalog, "orders").map((i) => i.name);
    expect(rankedColumnInfo(nodes, catalog, "orders").map((i) => i.name)).toEqual(plain);
  });
});

describe("resolveAllNodeColumns caching", () => {
  const nodes: EditorNode[] = [
    { id: "s", op: { type: "source", source_id: "erp", table: "orders" } } as EditorNode,
  ];

  it("returns the identical map for the same inputs", () => {
    const c = catalog();
    expect(resolveAllNodeColumns(nodes, c)).toBe(resolveAllNodeColumns(nodes, c));
  });

  it("recomputes when the catalog changes", () => {
    const first = resolveAllNodeColumns(nodes, catalog());
    const second = resolveAllNodeColumns(nodes, catalog());
    expect(second).not.toBe(first);
    expect([...(second.get("s") ?? [])].sort()).toEqual(["customer_id", "id", "name"]);
  });

  it("still reflects a changed catalog rather than serving a stale hit", () => {
    const c = catalog();
    expect([...(resolveAllNodeColumns(nodes, c).get("s") ?? [])]).toContain("name");
    const widened = catalog();
    widened.tables.erp.orders.columns.extra = { name: "c", col_type: "TEXT", nullable: true };
    expect([...(resolveAllNodeColumns(nodes, widened).get("s") ?? [])]).toContain("extra");
  });
});

describe("previewSamples", () => {
  const preview = {
    columns: ["status", "note", "id"],
    rows: [
      ["draft", null, "1"],
      ["draft", "", "2"],
      ["done", "hi", "3"],
    ] as (string | null)[][],
  };

  it("dedupes, so one repeated value does not fill the examples", () => {
    expect(previewSamples(preview, "status")).toEqual(["draft", "done"]);
  });

  it("skips nulls and empty strings", () => {
    expect(previewSamples(preview, "note")).toEqual(["hi"]);
  });

  it("respects the limit", () => {
    expect(previewSamples(preview, "id", 2)).toEqual(["1", "2"]);
  });

  it("is undefined, not empty, when there is nothing to show", () => {
    expect(previewSamples(undefined, "status")).toBeUndefined();
    expect(previewSamples(preview, "nonexistent")).toBeUndefined();
    expect(previewSamples({ columns: ["a"], rows: [[null]] }, "a")).toBeUndefined();
  });

  it("feeds ColumnInfo.samples when no exact domain was fetched", () => {
    const c = catalog();
    c.previews = { erp: { orders: { columns: ["name"], rows: [["alice"], ["bob"]] } } };
    const nodes: EditorNode[] = [
      { id: "s", op: { type: "source", source_id: "erp", table: "orders" } } as EditorNode,
    ];
    const info = resolveColumnInfo(nodes, c, "s").find((i) => i.name === "name");
    expect(info?.samples).toEqual(["alice", "bob"]);
  });

  it("prefers a fetched domain over preview rows", () => {
    const c = catalog();
    c.domains = { erp: { orders: { name: ["exact"] } } };
    c.previews = { erp: { orders: { columns: ["name"], rows: [["from-preview"]] } } };
    const nodes: EditorNode[] = [
      { id: "s", op: { type: "source", source_id: "erp", table: "orders" } } as EditorNode,
    ];
    expect(resolveColumnInfo(nodes, c, "s").find((i) => i.name === "name")?.samples).toEqual(["exact"]);
  });
});
