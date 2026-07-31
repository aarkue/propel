import { describe, expect, it } from "vitest";
import { addConnectionEntry, removeConnectionEntry, setConnectionEntry } from "./connections-ops";

// These functions' signatures alone are the invariant: `Record<string,string>` in, same out --
// no `Blueprint`/`EditorBlueprint` parameter exists for them to touch, so a connection string has
// no route into the blueprint. (`ConnectionsDialog.tsx` does call `mutate`, but only through
// `renameSourceId`, which takes a source id and never a connection string.)
describe("connections-ops (editing connections never touches the blueprint)", () => {
  it("addConnectionEntry mints a fresh, non-colliding source id", () => {
    const next = addConnectionEntry({ source: "a", source1: "b" });
    expect(Object.keys(next)).toContain("source2");
    expect(next.source).toBe("a");
    expect(next.source1).toBe("b");
  });

  it("removeConnectionEntry drops exactly the named entry", () => {
    const next = removeConnectionEntry({ a: "1", b: "2" }, "a");
    expect(next).toEqual({ b: "2" });
  });

  it("setConnectionEntry renames a key while preserving the others", () => {
    const next = setConnectionEntry({ a: "1", b: "2" }, "a", "renamed", "1");
    expect(next).toEqual({ renamed: "1", b: "2" });
  });
});
