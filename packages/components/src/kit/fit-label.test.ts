import { describe, expect, it } from "vitest";
import { fitLines } from "./fit-label";

const w = (s: string) => s.length;

describe("fitLines", () => {
  it("wraps at words and ellipsizes the last line", () => {
    expect(fitLines("Create Purchase Requisition Item", 12, 2, 10, 400, w)).toEqual([
      "Create",
      "Purchase...",
    ]);
    expect(fitLines("Create Purchase Requisition", 20, 3, 10, 400, w)).toEqual([
      "Create Purchase",
      "Requisition",
    ]);
  });

  it("cuts a single overlong word", () => {
    expect(fitLines("Zahlungseingangsbestaetigung", 10, 2, 10, 400, w)).toEqual(["Zahlung..."]);
    expect(fitLines("Zahlungseingangsbestaetigung ok", 10, 2, 10, 400, w)).toEqual(["Zahlung...", "ok"]);
  });

  it("keeps short labels", () => {
    expect(fitLines("pay", 10, 2, 10, 400, w)).toEqual(["pay"]);
    expect(fitLines("", 10, 2, 10, 400, w)).toEqual([]);
  });
});
