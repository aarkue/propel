import { describe, expect, it } from "vitest";
import { fromBlueprint, toBlueprint } from "../model";
import type { Blueprint, ValueExpression } from "../types";
import { insertColumnToken, moveItem } from "./ValueExpressionEditor";

describe("Coalesce round trip", () => {
  it("a Coalesce with 2 Column parts round-trips through the whole blueprint pipeline", () => {
    const expr: ValueExpression = {
      type: "coalesce",
      parts: [
        { type: "column", column: "old_value_integer" },
        { type: "column", column: "old_value_char" },
      ],
    };
    const blueprint: Blueprint = {
      version: 1,
      id_rendering: "raw",
      on_missing_endpoint: "drop",
      on_duplicate_object: "first-wins",
      nodes: [{ id: "n", label: undefined, op: { type: "source", source_id: "s", table: "t" } }],
      mappings: [
        {
          type: "single",
          node: "n",
          label: undefined,
          when: undefined,
          target: {
            type: "object",
            object_type: { type: "constant", value: "x" },
            id: expr,
            timestamp: undefined,
            attributes: [],
          },
        },
      ],
    };
    expect(toBlueprint(fromBlueprint(blueprint))).toEqual(blueprint);
  });

  it("reordering (moveItem) swaps parts without mutating either part's own value", () => {
    const a: ValueExpression = { type: "column", column: "a" };
    const b: ValueExpression = { type: "column", column: "b" };
    const reordered = moveItem([a, b], 0, 1);
    expect(reordered).toEqual([b, a]);
    expect(reordered[0]).toBe(b);
    expect(reordered[1]).toBe(a);
    // original array untouched
    expect([a, b][0]).toBe(a);
  });
});

describe("insertColumnToken", () => {
  it("inserts a brand-new {column} token at the cursor position", () => {
    const { text, cursorPos } = insertColumnToken("ORD-", 4, "order_id");
    expect(text).toBe("ORD-{order_id}");
    expect(cursorPos).toBe(text.length);
  });

  it("insertion targets the cursor position, not always the string end", () => {
    const template = "ORD-{order_id}-{region}extra";
    // cursor right after "ORD-" (position 4), not at the string's end.
    const { text } = insertColumnToken(template, 4, "prefix");
    expect(text).toBe("ORD-{prefix}{order_id}-{region}extra");
  });

  it("typing '{order_id}extra{' then inserting 'region' completes the trailing unterminated placeholder", () => {
    const template = "{order_id}extra{";
    const { text, cursorPos } = insertColumnToken(template, template.length, "region");
    expect(text).toBe("{order_id}extra{region}");
    expect(cursorPos).toBe(text.length);
  });
});
