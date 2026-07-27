import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getAllRoots, getRoot, getSession, gunzip, gzip, putRoot, putSession } from "./idb";

describe("idb", () => {
  it("round-trips a root blob namespaced by project", async () => {
    const bytes = new TextEncoder().encode("hello xes").buffer;
    await putRoot({
      projectId: "pA",
      id: "log1",
      kind: "EventLog",
      format: "xes",
      label: "log1",
      storeKind: "dataset",
      bytes,
    });
    expect((await getRoot("pA", "log1"))?.kind).toBe("EventLog");
    expect((await getAllRoots("pA")).length).toBe(1);
    expect(await getRoot("pB", "log1")).toBeUndefined();
    expect((await getAllRoots("pB")).length).toBe(0);
  });

  it("round-trips a session slot", async () => {
    await putSession("default", { manifest: { version: 1, roots: [], derived: [] }, workspace: {} });
    expect((await getSession("default"))?.manifest.version).toBe(1);
  });

  it("gzip round-trips", async () => {
    const src = new TextEncoder().encode("a".repeat(1000));
    const back = await gunzip(await gzip(src));
    expect(new TextDecoder().decode(back)).toBe("a".repeat(1000));
  });
});
