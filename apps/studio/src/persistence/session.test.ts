import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../stores/preferences";
import { deleteSession, getRoot, getSession } from "./idb";
import {
  armSessionSaves,
  bootToDefault,
  cacheImportedRoot,
  getCurrentProject,
  getLastProject,
  loadItemCached,
  saveCurrentSession,
} from "./session";

// The node test env has no DOM; the session module reads localStorage, so back it with an in-memory map.
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

interface Call {
  id: string;
  kind: string;
  format: string;
  len: number;
}

function fakeBackend(kind: string) {
  const calls: Call[] = [];
  const backend = {
    kind,
    loadItem: async (id: string, k: string, bytes: Uint8Array, fmt: string) => {
      calls.push({ id, kind: k, format: fmt, len: bytes.length });
    },
  };
  return { backend, calls };
}

async function waitForRoot(id: string, ms = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // No localStorage in the test env, so the current project falls back to "default".
    const r = await getRoot("default", id);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 5));
  }
  return undefined;
}

describe("loadItemCached", () => {
  it("caches source bytes on the wasm backend and still loads", async () => {
    const { backend, calls } = fakeBackend("wasm");
    await loadItemCached(
      backend as never,
      { id: "log9", kind: "EventLog", format: "xes", label: "L" },
      new TextEncoder().encode("data"),
    );
    expect(calls).toHaveLength(1);
    const root = await waitForRoot("log9");
    expect(root?.kind).toBe("EventLog");
    expect(root?.format).toBe("xes");
  });

  it("does not cache on a non-wasm backend", async () => {
    const { backend, calls } = fakeBackend("tauri");
    await loadItemCached(
      backend as never,
      { id: "log_nc", kind: "EventLog", format: "xes", label: "L" },
      new TextEncoder().encode("data"),
    );
    expect(calls).toHaveLength(1);
    expect(await waitForRoot("log_nc", 100)).toBeUndefined();
  });
});

describe("session save guard", () => {
  it("does not persist the session until saves are armed", async () => {
    await deleteSession("default"); // getCurrentProject falls back to "default" in tests
    await saveCurrentSession(); // disarmed at module load
    expect(await getSession("default")).toBeUndefined();
    armSessionSaves();
    await saveCurrentSession();
    expect(await getSession("default")).toBeDefined();
  });
});

describe("cacheImportedRoot size cap", () => {
  it("skips caching a dataset over the configured cap", async () => {
    usePreferences.getState().setCacheMaxMb(0.00001); // ~10 byte cap
    await cacheImportedRoot(
      { id: "big", kind: "EventLog", format: "xes", label: "B", storeKind: "dataset" },
      new Uint8Array(1024),
    );
    expect(await getRoot("default", "big")).toBeUndefined();
    usePreferences.getState().setCacheMaxMb(0); // reset (unlimited)
  });
});

describe("bootToDefault", () => {
  beforeEach(() => lsStore.clear());

  it("migrates the active project to last-project on first boot, then lands in Default", () => {
    localStorage.setItem("propel-current-project", "proj-X");
    bootToDefault();
    expect(getLastProject()).toBe("proj-X");
    expect(getCurrentProject()).toBe("default");
  });

  it("keeps an existing last-project across boot", () => {
    localStorage.setItem("propel-last-project", "proj-Y");
    localStorage.setItem("propel-current-project", "proj-X");
    bootToDefault();
    expect(getLastProject()).toBe("proj-Y");
    expect(getCurrentProject()).toBe("default");
  });
});
