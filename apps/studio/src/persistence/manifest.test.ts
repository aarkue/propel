import { describe, expect, it } from "vitest";
import { buildManifest, type DerivedEntry, partition, topoOrderDerived } from "./manifest";

const prov = (sources: string[]) => ({ sources, op: "{}", source_gen: 0 });

describe("manifest", () => {
  it("partitions roots vs derived by provenance", () => {
    const { roots, derived } = partition([
      { id: "log1", kind: "EventLog", label: "log1", storeKind: "dataset" },
      {
        id: "f1",
        kind: "EventLog",
        label: "Filtered",
        storeKind: "dataset",
        provenance: prov(["log1"]),
      },
    ]);
    expect(roots.map((r) => r.id)).toEqual(["log1"]);
    expect(derived.map((d) => d.id)).toEqual(["f1"]);
  });

  it("orders derived after their derived sources", () => {
    const entries: DerivedEntry[] = [
      { id: "b", kind: "EventLog", label: "b", storeKind: "dataset", provenance: prov(["a"]) },
      { id: "a", kind: "EventLog", label: "a", storeKind: "dataset", provenance: prov(["log1"]) },
    ];
    expect(topoOrderDerived(entries).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("builds a manifest with absent refs by default", () => {
    const m = buildManifest([{ id: "log1", kind: "EventLog", label: "log1", storeKind: "dataset" }]);
    expect(m.version).toBe(1);
    expect(m.roots[0].ref).toEqual({ kind: "absent" });
    expect(m.derived).toEqual([]);
  });
});
