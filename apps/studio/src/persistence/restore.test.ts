import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { usePipelines } from "../stores/pipelines";
import { deleteProjectRoots, deleteSession, putRoot, putSession } from "./idb";
import { getLiveLayout, PANELS_KEY, setLiveLayout } from "./session";
import { lastSessionInfo, loadProjectIntoEngine, loadProjectPipelines, remapLayoutParams } from "./restore";

// getCurrentProject falls back to "default" in the test env (no persisted current-project id).
const PROJECT = "default";
const emptySession = { manifest: { version: 1 as const, roots: [], derived: [] }, workspace: {} };
const sessionWithRoot = {
  manifest: {
    version: 1 as const,
    roots: [
      {
        id: "r1",
        kind: "EventLog",
        label: "L",
        format: "xes",
        storeKind: "dataset" as const,
        ref: { kind: "idb" as const, key: "r1" },
      },
    ],
    derived: [],
  },
  workspace: {},
};
const stub = (kind: string, objects: unknown[] = []) => ({ kind, listObjects: async () => objects }) as never;

beforeEach(async () => {
  await deleteSession(PROJECT);
  await deleteProjectRoots(PROJECT);
});

describe("lastSessionInfo", () => {
  it("offers Continue on any backend when the engine holds live objects (reloaded tauri/webserver)", async () => {
    expect(await lastSessionInfo(stub("tauri", [{ id: "x" }]))).toEqual({ name: "Default", datasets: 1 });
    expect(await lastSessionInfo(stub("http", [{ id: "x" }]))).not.toBeNull();
  });

  it("offers Continue on any backend when the engine is empty and a non-empty saved session exists", async () => {
    await putSession(PROJECT, sessionWithRoot);
    expect(await lastSessionInfo(stub("tauri"))).toEqual({ name: "Default", datasets: 1 });
    expect(await lastSessionInfo(stub("wasm"))).toEqual({ name: "Default", datasets: 1 });
  });

  it("offers nothing when the saved session is empty (nothing worth continuing)", async () => {
    await putSession(PROJECT, emptySession);
    expect(await lastSessionInfo(stub("wasm"))).toBeNull();
  });

  it("offers Continue when the engine is empty and cached roots exist without a session", async () => {
    await putRoot({
      projectId: PROJECT,
      id: "r1",
      kind: "EventLog",
      format: "xes",
      label: "L",
      storeKind: "dataset",
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });
    expect(await lastSessionInfo(stub("wasm"))).not.toBeNull();
  });

  it("offers nothing when the engine is empty and nothing is cached", async () => {
    expect(await lastSessionInfo(stub("wasm"))).toBeNull();
    expect(await lastSessionInfo(stub("tauri"))).toBeNull();
  });
});

describe("loadProjectPipelines", () => {
  it("loads a project's saved pipelines into the store, empties when none", async () => {
    usePipelines.getState().clear();
    await putSession("default", {
      manifest: { version: 1, roots: [], derived: [] },
      workspace: {},
      pipelines: { saved: [{ name: "p", nodes: [], edges: [], createdAt: 1 }] },
    });
    await loadProjectPipelines("default");
    expect(usePipelines.getState().saved).toHaveLength(1);

    await putSession("other", { manifest: { version: 1, roots: [], derived: [] }, workspace: {} });
    await loadProjectPipelines("other");
    expect(usePipelines.getState().saved).toHaveLength(0);
  });
});

describe("remapLayoutParams", () => {
  const idMap = new Map([["d-old", "d-new"]]);
  const layout = JSON.stringify({
    panels: {
      p1: { id: "p1", contentComponent: "traceBrowser", title: "d-old", params: { datasetId: "d-old" } },
      p2: { id: "p2", contentComponent: "logVariants", params: { datasetId: "root-1" } },
      p3: { id: "p3", contentComponent: "about", params: { datasetId: "unknown", controls: { axis: "x" } } },
    },
  });

  it("rewrites a churned derived id inside params, leaving root/unknown ids and non-params fields", () => {
    const out = JSON.parse(remapLayoutParams(layout, idMap));
    expect(out.panels.p1.params.datasetId).toBe("d-new");
    expect(out.panels.p1.title).toBe("d-old");
    expect(out.panels.p2.params.datasetId).toBe("root-1");
    expect(out.panels.p3.params.datasetId).toBe("unknown");
    expect(out.panels.p3.params.controls).toEqual({ axis: "x" });
  });

  it("returns the input unchanged for an empty map or unparseable layout", () => {
    expect(remapLayoutParams(layout, new Map())).toBe(layout);
    expect(remapLayoutParams("{not json", idMap)).toBe("{not json");
  });
});

describe("derived-dataset id remap on restore", () => {
  it("rewrites a persisted panel's datasetId to the replayed derived id", async () => {
    setLiveLayout(null);
    const oldId = "derived-old";
    const newId = "derived-new";
    const layout = JSON.stringify({
      panels: {
        p1: { id: "p1", contentComponent: "traceBrowser", params: { datasetId: oldId, controls: { a: 1 } } },
      },
    });
    await putSession(PROJECT, {
      manifest: {
        version: 1 as const,
        roots: [],
        derived: [
          {
            id: oldId,
            kind: "EventLog",
            label: "Derived",
            storeKind: "dataset" as const,
            provenance: { sources: [], op: { fn: "app::replay", args: {} }, source_gen: 0 },
          },
        ],
      },
      workspace: { [PANELS_KEY]: layout },
    });
    const backend = {
      listObjects: async () => [],
      callBinding: async () => newId,
    } as never;

    await loadProjectIntoEngine(backend, PROJECT);

    const applied = JSON.parse(getLiveLayout() ?? "{}");
    expect(applied.panels.p1.params.datasetId).toBe(newId);
    expect(applied.panels.p1.params.controls).toEqual({ a: 1 });
  });
});
