import { describe, expect, it } from "vitest";
import { fromBlueprint, toBlueprint } from "../model";
import type { Blueprint, Predicate } from "../types";
import { addChild, removeChildAt, setChildAt, setInValues, toggleNegate } from "./predicate-ops";

// A 3-level nested predicate: And(Or(Compare, Not(IsNull)), Matches) -- the exact shape the task
// brief calls out.
function nested(): Predicate {
  return {
    type: "and",
    conditions: [
      {
        type: "or",
        conditions: [
          {
            type: "compare",
            left: { type: "column", column: "status" },
            op: "eq",
            right: { type: "literal", value: "open" },
          },
          { type: "not", condition: { type: "is-null", column: "closed_at" } },
        ],
      },
      { type: "matches", column: "code", regex: "^A" },
    ],
  };
}

describe("Predicate round trip through the whole blueprint pipeline", () => {
  it("a 3-level nested predicate (And(Or(Compare, Not(IsNull)), Matches)) survives unedited", () => {
    const blueprint: Blueprint = {
      version: 1,
      id_rendering: "raw",
      on_missing_endpoint: "drop",
      on_duplicate_object: "first-wins",
      nodes: [
        { id: "n", label: undefined, op: { type: "filter", input: "src", condition: nested() } },
        { id: "src", label: undefined, op: { type: "source", source_id: "s", table: "t" } },
      ],
      mappings: [],
    };
    expect(toBlueprint(fromBlueprint(blueprint))).toEqual(blueprint);
  });

  it("Compare with both sides Column round-trips (SAP VALUE_OLD <> VALUE_NEW)", () => {
    const p: Predicate = {
      type: "compare",
      left: { type: "column", column: "value_old" },
      op: "ne",
      right: { type: "column", column: "value_new" },
    };
    const blueprint: Blueprint = {
      version: 1,
      id_rendering: "raw",
      on_missing_endpoint: "drop",
      on_duplicate_object: "first-wins",
      nodes: [{ id: "n", label: undefined, op: { type: "filter", input: "src", condition: p } }],
      mappings: [],
    };
    const roundTripped = toBlueprint(fromBlueprint(blueprint));
    expect(roundTripped).toEqual(blueprint);
    const cond = roundTripped.nodes[0].op.type === "filter" ? roundTripped.nodes[0].op.condition : null;
    expect(cond).toEqual(p);
  });
});

describe("predicate-ops: immutable tree updates", () => {
  it("adding a condition inside a nested Or mutates only that subtree, sibling branches unchanged (reference-stable)", () => {
    const root = nested() as Extract<Predicate, { type: "and" }>;
    const or = root.conditions[0] as Extract<Predicate, { type: "or" }>;
    const matchesSibling = root.conditions[1];

    const newLeaf: Predicate = { type: "is-empty", column: "note" };
    const updatedOr = addChild(or, newLeaf);
    const updatedRoot = setChildAt(root, 0, updatedOr);

    // The untouched sibling (Matches) is the exact same object -- no incidental clone.
    expect((updatedRoot as Extract<Predicate, { type: "and" }>).conditions[1]).toBe(matchesSibling);
    // The Or's own untouched children (Compare, Not) are still the exact same objects.
    const updatedOrNode = (updatedRoot as Extract<Predicate, { type: "and" }>).conditions[0] as Extract<
      Predicate,
      { type: "or" }
    >;
    expect(updatedOrNode.conditions[0]).toBe(or.conditions[0]);
    expect(updatedOrNode.conditions[1]).toBe(or.conditions[1]);
    // And the new leaf was actually appended.
    expect(updatedOrNode.conditions).toHaveLength(3);
    expect(updatedOrNode.conditions[2]).toEqual(newLeaf);
    // The original tree is untouched (pure).
    expect(root.conditions[0]).toBe(or);
    expect(or.conditions).toHaveLength(2);
  });

  it("toggleNegate wraps a bare predicate in Not, and unwraps a Not back to its child", () => {
    const leaf: Predicate = { type: "is-null", column: "x" };
    const negated = toggleNegate(leaf);
    expect(negated).toEqual({ type: "not", condition: leaf });
    expect(toggleNegate(negated)).toBe(leaf);
  });

  it("In: adding then removing a value leaves `column` untouched and only edits `values`", () => {
    const inNode: Extract<Predicate, { type: "in" }> = {
      type: "in",
      column: "status",
      values: ["a", "b"],
    };
    const withThird = setInValues(inNode, [...inNode.values, "c"]);
    expect(withThird).toEqual({ type: "in", column: "status", values: ["a", "b", "c"] });

    const removedMiddle = setInValues(
      withThird as Extract<Predicate, { type: "in" }>,
      (withThird as Extract<Predicate, { type: "in" }>).values.filter((_, i) => i !== 1),
    );
    expect(removedMiddle).toEqual({ type: "in", column: "status", values: ["a", "c"] });
  });

  it("removeChildAt drops exactly the targeted child, preserving order of the rest", () => {
    const group: Extract<Predicate, { type: "and" }> = {
      type: "and",
      conditions: [
        { type: "is-null", column: "a" },
        { type: "is-null", column: "b" },
        { type: "is-null", column: "c" },
      ],
    };
    const result = removeChildAt(group, 1) as Extract<Predicate, { type: "and" }>;
    expect(result.conditions.map((c) => (c as Extract<Predicate, { type: "is-null" }>).column)).toEqual([
      "a",
      "c",
    ]);
  });
});
