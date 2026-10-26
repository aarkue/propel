import { describe, expect, it } from "vitest";
import { editingContent, relayoutKey } from "./edit-mode";

describe("editingContent", () => {
  it("needs editable, the tools and no projection", () => {
    expect(editingContent(true, true, false)).toBe(true);
    expect(editingContent(true, false, false)).toBe(false);
    expect(editingContent(false, true, false)).toBe(false);
    expect(editingContent(true, true, true)).toBe(false);
  });
});

describe("relayoutKey", () => {
  it("changes with the direction, the notation and EF/EP merging", () => {
    const base = relayoutKey({ textLabels: false, combineEfEp: true, direction: "RIGHT" });
    expect(relayoutKey({ textLabels: false, combineEfEp: true, direction: "DOWN" })).not.toBe(base);
    expect(relayoutKey({ textLabels: true, combineEfEp: true, direction: "RIGHT" })).not.toBe(base);
    expect(relayoutKey({ textLabels: false, combineEfEp: false, direction: "RIGHT" })).not.toBe(base);
  });
});
