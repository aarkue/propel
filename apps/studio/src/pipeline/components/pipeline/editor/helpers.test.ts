import { describe, expect, it } from "vitest";
import { outputNameFor } from "./helpers";

describe("outputNameFor", () => {
  it("joins pipeline and node ids with the reserved separator", () => {
    expect(outputNameFor("p1", "n2")).toBe("p1__n2");
  });
});
