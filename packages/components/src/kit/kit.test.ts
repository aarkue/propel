import { describe, expect, it } from "vitest";
import { fmtPct, rampColor, rampInk } from "./index";
import { pathSchemaTypeKey, pathSchemaTypeRef } from "../overview/path-schemas";

describe("rampColor", () => {
  it("maps 0..1 onto the accent steps 3..11", () => {
    expect(rampColor(0)).toBe("var(--accent-2)");
    expect(rampColor(0.0001)).toBe("var(--accent-3)");
    expect(rampColor(1)).toBe("var(--accent-11)");
    expect(rampColor(2, "red")).toBe("var(--red-11)");
    expect(rampColor(Number.NaN)).toBe("var(--accent-2)");
  });
  it("picks contrasting ink on dark steps", () => {
    expect(rampInk(0.9)).toBe("var(--accent-contrast)");
    expect(rampInk(0.2)).toBe("var(--accent-12)");
  });
  it("formats shares", () => {
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtPct(1, 0)).toBe("100%");
  });
});

describe("path schema type keys", () => {
  it("round-trip event and object types", () => {
    expect(pathSchemaTypeKey({ Event: "pay order" })).toBe("e:pay order");
    expect(pathSchemaTypeRef("o:orders")).toEqual({ Object: "orders" });
    expect(pathSchemaTypeRef(pathSchemaTypeKey({ Event: "e:x" }))).toEqual({ Event: "e:x" });
  });
});
