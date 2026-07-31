import { describe, expect, it } from "vitest";
import { deriveEdges, type EditorBlueprint, fromBlueprint, toBlueprint } from "./model";
import type { Blueprint } from "./types";

// Copied verbatim from blueprint.rs's own doctest fixture (`ACCOUNT_MOVE`), the spec's own
// worked example, not invented for this test.
const ACCOUNT_MOVE: Blueprint = {
  version: 1,
  id_rendering: "type-prefixed",
  on_missing_endpoint: "create",
  on_duplicate_object: "first-wins",
  nodes: [{ id: "account_move", op: { type: "source", source_id: "odoo", table: "account_move" } }],
  mappings: [
    {
      type: "single",
      node: "account_move",
      when: {
        type: "compare",
        left: { type: "column", column: "move_type" },
        op: "eq",
        right: { type: "literal", value: "out_invoice" },
      },
      target: {
        type: "object",
        object_type: { type: "constant", value: "customer_invoice" },
        id: { type: "column", column: "id" },
        attributes: [],
      },
    },
  ],
};

// Exercises every NodeOp variant once: two sources, a join of them, a filter of the join, and a
// union of the filter with one of the sources.
function everyVariantBlueprint(): Blueprint {
  return {
    version: 1,
    id_rendering: "raw",
    on_missing_endpoint: "drop",
    on_duplicate_object: "first-wins",
    nodes: [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "b", op: { type: "source", source_id: "erp", table: "customers" } },
      { id: "j", op: { type: "join", left: "a", right: "b", on: [["customer_id", "id"]] } },
      {
        id: "f",
        op: { type: "filter", input: "j", condition: { type: "is-null", column: "cancelled_at" } },
      },
      { id: "u", op: { type: "union", inputs: ["f", "a"] } },
    ],
    mappings: [],
  };
}

describe("toBlueprint / fromBlueprint round trip", () => {
  it("round-trips the account_move fixture unchanged", () => {
    const editor = fromBlueprint(ACCOUNT_MOVE);
    expect(toBlueprint(editor)).toEqual(ACCOUNT_MOVE);
  });

  it("round-trips a blueprint using every NodeOp variant once", () => {
    const b = everyVariantBlueprint();
    expect(toBlueprint(fromBlueprint(b))).toEqual(b);
  });

  it("a freshly-parsed document (no stored positions) yields every EditorNode.position undefined", () => {
    const editor = fromBlueprint(everyVariantBlueprint());
    expect(editor.nodes.every((n) => n.position === undefined)).toBe(true);
  });

  it("fills in defaulted fields (id_rendering, on_missing_endpoint, on_duplicate_object) when absent", () => {
    const minimal: Blueprint = { version: 1, nodes: [], mappings: [] };
    const editor = fromBlueprint(minimal);
    expect(editor.idRendering).toBe("raw");
    expect(editor.onMissingEndpoint).toBe("drop");
    expect(editor.onDuplicateObject).toBe("first-wins");
  });
});

describe("deriveEdges", () => {
  it("derives exactly the edges implied by each node's op, with Join's two edges carrying the right handle", () => {
    const editor = fromBlueprint(everyVariantBlueprint());
    const edges = deriveEdges(editor.nodes);

    const byTarget = (target: string) => edges.filter((e) => e.target === target);

    expect(byTarget("a")).toHaveLength(0);
    expect(byTarget("b")).toHaveLength(0);

    const joinEdges = byTarget("j");
    expect(joinEdges).toHaveLength(2);
    expect(joinEdges.find((e) => e.source === "a")?.sourceHandle).toBe("left");
    expect(joinEdges.find((e) => e.source === "b")?.sourceHandle).toBe("right");

    const filterEdges = byTarget("f");
    expect(filterEdges).toHaveLength(1);
    expect(filterEdges[0]).toMatchObject({ source: "j", target: "f" });
    expect(filterEdges[0].sourceHandle).toBeUndefined();

    const unionEdges = byTarget("u");
    expect(unionEdges).toHaveLength(2);
    expect(unionEdges.map((e) => e.source).sort()).toEqual(["a", "f"]);
  });

  it("a Union with 3 inputs, one later removed, drops exactly that edge and leaves the others' ids unchanged", () => {
    const nodes: EditorBlueprint["nodes"] = [
      { id: "s1", op: { type: "source", source_id: "x", table: "t1" } },
      { id: "s2", op: { type: "source", source_id: "x", table: "t2" } },
      { id: "s3", op: { type: "source", source_id: "x", table: "t3" } },
      { id: "u", op: { type: "union", inputs: ["s1", "s2", "s3"] } },
    ];
    const before = deriveEdges(nodes);
    expect(before).toHaveLength(3);
    const keptIds = before.filter((e) => e.source !== "s2").map((e) => e.id);

    const after = deriveEdges([
      nodes[0],
      nodes[1],
      nodes[2],
      { id: "u", op: { type: "union", inputs: ["s1", "s3"] } },
    ]);
    expect(after).toHaveLength(2);
    expect(after.map((e) => e.id).sort()).toEqual(keptIds.sort());
  });

  it("omits an edge whose source id is dangling (no matching node)", () => {
    const nodes: EditorBlueprint["nodes"] = [
      { id: "f", op: { type: "filter", input: "missing", condition: { type: "is-null", column: "x" } } },
    ];
    expect(deriveEdges(nodes)).toHaveLength(0);
  });
});
