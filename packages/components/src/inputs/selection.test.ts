import { describe, expect, it } from "vitest";
import { filterByQuery, selectTopN, sortByCountDesc, toggle } from "./selection";

const items = [
  { key: "review", count: 3 },
  { key: "decide", count: 7 },
  { key: "register", count: 1 },
];

describe("selection helpers", () => {
  it("sorts by count descending", () => {
    expect(sortByCountDesc(items).map((i) => i.key)).toEqual(["decide", "review", "register"]);
  });
  it("filters by case-insensitive substring", () => {
    expect(filterByQuery(items, "RE").map((i) => i.key)).toEqual(["review", "register"]);
  });
  it("selects the top N by count", () => {
    expect(selectTopN(items, 2)).toEqual(new Set(["decide", "review"]));
  });
  it("toggle adds then removes a key, returning new sets", () => {
    const a = toggle(new Set<string>(), "x");
    expect(a.has("x")).toBe(true);
    const b = toggle(a, "x");
    expect(b.has("x")).toBe(false);
    expect(a.has("x")).toBe(true);
  });
});
