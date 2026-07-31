import { describe, expect, it } from "vitest";
import type { CompiledOcel, RejectReason } from "../types";
import {
  compiledDdl,
  compiledMaterializeDdl,
  compiledProbeStatements,
  describeCompileErrorTarget,
  describeMappingTarget,
  describeProbeKind,
  describeRejectReason,
  withPrelude,
} from "./compile-format";

function compiled(overrides: Partial<CompiledOcel> = {}): CompiledOcel {
  return {
    dialect: "DuckDb",
    shape: "PerType",
    views: [],
    probes: [],
    errors: [],
    ...overrides,
  };
}

describe("compiledDdl", () => {
  it("wraps each view in CREATE VIEW, quoting the name and terminating with ;", () => {
    const c = compiled({
      views: [
        { name: "event", body: "SELECT 1 AS ocel_id" },
        { name: "object", body: "SELECT 2 AS ocel_id" },
      ],
    });
    expect(compiledDdl(c)).toBe(
      'CREATE VIEW "event" AS\nSELECT 1 AS ocel_id;\nCREATE VIEW "object" AS\nSELECT 2 AS ocel_id;',
    );
  });

  it("doubles an embedded quote in a view name", () => {
    const c = compiled({ views: [{ name: 'weird"name', body: "SELECT 1" }] });
    expect(compiledDdl(c)).toContain('"weird""name"');
  });

  it("is empty for a compile with no relations", () => {
    expect(compiledDdl(compiled())).toBe("");
  });
});

describe("compiledMaterializeDdl", () => {
  it("uses CREATE TABLE instead of CREATE VIEW", () => {
    const c = compiled({ views: [{ name: "event", body: "SELECT 1" }] });
    expect(compiledMaterializeDdl(c)).toBe('CREATE TABLE "event" AS\nSELECT 1;');
  });
});

describe("withPrelude", () => {
  it("returns the analysis SQL unchanged when there are no views", () => {
    expect(withPrelude(compiled(), "SELECT * FROM event")).toBe("SELECT * FROM event");
  });

  it("binds every view as a WITH CTE ahead of the analysis SQL", () => {
    const c = compiled({
      views: [
        { name: "event", body: "SELECT 1 AS ocel_id" },
        { name: "object", body: "SELECT 2 AS ocel_id" },
      ],
    });
    expect(withPrelude(c, "SELECT * FROM event")).toBe(
      'WITH "event" AS (\nSELECT 1 AS ocel_id\n),\n"object" AS (\nSELECT 2 AS ocel_id\n)\nSELECT * FROM event',
    );
  });
});

describe("compiledProbeStatements", () => {
  it("wraps each probe's bare sql (which may name a view directly) with the view prelude, so it runs standalone", () => {
    const c = compiled({
      views: [{ name: "object", body: "SELECT 1 AS ocel_id" }],
      probes: [
        {
          mapping: null,
          kind: "AmbiguousObjectIdentity",
          sql: 'SELECT ocel_id FROM "object" GROUP BY ocel_id HAVING COUNT(*) > 1',
        },
      ],
    });
    const stmts = compiledProbeStatements(c);
    expect(stmts).toHaveLength(1);
    expect(stmts[0].sql).toBe(
      'WITH "object" AS (\nSELECT 1 AS ocel_id\n)\nSELECT ocel_id FROM "object" GROUP BY ocel_id HAVING COUNT(*) > 1',
    );
    expect(stmts[0].probe.kind).toBe("AmbiguousObjectIdentity");
  });
});

describe("describeMappingTarget / describeCompileErrorTarget", () => {
  it("prefers the mapping's label over its path", () => {
    expect(describeMappingTarget({ index: 0, label: "orders", path: "$.mappings[0]" })).toBe("orders");
  });

  it("falls back to the path when there is no label", () => {
    expect(describeMappingTarget({ index: 0, label: null, path: "$.mappings[0]" })).toBe("$.mappings[0]");
  });

  it("reads '(blueprint)' for a whole-blueprint error/probe (mapping: null)", () => {
    expect(describeMappingTarget(null)).toBe("(blueprint)");
    expect(
      describeCompileErrorTarget({ mapping: null, reason: { Invalid: { detail: "bad version" } } }),
    ).toBe("(blueprint)");
  });
});

describe("describeRejectReason", () => {
  it("renders SynthesizedId", () => {
    expect(describeRejectReason({ SynthesizedId: { field: "id" } })).toContain("'id' is absent");
  });

  it("renders DynamicTypeName with its detail", () => {
    const text = describeRejectReason({
      DynamicTypeName: { field: "type", detail: "no domain for 'orders'.'status'" },
    });
    expect(text).toContain("'type'");
    expect(text).toContain("no domain for 'orders'.'status'");
  });

  it("renders AttributeCoercion naming attribute, column and declared type", () => {
    const text = describeRejectReason({
      AttributeCoercion: { attribute: "amount", column: "amount", col_type: "VARCHAR", declared: "Float" },
    });
    expect(text).toContain("'amount'");
    expect(text).toContain("VARCHAR");
    expect(text).toContain("Float");
  });

  it("falls back to a JSON dump for an unrecognized shape (forward-compat with #[non_exhaustive])", () => {
    const text = describeRejectReason({ SomeFutureVariant: { detail: "x" } } as unknown as RejectReason);
    expect(text).toContain("unrecognized compile error");
  });
});

describe("describeProbeKind", () => {
  it("renders the three bare-string variants", () => {
    expect(describeProbeKind("AmbiguousObjectIdentity")).toContain("object id");
    expect(describeProbeKind("AmbiguousEventIdentity")).toContain("event id");
    expect(describeProbeKind("AmbiguousStaticObjectAttributes")).toContain("static attribute");
  });

  it("renders StaleTypeDomain naming the column", () => {
    expect(describeProbeKind({ StaleTypeDomain: { column: "status" } })).toContain("'status'");
  });
});
