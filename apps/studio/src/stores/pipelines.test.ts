import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getSession } from "../persistence/idb";
import type { AppNode } from "../pipeline/components/pipeline/editor/types";
import { migrateLegacyPipelines, usePipelines } from "./pipelines";

const lsStore = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, String(v)),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => lsStore.clear(),
  key: (i: number) => [...lsStore.keys()][i] ?? null,
  get length() {
    return lsStore.size;
  },
} as Storage;

const objNode = (id: string): AppNode =>
  ({ id, type: "object", position: { x: 0, y: 0 }, data: {}, selected: true }) as never;

beforeEach(() => usePipelines.getState().clear());

describe("usePipelines", () => {
  it("saves a pipeline, deduping by name, slimming nodes", () => {
    const s = usePipelines.getState();
    s.savePipeline("p", [objNode("a")], []);
    s.savePipeline("p", [objNode("b")], []); // same name -> replace
    const { saved } = usePipelines.getState();
    expect(saved).toHaveLength(1);
    expect(saved[0].nodes[0].id).toBe("b");
    expect((saved[0].nodes[0] as Record<string, unknown>).selected).toBeUndefined();
  });

  it("deletes a pipeline by name", () => {
    const s = usePipelines.getState();
    s.savePipeline("p", [], []);
    s.deletePipeline("p");
    expect(usePipelines.getState().saved).toHaveLength(0);
  });

  it("stores a slimmed draft and exposes it via snapshot", () => {
    usePipelines.getState().setDraft([objNode("a")], []);
    const snap = usePipelines.getState().snapshot();
    expect(snap.draft?.nodes[0].id).toBe("a");
    expect((snap.draft?.nodes[0] as Record<string, unknown>).selected).toBeUndefined();
  });

  it("load replaces all state; clear empties it", () => {
    usePipelines.getState().load({
      saved: [{ name: "x", nodes: [], edges: [], createdAt: 1 }],
      draft: { nodes: [], edges: [] },
    });
    expect(usePipelines.getState().saved).toHaveLength(1);
    usePipelines.getState().clear();
    expect(usePipelines.getState().saved).toHaveLength(0);
    expect(usePipelines.getState().draft).toBeNull();
  });
});

describe("migrateLegacyPipelines", () => {
  it("folds legacy localStorage pipelines into a project session then clears the keys", async () => {
    localStorage.setItem(
      "r4pm-pipelines",
      JSON.stringify([{ name: "old", nodes: [], edges: [], createdAt: 1 }]),
    );
    localStorage.setItem("r4pm-pipeline-draft", JSON.stringify({ nodes: [], edges: [] }));
    expect(await migrateLegacyPipelines("default")).toBe(true);
    expect(localStorage.getItem("r4pm-pipelines")).toBeNull();
    expect(localStorage.getItem("r4pm-pipeline-draft")).toBeNull();
    const session = await getSession("default");
    expect(session?.pipelines?.saved?.[0]?.name).toBe("old");
    expect(await migrateLegacyPipelines("default")).toBe(false); // idempotent once keys are gone
  });
});
