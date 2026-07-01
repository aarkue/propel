import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { computeNodeOutput, topologicalOrder } from "./graph";
import type { AppNode } from "./types";

const edge = (source: string, target: string): Edge => ({ id: `${source}->${target}`, source, target });
const edgeH = (source: string, target: string, targetHandle: string): Edge => ({
  id: `${source}->${target}:${targetHandle}`,
  source,
  target,
  targetHandle,
});
// computeNodeOutput only reads id/type/data; stub the rest of the Node shape.
const node = (id: string, type: string, data: unknown): AppNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as unknown as AppNode;
const noRun = async (): Promise<unknown> => {
  throw new Error("runFunction should not be called");
};

describe("topologicalOrder", () => {
  it("orders a linear chain input -> fn -> output", () => {
    const order = topologicalOrder(["obj", "fn", "out"], [edge("obj", "fn"), edge("fn", "out")]);
    expect(order).toEqual(["obj", "fn", "out"]);
  });

  it("places every node after all its inputs (diamond)", () => {
    // a -> b, a -> c, b -> d, c -> d
    const order = topologicalOrder(
      ["a", "b", "c", "d"],
      [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
    );
    const pos = (id: string) => order.indexOf(id);
    expect(pos("a")).toBeLessThan(pos("b"));
    expect(pos("a")).toBeLessThan(pos("c"));
    expect(pos("b")).toBeLessThan(pos("d"));
    expect(pos("c")).toBeLessThan(pos("d"));
  });

  it("keeps isolated nodes", () => {
    expect(topologicalOrder(["x", "y"], []).sort()).toEqual(["x", "y"]);
  });

  it("throws on a cycle", () => {
    expect(() => topologicalOrder(["a", "b"], [edge("a", "b"), edge("b", "a")])).toThrow(/cycle/i);
  });

  it("ignores edges referencing unknown nodes", () => {
    const order = topologicalOrder(["a", "b"], [edge("a", "b"), edge("a", "ghost")]);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("computeNodeOutput", () => {
  it("primitive returns its value", async () => {
    expect(await computeNodeOutput(node("p", "primitive", { value: 42 }), [], new Map(), noRun)).toBe(42);
  });

  it("object returns its selected object handle", async () => {
    expect(
      await computeNodeOutput(node("o", "object", { selectedObject: "log-1" }), [], new Map(), noRun),
    ).toBe("log-1");
  });

  it("function gathers inputs by targetHandle and calls runFunction with them", async () => {
    const fn = node("f", "function", { functionMeta: { id: "bind::x" } });
    const edges = [edgeH("a", "f", "log"), edgeH("b", "f", "threshold")];
    const results = new Map<string, unknown>([
      ["a", "L"],
      ["b", 5],
    ]);
    const calls: Array<[string, Record<string, unknown>]> = [];
    const run = async (id: string, args: Record<string, unknown>) => {
      calls.push([id, args]);
      return "OUT";
    };
    expect(await computeNodeOutput(fn, edges, results, run)).toBe("OUT");
    expect(calls).toEqual([["bind::x", { log: "L", threshold: 5 }]]);
  });

  it("struct tuple assembles item-N slots, null for an unconnected slot", async () => {
    const n = node("t", "struct", { schema: { prefixItems: [{}, {}, {}] } });
    const edges = [edgeH("a", "t", "item-0"), edgeH("b", "t", "item-2")];
    const results = new Map<string, unknown>([
      ["a", "x"],
      ["b", "z"],
    ]);
    expect(await computeNodeOutput(n, edges, results, noRun)).toEqual(["x", null, "z"]);
  });

  it("struct object gathers named inputs by handle", async () => {
    const n = node("s", "struct", { schema: {} });
    const edges = [edgeH("a", "s", "name"), edgeH("b", "s", "age")];
    const results = new Map<string, unknown>([
      ["a", "Ann"],
      ["b", 30],
    ]);
    expect(await computeNodeOutput(n, edges, results, noRun)).toEqual({ name: "Ann", age: 30 });
  });

  it("struct enum returns its own value", async () => {
    const n = node("e", "struct", { schema: { oneOf: [] }, value: "A" });
    expect(await computeNodeOutput(n, [], new Map(), noRun)).toBe("A");
  });

  it("array maps item-N slots, undefined for an unconnected slot", async () => {
    const n = node("arr", "array", { itemCount: 3 });
    const edges = [edgeH("a", "arr", "item-0"), edgeH("b", "arr", "item-2")];
    const results = new Map<string, unknown>([
      ["a", 1],
      ["b", 3],
    ]);
    expect(await computeNodeOutput(n, edges, results, noRun)).toEqual([1, undefined, 3]);
  });

  it("jsonView passes through its single input", async () => {
    const n = node("v", "jsonView", {});
    const results = new Map<string, unknown>([["src", { ok: true }]]);
    expect(await computeNodeOutput(n, [edge("src", "v")], results, noRun)).toEqual({ ok: true });
  });

  it("artifact node outputs its embedded value", async () => {
    const n = node("a1", "artifact", { value: { places: {} }, returnType: "PetriNet" });
    expect(await computeNodeOutput(n, [], new Map(), noRun)).toEqual({ places: {} });
  });
});
