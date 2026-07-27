import { describe, expect, it } from "vitest";
import type { Manifest } from "./manifest";
import { parseProject, serializeProject } from "./project-file";

const manifest: Manifest = {
  version: 1,
  roots: [
    {
      id: "log1",
      kind: "EventLog",
      label: "L",
      format: "xes",
      storeKind: "dataset",
      ref: { kind: "idb", key: "log1" },
    },
  ],
  derived: [],
};

describe("project-file", () => {
  it("inlines idb roots and round-trips", async () => {
    const bytes = await serializeProject(manifest, async () => new TextEncoder().encode("gz-bytes"), {
      "propel-panels": "{}",
    });
    const { manifest: parsed, workspace } = parseProject(bytes);
    expect(parsed.roots[0].ref.kind).toBe("inline");
    if (parsed.roots[0].ref.kind === "inline") {
      expect(parsed.roots[0].ref.bytesB64.length).toBeGreaterThan(0);
      expect(parsed.roots[0].ref.format).toBe("xes");
    }
    expect(workspace["propel-panels"]).toBe("{}");
  });

  it("degrades a root with missing bytes to absent", async () => {
    const { manifest: parsed } = parseProject(await serializeProject(manifest, async () => undefined));
    expect(parsed.roots[0].ref.kind).toBe("absent");
  });

  it("rejects a non-propel file", () => {
    expect(() => parseProject(new TextEncoder().encode("{}"))).toThrow();
    expect(() => parseProject(new TextEncoder().encode("not json"))).toThrow();
  });

  it("round-trips slim pipelines through serialize/parse", async () => {
    const empty: Manifest = { version: 1, roots: [], derived: [] };
    const pipelines = {
      saved: [{ name: "p", nodes: [], edges: [], createdAt: 1 }],
      draft: { nodes: [], edges: [] },
    };
    const bytes = await serializeProject(empty, async () => undefined, {}, pipelines);
    expect(parseProject(bytes).pipelines).toEqual(pipelines);
  });

  it("defaults pipelines to an empty library when absent", async () => {
    const empty: Manifest = { version: 1, roots: [], derived: [] };
    const bytes = await serializeProject(empty, async () => undefined, {});
    expect(parseProject(bytes).pipelines).toEqual({ saved: [] });
  });
});
