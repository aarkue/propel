import { describe, expect, it } from "vitest";
import {
  categoryOf,
  describeExpr,
  describeNodeOp,
  describePredicate,
  describeTimestamp,
  mappingSummaryLines,
  mappingTitle,
} from "./node-summary";
import { singleEntry } from "./model";
import type { Mapping, MappingEntry, Target } from "./types";

function objectMapping(over: Partial<Mapping> = {}): Mapping {
  const target: Target = {
    type: "object",
    object_type: { type: "constant", value: "order" },
    id: { type: "column", column: "order_id" },
    timestamp: undefined,
    attributes: [],
  };
  return { node: "n1", label: undefined, when: null, target, ...over };
}

describe("describeExpr", () => {
  it("brackets a column so it reads differently from a constant", () => {
    expect(describeExpr({ type: "column", column: "status" })).toBe("{status}");
    expect(describeExpr({ type: "constant", value: "order" })).toBe("order");
  });

  it("is undefined for an unconfigured expression, so the node shows nothing rather than {}", () => {
    expect(describeExpr({ type: "column", column: "" })).toBeUndefined();
    expect(describeExpr({ type: "constant", value: "" })).toBeUndefined();
    expect(describeExpr(undefined)).toBeUndefined();
  });

  it("joins coalesce parts with the fallback operator", () => {
    expect(
      describeExpr({
        type: "coalesce",
        parts: [
          { type: "column", column: "a" },
          { type: "constant", value: "fallback" },
        ],
      }),
    ).toBe("{a} ?? fallback");
  });
});

describe("describeTimestamp", () => {
  it("renders each source kind", () => {
    expect(describeTimestamp({ type: "value", source: { type: "column", column: "ts" } })).toBe("{ts}");
    expect(describeTimestamp({ type: "value", source: { type: "constant", value: "1970-01-01" } })).toBe(
      "1970-01-01",
    );
    expect(
      describeTimestamp({
        type: "value",
        source: {
          type: "coalesce",
          parts: [
            { type: "column", column: "start_date" },
            { type: "column", column: "retrieved_at" },
          ],
        },
      }),
    ).toBe("{start_date} ?? {retrieved_at}");
    expect(
      describeTimestamp({
        type: "components",
        date: { source: { type: "column", column: "d" } },
        time: undefined,
      }),
    ).toBe("{d} + ?");
    // One side pinned to a constant while the other varies per row.
    expect(
      describeTimestamp({
        type: "components",
        date: { source: { type: "column", column: "posting_date" } },
        time: { source: { type: "constant", value: "00:00:00" } },
      }),
    ).toBe("{posting_date} + 00:00:00");
  });
});

describe("describePredicate", () => {
  it("renders a comparison with its operator symbol", () => {
    expect(
      describePredicate({
        type: "compare",
        left: { type: "column", column: "status" },
        op: "ne",
        right: { type: "literal", value: "cancelled" },
      }),
    ).toBe('{status} != "cancelled"');
  });

  it("collapses a single-child group to that child, and counts a multi-child one", () => {
    const leaf = { type: "is-null", column: "a" } as const;
    expect(describePredicate({ type: "and", conditions: [leaf] })).toBe("{a} is null");
    expect(describePredicate({ type: "and", conditions: [leaf, leaf] })).toBe("2 AND conditions");
    expect(describePredicate({ type: "and", conditions: [] })).toBe("empty AND");
  });

  it("wraps a negation", () => {
    expect(describePredicate({ type: "not", condition: { type: "is-null", column: "a" } })).toBe(
      "NOT ({a} is null)",
    );
  });
});

describe("describeNodeOp", () => {
  it("summarizes each op", () => {
    expect(describeNodeOp({ type: "source", source_id: "erp", table: "orders" })).toBe("orders");
    expect(describeNodeOp({ type: "join", left: "a", right: "b", on: [["customer_id", "id"]] })).toBe(
      "customer_id = id",
    );
    expect(describeNodeOp({ type: "union", inputs: ["a", "b"] })).toBe("2 inputs");
  });

  it("says so rather than rendering an empty string when unconfigured", () => {
    expect(describeNodeOp({ type: "join", left: "", right: "", on: [] })).toBe("no join columns");
    expect(describeNodeOp({ type: "union", inputs: ["a"] })).toBe("1 input");
  });
});

describe("mappingSummaryLines", () => {
  it("lists only the fields that are set", () => {
    const lines = mappingSummaryLines(singleEntry(objectMapping()));
    expect(lines).toEqual([
      { label: "Type", value: "order" },
      { label: "ID", value: "{order_id}" },
    ]);
  });

  it("always shows an event's id, since a blank one means auto-generated UUID rather than unset", () => {
    const entry = singleEntry({
      node: "n1",
      label: undefined,
      when: null,
      target: {
        type: "event",
        event_type: { type: "constant", value: "place order" },
        id: undefined,
        timestamp: { type: "value", source: { type: "column", column: "ts" } },
        attributes: [],
        objects: [],
      },
    });
    expect(mappingSummaryLines(entry)).toContainEqual({ label: "ID", value: "auto (UUID)" });
  });

  it("appends the guard when the mapping has one", () => {
    const entry = singleEntry(objectMapping({ when: { type: "is-null", column: "deleted_at" } }));
    expect(mappingSummaryLines(entry)).toContainEqual({
      label: "When",
      value: "{deleted_at} is null",
    });
  });

  it("summarizes an ordered group by its size, not by its first mapping's fields", () => {
    const entry: MappingEntry = {
      type: "ordered",
      mappings: [objectMapping(), objectMapping()],
    };
    expect(mappingSummaryLines(entry)[0]).toEqual({
      label: "Group",
      value: "2 ordered, first match wins",
    });
  });
});

describe("mappingTitle", () => {
  it("prefers the mapping's own label", () => {
    expect(mappingTitle(singleEntry(objectMapping({ label: "customer order" })))).toBe("customer order");
  });

  it('falls back to the constant type name, since a canvas of "Object, Object" is unreadable', () => {
    expect(mappingTitle(singleEntry(objectMapping()))).toBe("order");
  });

  it("falls back to the kind when the type is not a constant, having no one name to show", () => {
    const entry = singleEntry(
      objectMapping({
        target: {
          type: "object",
          object_type: { type: "column", column: "kind" },
          id: { type: "column", column: "order_id" },
          timestamp: undefined,
          attributes: [],
        },
      }),
    );
    expect(mappingTitle(entry)).toBe("Object");
  });
});

describe("categoryOf", () => {
  it("folds both relation kinds into one visual family", () => {
    expect(categoryOf("e2o")).toBe("relation");
    expect(categoryOf("o2o")).toBe("relation");
    expect(categoryOf("event")).toBe("event");
    expect(categoryOf("object")).toBe("object");
  });
});
