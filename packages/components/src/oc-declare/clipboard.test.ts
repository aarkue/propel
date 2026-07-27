import { describe, expect, it } from "vitest";
import { CLIPBOARD_MIME, parseClipboard, serializeSelection } from "./clipboard";

describe("clipboard", () => {
  it("round-trips a selection", () => {
    const sel = { nodes: [{ id: "a", type: "x", kind: "activity" as const }], edges: [] };
    expect(parseClipboard(serializeSelection(sel))).toEqual(sel);
  });
  it("plain-array JSON → arcs fallback", () => {
    const arcs = [
      { from: "a", to: "b", arc_type: "EF", counts: [1, null], label: { each: [], any: [], all: [] } },
    ];
    expect(parseClipboard(JSON.stringify(arcs))).toEqual({ arcs });
  });
  it("garbage → null", () => {
    expect(parseClipboard("not json")).toBeNull();
  });
  it("exposes the MIME type", () => {
    expect(CLIPBOARD_MIME).toBe("application/json+oc-declare-flow");
  });
});
