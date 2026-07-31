import { describe, expect, it } from "vitest";
import { exportBlueprint, importBlueprint, suggestFilename, SUPPORTED_VERSION } from "./blueprint-file";
import { newBlueprint, type EditorBlueprint } from "../model";
import { defaultEntry } from "./node-draft";

function model(): EditorBlueprint {
  const base = newBlueprint();
  return {
    ...base,
    nodes: [
      {
        id: "orders",
        op: { type: "source", source_id: "erp", table: "orders" },
        position: { x: 10, y: 20 },
      },
    ],
    mappings: [{ id: "mapping-1", entry: defaultEntry("object", "orders", { typeName: "order" }) }],
  };
}

const CONNECTIONS = { erp: "postgres://u:secret@host/db" };

describe("exportBlueprint", () => {
  it("writes the blueprint without connections by default", () => {
    const { json, includedConnections } = exportBlueprint(model(), CONNECTIONS, false);
    expect(includedConnections).toBe(false);
    expect(json).not.toContain("secret");
    expect(JSON.parse(json)).not.toHaveProperty("connections");
  });

  it("includes them only when asked", () => {
    const { json, includedConnections } = exportBlueprint(model(), CONNECTIONS, true);
    expect(includedConnections).toBe(true);
    expect(JSON.parse(json).connections).toEqual(CONNECTIONS);
  });

  it("reports no connections when every entry is blank, so the warning does not fire on nothing", () => {
    const { json, includedConnections } = exportBlueprint(model(), { erp: "" }, true);
    expect(includedConnections).toBe(false);
    expect(JSON.parse(json)).not.toHaveProperty("connections");
  });

  it("drops editor-only state: positions are not part of the document", () => {
    const doc = JSON.parse(exportBlueprint(model(), {}, false).json);
    expect(doc.nodes[0]).not.toHaveProperty("position");
    expect(doc.mappings[0]).not.toHaveProperty("id");
  });
});

describe("importBlueprint", () => {
  it("round-trips a document back to an equivalent model", () => {
    const before = model();
    const result = importBlueprint(exportBlueprint(before, {}, false).json);
    if (!result.ok) throw new Error(result.error);
    expect(result.model.nodes.map((n) => n.op)).toEqual(before.nodes.map((n) => n.op));
    expect(result.model.mappings.map((m) => m.entry)).toEqual(before.mappings.map((m) => m.entry));
    expect(result.model.idRendering).toBe(before.idRendering);
  });

  it("comes back with no positions, so the host knows to run layout", () => {
    const result = importBlueprint(exportBlueprint(model(), {}, false).json);
    if (!result.ok) throw new Error(result.error);
    expect(result.model.nodes.every((n) => !n.position)).toBe(true);
  });

  it("returns the connections a document carried", () => {
    const result = importBlueprint(exportBlueprint(model(), CONNECTIONS, true).json);
    if (!result.ok) throw new Error(result.error);
    expect(result.connections).toEqual(CONNECTIONS);
  });

  it("reports malformed JSON rather than throwing", () => {
    const result = importBlueprint("{not json");
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("Not valid JSON");
  });

  it("names the version as the problem for a document from a newer build", () => {
    const result = importBlueprint(
      JSON.stringify({ version: SUPPORTED_VERSION + 1, nodes: [], mappings: [] }),
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain(String(SUPPORTED_VERSION + 1));
      expect(result.error).toContain("version");
    }
  });

  it("rejects a document that is valid JSON but not a blueprint", () => {
    expect(importBlueprint("[1,2,3]")).toMatchObject({ ok: false });
    expect(importBlueprint('{"hello":"world"}')).toMatchObject({ ok: false });
    expect(importBlueprint('{"version":1}')).toMatchObject({ ok: false });
  });
});

describe("suggestFilename", () => {
  it("names the file after the first table", () => {
    expect(suggestFilename(model())).toBe("orders.blueprint.json");
  });

  it("falls back when there is no table yet", () => {
    expect(suggestFilename(newBlueprint())).toBe("blueprint.blueprint.json");
  });
});
