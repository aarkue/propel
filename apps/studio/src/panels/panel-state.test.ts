import { afterEach, describe, expect, it, vi } from "vitest";
import { datasetScopedValue, makeDebouncedWriter, readPanelParam } from "./panel-state";

// Node-only vitest env, so this covers the pure seams usePanelState/usePanelDraft are built from.

describe("readPanelParam", () => {
  it("returns the stored value when present", () => {
    expect(readPanelParam({ controls: { axis: "x" } }, "controls", null)).toEqual({ axis: "x" });
    expect(readPanelParam({ datasetId: "d1" }, "datasetId", null)).toBe("d1");
  });

  it("falls back to initial when the key is absent, null, or params is undefined", () => {
    expect(readPanelParam({}, "datasetId", null)).toBe(null);
    expect(readPanelParam({ datasetId: null }, "datasetId", "def")).toBe("def");
    expect(readPanelParam(undefined, "controls", 42)).toBe(42);
  });
});

describe("datasetScopedValue", () => {
  const initial = { transforms: [], outName: "transformed" };

  it("returns the stored value when it was written under the active dataset", () => {
    const stored = { forDataset: "d1", value: { transforms: [1], outName: "keep" } };
    expect(datasetScopedValue(stored, "d1", initial)).toEqual({ transforms: [1], outName: "keep" });
  });

  it("clears (returns initial) when the active dataset differs or nothing is stored", () => {
    const stored = { forDataset: "d1", value: { transforms: [1], outName: "keep" } };
    expect(datasetScopedValue(stored, "d2", initial)).toBe(initial);
    expect(datasetScopedValue(null, "d1", initial)).toBe(initial);
    expect(datasetScopedValue(undefined, "d1", initial)).toBe(initial);
  });
});

describe("makeDebouncedWriter", () => {
  afterEach(() => vi.useRealTimers());

  it("does not write until the debounce elapses, then writes the latest value once", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const w = makeDebouncedWriter<number>(write, 400);
    w.schedule(1);
    w.schedule(2);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(2);
  });

  it("flush writes any pending value immediately and cancels the pending timer", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const w = makeDebouncedWriter<string>(write, 400);
    w.schedule("a");
    w.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending is a no-op", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const w = makeDebouncedWriter<string>(write, 400);
    w.flush();
    expect(write).not.toHaveBeenCalled();
  });
});
