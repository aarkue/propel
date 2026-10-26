import { describe, expect, it } from "vitest";
import type { Ocpn } from "../viz";
import { fireOcpnDetailed, isOcpnEnabled } from "./sim-ocpn";

const OCPN: Ocpn = {
  places: [
    { name: "o0", object_type: "order" },
    { name: "o1", object_type: "order" },
    { name: "i0", object_type: "item" },
    { name: "i1", object_type: "item" },
  ],
  transitions: [{ name: "place order", label: "place order" }],
  arcs: [
    { source: "o0", target: "place order" },
    { source: "i0", target: "place order", type: "variable" },
    { source: "place order", target: "o1" },
    { source: "place order", target: "i1", type: "variable" },
  ],
  initial_marking: { o0: 1, i0: 2 },
  final_marking: {},
};

describe("the OCPN token game on the flat form", () => {
  it("moves one order and all items through variable arcs", () => {
    const marking = { o0: ["o#0"], i0: ["i#0", "i#1"] };
    expect(isOcpnEnabled(OCPN, marking, "place order")).toBe(true);
    const res = fireOcpnDetailed(OCPN, marking, "place order");
    expect(res?.firing.consume).toEqual({ o0: ["o#0"], i0: ["i#0", "i#1"] });
    expect(res?.marking).toEqual({ o0: [], i0: [], o1: ["o#0"], i1: ["i#0", "i#1"] });
  });

  it("needs a token on a normal input arc", () => {
    expect(isOcpnEnabled(OCPN, { i0: ["i#0"] }, "place order")).toBe(false);
  });
});
