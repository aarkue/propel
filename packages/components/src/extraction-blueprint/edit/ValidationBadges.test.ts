import { describe, expect, it } from "vitest";
import type { EditorNode } from "../model";
import type { ValidationError } from "../types";
import { groupValidationErrors } from "./ValidationBadges";

describe("groupValidationErrors", () => {
  it("a blueprint with one UnknownColumn{node: 'n1', column: 'bad'} produces exactly one badge on node n1, zero elsewhere", () => {
    const errors: ValidationError[] = [{ type: "unknown-column", node: "n1", column: "bad" }];
    const nodes: EditorNode[] = [
      { id: "n1", op: { type: "source", source_id: "s", table: "t" } },
      { id: "n2", op: { type: "source", source_id: "s", table: "t2" } },
    ];
    const grouped = groupValidationErrors(errors, nodes);
    expect(grouped.byNode.get("n1")).toHaveLength(1);
    expect(grouped.byNode.get("n2")).toBeUndefined();
    expect(grouped.byNode.size).toBe(1);
  });

  it("zero errors shows zero badges", () => {
    const grouped = groupValidationErrors([], []);
    expect(grouped.byNode.size).toBe(0);
    expect(grouped.byMapping.size).toBe(0);
    expect(grouped.global).toHaveLength(0);
  });

  it("UnknownSource is attributed to every Source node referencing that source_id", () => {
    const errors: ValidationError[] = [{ type: "unknown-source", source_id: "erp" }];
    const nodes: EditorNode[] = [
      { id: "a", op: { type: "source", source_id: "erp", table: "orders" } },
      { id: "b", op: { type: "source", source_id: "other", table: "orders" } },
    ];
    const grouped = groupValidationErrors(errors, nodes);
    expect(grouped.byNode.get("a")).toHaveLength(1);
    expect(grouped.byNode.has("b")).toBe(false);
  });

  it("mapping-keyed errors (MissingTypeForPrefixing) go into byMapping, not byNode", () => {
    const errors: ValidationError[] = [
      { type: "missing-type-for-prefixing", mapping: "m0", endpoint: "object" },
    ];
    const grouped = groupValidationErrors(errors, []);
    expect(grouped.byMapping.get("m0")).toHaveLength(1);
    expect(grouped.byNode.size).toBe(0);
  });

  it("errors with no node/mapping (UnsupportedVersion, InvalidRegex, InvalidTemplate) go into global", () => {
    const errors: ValidationError[] = [
      { type: "unsupported-version", found: 2, supported: 1 },
      { type: "invalid-regex", pattern: "(", message: "unterminated" },
      { type: "invalid-template", template: "{}", reason: "empty placeholder" },
    ];
    const grouped = groupValidationErrors(errors, []);
    expect(grouped.global).toHaveLength(3);
    expect(grouped.byNode.size).toBe(0);
    expect(grouped.byMapping.size).toBe(0);
  });
});
