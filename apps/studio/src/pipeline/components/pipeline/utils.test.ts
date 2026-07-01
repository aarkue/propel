import { describe, expect, it } from "vitest";
import type { ExtendedJSONSchema } from "../../BackendContext";
import { isCompatible } from "./utils";

const s = (o: Record<string, unknown>) => o as ExtendedJSONSchema;

describe("isCompatible (pipeline edge type-checking)", () => {
  it("matches identical registry-ref handles", () => {
    expect(isCompatible(s({ "x-registry-ref": "EventLog" }), s({ "x-registry-ref": "EventLog" }))).toBe(true);
  });

  it("rejects mismatched registry-ref handles", () => {
    expect(isCompatible(s({ "x-registry-ref": "EventLog" }), s({ "x-registry-ref": "OCEL" }))).toBe(false);
  });

  it("rejects a handle source feeding a non-handle target", () => {
    expect(isCompatible(s({ "x-registry-ref": "EventLog" }), s({ type: "string" }))).toBe(false);
  });

  it("matches equal primitive types", () => {
    expect(isCompatible(s({ type: "number" }), s({ type: "number" }))).toBe(true);
  });

  it("rejects mismatched primitive types", () => {
    expect(isCompatible(s({ type: "number" }), s({ type: "string" }))).toBe(false);
  });

  it("matches when a union source overlaps the target type", () => {
    expect(isCompatible(s({ type: ["string", "null"] }), s({ type: "string" }))).toBe(true);
  });

  it("matches named structs only when the names agree", () => {
    expect(
      isCompatible(s({ type: "object", title: "PetriNet" }), s({ type: "object", title: "PetriNet" })),
    ).toBe(true);
  });

  it("rejects distinct named structs even though both are objects", () => {
    expect(
      isCompatible(s({ type: "object", title: "Map_of_uint" }), s({ type: "object", title: "PetriNet" })),
    ).toBe(false);
  });

  it("stays permissive for unnamed object shapes", () => {
    expect(isCompatible(s({ type: "object" }), s({ type: "object", title: "PetriNet" }))).toBe(true);
  });

  it("treats an 'any' target as accepting anything", () => {
    expect(isCompatible(s({ type: "object", title: "PetriNet" }), s({ type: "any" }))).toBe(true);
  });

  it("allows a convertible registry-ref source into a different-kind target", () => {
    const conv = (from: string, to: string) => from === "EventLog" && to === "EventLogActivityProjection";
    expect(
      isCompatible(
        s({ "x-registry-ref": "EventLog" }),
        s({ "x-registry-ref": "EventLogActivityProjection" }),
        conv,
      ),
    ).toBe(true);
  });

  it("still rejects non-convertible mismatched handles", () => {
    const conv = () => false;
    expect(isCompatible(s({ "x-registry-ref": "EventLog" }), s({ "x-registry-ref": "OCEL" }), conv)).toBe(
      false,
    );
  });

  it("matches identical refs even without a predicate", () => {
    expect(isCompatible(s({ "x-registry-ref": "EventLog" }), s({ "x-registry-ref": "EventLog" }))).toBe(true);
  });
});
