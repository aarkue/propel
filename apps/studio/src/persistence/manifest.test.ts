import { describe, expect, it } from "vitest";
import {
  buildManifest,
  type DerivedEntry,
  migrateManifest,
  migrateOp,
  partition,
  topoOrderDerived,
} from "./manifest";

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

  it("migrates saved PetriNet artifacts to AcceptingPetriNet datasets", () => {
    const m = buildManifest([
      { id: "net", kind: "PetriNet", label: "net", storeKind: "artifact", format: "pnml" },
      { id: "decl", kind: "OCDeclare", label: "decl", storeKind: "artifact", format: "ocdeclare" },
    ]);
    const roots = migrateManifest(m).roots;
    expect(roots.map((r) => [r.kind, r.storeKind, r.format])).toEqual([
      ["AcceptingPetriNet", "dataset", "pnml"],
      ["OCDeclare", "artifact", "ocdeclare"],
    ]);
  });
});

describe("migrateOp", () => {
  it("renames v0.4.1 binding ids and arguments", () => {
    expect(
      migrateOp({
        fn: "process_mining::discovery::object_centric::ocpn::discover_ocpn",
        args: { locel: "o1", options: {} },
      }),
    ).toEqual({ fn: "process_mining::discover_ocpn", args: { ocel: "o1", options: {} } });
    expect(
      migrateOp(
        JSON.stringify({
          fn: "app_bindings::transforms::apply_event_log_transforms",
          args: { event_log: "l" },
        }),
      ),
    ).toEqual({ fn: "app_bindings::apply_event_log_transforms", args: { event_log: "l" } });
  });

  it("keeps current and unknown ops", () => {
    const current = { fn: "app_bindings::apply_ocel_transforms", args: { ocel: "o" } };
    expect(migrateOp(current)).toBe(current);
    expect(migrateOp("convert:EventLog")).toBe("convert:EventLog");
    const gone = { fn: "process_mining::bindings::index_link_ocel", args: {} };
    expect(migrateOp(gone)).toBe(gone);
  });
});
