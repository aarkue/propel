import { describe, expect, it } from "vitest";
import {
  connectionForDroppedText,
  connectionStringForPath,
  isExtractionSource,
  isExtractionSourceFile,
  routeConnections,
  sourceItemFormat,
} from "./extraction-sources";

describe("isExtractionSource (the path route, via dbcon)", () => {
  it("accepts every extension dbcon can open, whatever the case", () => {
    for (const name of ["shop.sqlite", "shop.SQLite3", "shop.DB", "rows.csv", "rows.PARQUET"]) {
      expect(isExtractionSource(name)).toBe(true);
    }
  });

  it("rejects log formats and files with no extension", () => {
    for (const name of ["log.xes", "log.ocel", "README", "archive.tar.gz"]) {
      expect(isExtractionSource(name)).toBe(false);
    }
  });

  it("does not read a dotfile's name as an extension", () => {
    expect(isExtractionSource(".sqlite")).toBe(false);
  });

  it("looks only at the last path segment, so a dotted directory is not an extension", () => {
    expect(isExtractionSource("/home/a.csv/notes")).toBe(false);
    expect(isExtractionSource("/home/a.b/shop.sqlite")).toBe(true);
  });
});

describe("isExtractionSourceFile (the bytes route, via the registry)", () => {
  it("accepts every format `extraction_discover_catalog_items` opens from memory", () => {
    // SQLite it reads itself; CSV, TSV and Parquet it hands to `dbcon`. All of them are bytes,
    // so all of them work where there is no filesystem.
    for (const name of ["shop.sqlite", "shop.SQLITE3", "shop.db", "rows.csv", "rows.parquet"]) {
      expect(isExtractionSourceFile(name)).toBe(true);
    }
  });

  it("rejects what is not a tabular source at all", () => {
    for (const name of ["log.xes", "README", "notes.txt"]) {
      expect(isExtractionSourceFile(name)).toBe(false);
    }
  });

  it("is never wider than the path route", () => {
    for (const name of ["shop.sqlite", "shop.db", "rows.csv", "log.xes", "README"]) {
      if (isExtractionSourceFile(name)) expect(isExtractionSource(name)).toBe(true);
    }
  });
});

describe("sourceItemFormat", () => {
  it("gives the lowercased extension a TabularSource should be stored as", () => {
    expect(sourceItemFormat("Shop.SQLite3")).toBe("sqlite3");
    expect(sourceItemFormat("shop.db")).toBe("db");
  });

  it("covers the file-backed formats, and nothing else", () => {
    expect(sourceItemFormat("rows.csv")).toBe("csv");
    expect(sourceItemFormat("rows.parquet")).toBe("parquet");
    for (const name of ["log.xes", "README", ".sqlite"]) {
      expect(sourceItemFormat(name)).toBeUndefined();
      expect(isExtractionSourceFile(name)).toBe(false);
    }
  });
});

describe("connectionStringForPath", () => {
  it("gives sqlite its scheme and leaves csv/parquet as bare paths", () => {
    expect(connectionStringForPath("/data/shop.sqlite")).toBe("sqlite:///data/shop.sqlite");
    expect(connectionStringForPath("/data/shop.db")).toBe("sqlite:///data/shop.db");
    expect(connectionStringForPath("/data/rows.csv")).toBe("/data/rows.csv");
    expect(connectionStringForPath("/data/rows.parquet")).toBe("/data/rows.parquet");
  });

  it("matches the extension case-insensitively", () => {
    expect(connectionStringForPath("C:\\data\\Shop.SQLITE")).toBe("sqlite://C:\\data\\Shop.SQLITE");
  });

  it("returns undefined for anything it cannot open", () => {
    expect(connectionStringForPath("/data/log.xes")).toBeUndefined();
    expect(connectionStringForPath("/data/no-extension")).toBeUndefined();
    expect(connectionStringForPath("/data/dir.sqlite/inner")).toBeUndefined();
  });
});

describe("connectionForDroppedText", () => {
  it("decodes the file:// URI a desktop drop actually carries", () => {
    // Passing the raw uri-list line to `connectionStringForPath` yields the nonsense
    // `sqlite://file:///data/shop.sqlite`, which opens nothing.
    expect(connectionForDroppedText("file:///data/shop.sqlite")).toBe("sqlite:///data/shop.sqlite");
    expect(connectionForDroppedText("file:///data/rows.csv")).toBe("/data/rows.csv");
  });

  it("percent-decodes a path with spaces", () => {
    expect(connectionForDroppedText("file:///data/my%20shop.sqlite")).toBe("sqlite:///data/my shop.sqlite");
  });

  it("still takes a bare path", () => {
    expect(connectionForDroppedText("/data/shop.sqlite")).toBe("sqlite:///data/shop.sqlite");
    expect(connectionForDroppedText("C:\\data\\shop.db")).toBe("sqlite://C:\\data\\shop.db");
  });

  it("refuses a bare filename: a browser `File` has no path to connect to", () => {
    expect(connectionForDroppedText("shop.sqlite")).toBeUndefined();
  });

  it("refuses anything it cannot open", () => {
    expect(connectionForDroppedText("file:///data/log.xes")).toBeUndefined();
    expect(connectionForDroppedText("https://example.com/shop.sqlite")).toBeUndefined();
  });
});

describe("routeConnections", () => {
  it("reports nothing to read when there are no connections", () => {
    expect(routeConnections({})).toEqual({ kind: "none" });
  });

  it("ignores blank values, which the connections dialog creates the moment it opens", () => {
    expect(routeConnections({ "source-1": "" })).toEqual({ kind: "none" });
    expect(routeConnections({ "source-1": "", orders: "item://orders" })).toEqual({
      kind: "items",
      sources: { orders: "orders" },
    });
    expect(routeConnections({ "source-1": "", db: "postgres://host/db" })).toEqual({
      kind: "connections",
      connections: { db: "postgres://host/db" },
    });
  });

  it("strips the item:// prefix, leaving the registry id the item bindings expect", () => {
    expect(routeConnections({ shop: "item://shop-2", warehouse: "item://wh" })).toEqual({
      kind: "items",
      sources: { shop: "shop-2", warehouse: "wh" },
    });
  });

  it("passes connection strings through untouched", () => {
    const conns = { a: "sqlite:///data/shop.sqlite", b: "postgres://u:p@host:5432/db" };
    expect(routeConnections(conns)).toEqual({ kind: "connections", connections: conns });
  });

  it("refuses a mix rather than silently dropping one group", () => {
    // Running only the item sources would produce a log missing every mapping that reads `pg`,
    // with nothing on screen saying so.
    expect(() => routeConnections({ shop: "item://shop", pg: "postgres://host/db" })).toThrow(
      /mixes imported files/,
    );
  });

  it("names both groups in the mixed-source error, so the fix is obvious", () => {
    let message = "";
    try {
      routeConnections({ shop: "item://shop", pg: "postgres://host/db", csv: "/data/x.csv" });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("shop");
    expect(message).toContain("pg");
    expect(message).toContain("csv");
  });
});
