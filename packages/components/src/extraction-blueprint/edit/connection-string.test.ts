import { describe, expect, it } from "vitest";
import {
  buildConnectionString,
  describeConnection,
  EMPTY_DRAFT,
  isAutoSourceId,
  maskSecrets,
  parseConnectionString,
  suggestedSourceId,
} from "./connection-string";
import { previewSplit } from "./SplitSpecEditor";

describe("suggestedSourceId", () => {
  it("names a file source after the file, without its extension", () => {
    expect(suggestedSourceId("sqlite:///data/olist.sqlite")).toBe("olist");
    expect(suggestedSourceId("csv:///data/order items.csv")).toBe("order_items");
    expect(suggestedSourceId("C:\\data\\warehouse.duckdb")).toBe("warehouse");
  });

  it("names a Postgres source after its database", () => {
    expect(suggestedSourceId("postgres://u:p@host:5432/shop")).toBe("shop");
  });

  // `item://` is not a connection string: parsed as one it falls through to `custom` with an empty path.
  it("names a registry-held source after its item id", () => {
    expect(suggestedSourceId("item://flight-list-202201")).toBe("flight-list-202201");
    expect(suggestedSourceId("item://order items")).toBe("order_items");
  });

  it("is empty when the string suggests nothing, so the caller keeps its id", () => {
    expect(suggestedSourceId("")).toBe("");
    expect(suggestedSourceId("some-opaque-dsn")).toBe("");
  });

  it("only placeholder ids may be replaced", () => {
    expect(isAutoSourceId("source")).toBe(true);
    expect(isAutoSourceId("source-2")).toBe(true);
    expect(isAutoSourceId("olist")).toBe(false);
    expect(isAutoSourceId("source-db")).toBe(false);
  });
});

describe("buildConnectionString", () => {
  it("adds the scheme a bare path is missing", () => {
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "sqlite", path: "/data/x.sqlite" })).toBe(
      "sqlite:///data/x.sqlite",
    );
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "csv", path: "/data/x.csv" })).toBe(
      "csv:///data/x.csv",
    );
  });

  it("does not double the scheme when the path already carries one", () => {
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "csv", path: "csv:///data/x.csv" })).toBe(
      "csv:///data/x.csv",
    );
  });

  it("percent-encodes a CSV delimiter, so a tab or an ampersand survives the query string", () => {
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "csv", path: "/x.csv", delimiter: "\t" })).toBe(
      "csv:///x.csv?delimiter=%09",
    );
  });

  it("omits the delimiter parameter entirely when it is the default", () => {
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "csv", path: "/x.csv" })).toBe("csv:///x.csv");
  });

  it("builds a Postgres URL, omitting the auth section when there is no user", () => {
    expect(
      buildConnectionString({
        ...EMPTY_DRAFT,
        kind: "postgres",
        host: "db",
        port: "5433",
        database: "erp",
      }),
    ).toBe("postgres://db:5433/erp");
    expect(
      buildConnectionString({
        ...EMPTY_DRAFT,
        kind: "postgres",
        host: "db",
        port: "",
        user: "u",
        password: "p",
        database: "erp",
      }),
    ).toBe("postgres://u:p@db/erp");
  });

  it("passes a custom string through untouched", () => {
    const raw = "postgres://u@h/db?sslmode=require&application_name=x";
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "custom", raw })).toBe(raw);
  });
});

describe("parseConnectionString", () => {
  it("recognises each scheme", () => {
    expect(parseConnectionString("csv:///x.csv").kind).toBe("csv");
    expect(parseConnectionString("sqlite:///x.sqlite").kind).toBe("sqlite");
    expect(parseConnectionString("duckdb:///x.duckdb").kind).toBe("duckdb");
    expect(parseConnectionString("postgres://h/db").kind).toBe("postgres");
  });

  it("recognises a bare path by its extension", () => {
    expect(parseConnectionString("/data/orders.csv")).toMatchObject({
      kind: "csv",
      path: "/data/orders.csv",
    });
    expect(parseConnectionString("/data/erp.db")).toMatchObject({ kind: "sqlite" });
  });

  it("reads a password containing an @, which a naive split would cut in the wrong place", () => {
    const d = parseConnectionString("postgres://u:p%40ss@host:5432/erp");
    expect(d).toMatchObject({ user: "u", password: "p@ss", host: "host", port: "5432", database: "erp" });
  });

  it("falls back to custom for anything it cannot read, keeping the text verbatim", () => {
    const raw = "weird://not-a-known-scheme";
    const d = parseConnectionString(raw);
    expect(d.kind).toBe("custom");
    expect(d.raw).toBe(raw);
  });

  it("falls back to custom for a Postgres URL with query params, since no field would round-trip them", () => {
    const raw = "postgres://u@h/db?sslmode=require&application_name=x";
    const d = parseConnectionString(raw);
    expect(d.kind).toBe("custom");
    expect(d.raw).toBe(raw);
  });

  it("reads a CSV delimiter when other query params surround it", () => {
    expect(parseConnectionString("csv:///x.csv?quote=%22&delimiter=%3B")).toMatchObject({
      kind: "csv",
      path: "/x.csv",
      delimiter: ";",
    });
  });

  it("round-trips what it parses", () => {
    for (const s of ["csv:///x.csv?delimiter=%3B", "sqlite:///x.sqlite", "postgres://u:p@h:5432/db"]) {
      expect(buildConnectionString(parseConnectionString(s))).toBe(s);
    }
  });
});

describe("describeConnection / maskSecrets", () => {
  it("never shows a password", () => {
    const described = describeConnection("postgres://u:hunter2@h:5432/db");
    expect(described).not.toContain("hunter2");
    expect(maskSecrets("postgres://u:hunter2@h/db")).toBe("postgres://u:****@h/db");
  });

  it("says so when nothing is configured", () => {
    expect(describeConnection("")).toBe("not configured");
  });
});

describe("previewSplit", () => {
  it("splits on a delimiter and trims when asked", () => {
    expect(previewSplit({ kind: { type: "delimiter", delimiter: "," }, trim: true }, "a, b ,c")).toEqual({
      values: ["a", "b", "c"],
    });
    expect(previewSplit({ kind: { type: "delimiter", delimiter: "," }, trim: false }, "a, b")).toEqual({
      values: ["a", " b"],
    });
  });

  it("uses each capture group when the pattern has any", () => {
    expect(
      previewSplit({ kind: { type: "regex", pattern: "id=(\\d+)" }, trim: true }, "id=42; id=57"),
    ).toEqual({ values: ["42", "57"] });
  });

  it("uses the whole match when the pattern has no groups", () => {
    expect(
      previewSplit({ kind: { type: "regex", pattern: "ORD-\\d+" }, trim: true }, "ORD-1, ORD-2"),
    ).toEqual({ values: ["ORD-1", "ORD-2"] });
  });

  it("reports a malformed pattern instead of throwing", () => {
    const r = previewSplit({ kind: { type: "regex", pattern: "([" }, trim: true }, "x");
    expect(r).toHaveProperty("error");
  });
});

describe("parquet", () => {
  it("round-trips a path through the scheme", () => {
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "parquet", path: "/data/orders.parquet" })).toBe(
      "parquet:///data/orders.parquet",
    );
    // An already-prefixed path is not prefixed twice.
    expect(
      buildConnectionString({ ...EMPTY_DRAFT, kind: "parquet", path: "parquet:///data/o.parquet" }),
    ).toBe("parquet:///data/o.parquet");
  });

  it("reads back both the scheme and a bare suffix, the two forms dbcon dispatches on", () => {
    expect(parseConnectionString("parquet:///data/orders.parquet").kind).toBe("parquet");
    expect(parseConnectionString("/data/orders.parquet").kind).toBe("parquet");
    expect(parseConnectionString("/data/ORDERS.PARQUET").kind).toBe("parquet");
    expect(parseConnectionString("parquet:///data/orders.parquet").path).toBe("/data/orders.parquet");
  });

  it("describes and names a source from it", () => {
    expect(describeConnection("parquet:///data/orders.parquet")).toBe("Parquet file - /data/orders.parquet");
    expect(suggestedSourceId("/data/orders.parquet")).toBe("orders");
  });
});

describe("xlsx", () => {
  it("round-trips a path through the scheme", () => {
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "xlsx", path: "/data/log.xlsx" })).toBe(
      "xlsx:///data/log.xlsx",
    );
    expect(buildConnectionString({ ...EMPTY_DRAFT, kind: "xlsx", path: "xlsx:///data/log.xlsx" })).toBe(
      "xlsx:///data/log.xlsx",
    );
  });

  it("reads back both the scheme and a bare suffix, the two forms dbcon dispatches on", () => {
    expect(parseConnectionString("xlsx:///data/log.xlsx").kind).toBe("xlsx");
    expect(parseConnectionString("/data/log.xlsx").kind).toBe("xlsx");
    expect(parseConnectionString("/data/LOG.XLSX").kind).toBe("xlsx");
    expect(parseConnectionString("xlsx:///data/log.xlsx").path).toBe("/data/log.xlsx");
  });

  it("describes and names a source from it", () => {
    expect(describeConnection("xlsx:///data/log.xlsx")).toBe("Excel workbook - /data/log.xlsx");
    expect(suggestedSourceId("/data/log.xlsx")).toBe("log");
  });
});
