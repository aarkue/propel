import { describe, expect, it } from "vitest";
import type { AppNode } from "./components/pipeline/editor/types";
import { slimNode } from "./pipeline-slim";

const node = (over: Partial<AppNode> & { type: string }): AppNode =>
  ({
    id: "n1",
    position: { x: 10, y: 20 },
    data: {},
    ...over,
  }) as AppNode;

describe("slimNode", () => {
  it("drops node-level React Flow transients but keeps position and dimensions", () => {
    const out = slimNode(
      node({
        type: "object",
        selected: true,
        dragging: true,
        resizing: true,
        measured: { width: 5, height: 6 },
        width: 100,
        height: 40,
      } as never),
    );
    expect((out as Record<string, unknown>).selected).toBeUndefined();
    expect((out as Record<string, unknown>).dragging).toBeUndefined();
    expect((out as Record<string, unknown>).resizing).toBeUndefined();
    expect((out as Record<string, unknown>).measured).toBeUndefined();
    expect(out.position).toEqual({ x: 10, y: 20 });
    expect((out as Record<string, unknown>).width).toBe(100);
    expect((out as Record<string, unknown>).height).toBe(40);
  });

  it("drops per-run data but keeps user input value", () => {
    const out = slimNode(
      node({ type: "primitive", data: { value: 42, output: "x", executionStatus: "done" } } as never),
    );
    expect((out.data as Record<string, unknown>).value).toBe(42);
    expect((out.data as Record<string, unknown>).output).toBeUndefined();
    expect((out.data as Record<string, unknown>).executionStatus).toBeUndefined();
  });

  it("drops a jsonView's rendered result", () => {
    const out = slimNode(
      node({ type: "jsonView", data: { value: { big: true }, returnType: "OCEL", hasRun: true } } as never),
    );
    expect((out.data as Record<string, unknown>).value).toBeUndefined();
    expect((out.data as Record<string, unknown>).returnType).toBeUndefined();
    expect((out.data as Record<string, unknown>).hasRun).toBeUndefined();
  });
});
