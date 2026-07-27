import { describe, expect, it } from "vitest";
import { defaultConnectLabel, defaultTemplate } from "./auto-label";

const act = (type: string) => ({ id: type, type, kind: "activity" as const });
const obj = (type: string) => ({ id: type, type, kind: "init" as const });

describe("auto-label", () => {
  it("defaultTemplate: as if any object endpoint, else ef", () => {
    expect(defaultTemplate("activity", "activity")).toBe("ef");
    expect(defaultTemplate("activity", "init")).toBe("as");
  });

  it("both activities → intersection of related object types as `all`", () => {
    const related = (a: string): Record<string, number> =>
      a === "place" ? { order: 5, item: 2 } : { order: 3 };
    const label = defaultConnectLabel(act("place"), act("pay"), related);
    expect(label.all).toEqual([{ object_type: "order", type: "Simple" }]);
    expect(label.each).toEqual([]);
    expect(label.any).toEqual([]);
  });

  it("object + activity → any:[Simple(objectType)]", () => {
    const label = defaultConnectLabel(obj("order"), act("pay"), () => ({}));
    expect(label.any).toEqual([{ object_type: "order", type: "Simple" }]);
  });

  it("both objects → any:[O2O(source,target)]", () => {
    const label = defaultConnectLabel(obj("order"), obj("item"), () => ({}));
    expect(label.any).toEqual([{ first: "order", second: "item", reversed: false, type: "O2O" }]);
  });
});
