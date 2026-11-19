import { describe, expect, it } from "vitest";
import { inputNodeForArg, summarizeDefault } from "./arg-input";

const at = { x: 0, y: 0 };

describe("summarizeDefault", () => {
  it("shows scalars, null and empty values plainly", () => {
    expect(summarizeDefault(0.2)).toBe("0.2");
    expect(summarizeDefault(true)).toBe("true");
    expect(summarizeDefault("middle")).toBe('"middle"');
    expect(summarizeDefault(null)).toBe("none");
    expect(summarizeDefault([])).toBe("[]");
    expect(summarizeDefault({})).toBe("{}");
  });

  it("shortens objects and arrays", () => {
    expect(summarizeDefault({ activity_key: null, kind: "log", noise: 0.2 })).toBe("{kind: log, ...}");
    expect(summarizeDefault({ annotations: {}, direction: null, terminals: true })).toBe(
      "{terminals: true, ...}",
    );
    expect(summarizeDefault({ base: { a: 1 }, nodes: {} })).toBe("{2 fields}");
    expect(summarizeDefault([1, 2, 3])).toBe("[3 items]");
    expect(summarizeDefault("x".repeat(40))).toHaveLength(28);
  });
});

describe("inputNodeForArg", () => {
  it("picks an object for a registry item", () => {
    const n = inputNodeForArg({ type: "string", "x-registry-ref": "EventLog" }, "log", at, "n");
    expect(n).toMatchObject({ type: "object", data: { type: "EventLog" } });
  });

  it("prefills a nullable primitive with its default", () => {
    const n = inputNodeForArg({ type: ["number", "null"], default: 0.2 }, "noise", at, "n");
    expect(n).toMatchObject({ type: "primitive", data: { type: "number", value: 0.2 } });
  });

  it("selects the default of an enum, also behind a $ref", () => {
    const n = inputNodeForArg(
      {
        $ref: "#/$defs/Preset",
        default: "default",
        $defs: { Preset: { oneOf: [{ const: "default" }, { const: "fast" }] } },
      },
      "preset",
      at,
      "n",
    );
    expect(n).toMatchObject({ type: "struct", data: { value: "default" } });
  });

  it("puts a structured default into a config node", () => {
    const miner = { kind: "log", noise_threshold: 0.2 };
    const n = inputNodeForArg({ type: "object", title: "Miner", default: miner }, "miner", at, "n");
    expect(n).toMatchObject({ type: "preset", data: { value: miner, label: "miner", argType: "Miner" } });
  });

  it("uses a struct node for an object without a default", () => {
    const n = inputNodeForArg({ type: "object", properties: { a: { type: "string" } } }, "o", at, "n");
    expect(n.type).toBe("struct");
  });
});
