import { BINDING_RETURN_TYPE, type Provenance, type ProvenanceOp } from "@r4pm/client";

/** How a root's bytes are re-sourced on restore. */
export type Ref =
  | { kind: "idb"; key: string }
  | { kind: "path"; path: string }
  | { kind: "inline"; format: string; bytesB64: string }
  /** Bundled example, re-fetched from `public/examples/` instead of embedding its bytes. */
  | { kind: "sample"; id: string }
  | { kind: "absent" };

export type StoreKind = "dataset" | "artifact";

/** An imported object: re-sourced from its `ref`. */
export interface RootEntry {
  id: string;
  kind: string;
  label: string;
  format: string;
  storeKind: StoreKind;
  ref: Ref;
}

/** A produced object: rebuilt by replaying its provenance op against restored sources. */
export interface DerivedEntry {
  id: string;
  kind: string;
  label: string;
  storeKind: StoreKind;
  provenance: Provenance;
}

export interface Manifest {
  version: 1;
  roots: RootEntry[];
  derived: DerivedEntry[];
}

export interface ManifestObject {
  id: string;
  kind: string;
  label: string;
  storeKind: StoreKind;
  format?: string;
  provenance?: Provenance | null;
  ref?: Ref;
}

export function partition(objs: ManifestObject[]): {
  roots: ManifestObject[];
  derived: ManifestObject[];
} {
  const roots: ManifestObject[] = [];
  const derived: ManifestObject[] = [];
  for (const o of objs) (o.provenance ? derived : roots).push(o);
  return { roots, derived };
}

/** Non-derived source ids are roots (already restored); unresolved cycles append at the end so no
 *  entry is lost. */
export function topoOrderDerived(derived: DerivedEntry[]): DerivedEntry[] {
  const byId = new Map(derived.map((d) => [d.id, d]));
  const done = new Set<string>();
  const out: DerivedEntry[] = [];
  let progress = true;
  while (out.length < derived.length && progress) {
    progress = false;
    for (const d of derived) {
      if (done.has(d.id)) continue;
      if (d.provenance.sources.every((s) => !byId.has(s) || done.has(s))) {
        out.push(d);
        done.add(d.id);
        progress = true;
      }
    }
  }
  for (const d of derived) if (!done.has(d.id)) out.push(d);
  return out;
}

/** Root refs default to `absent`; callers overwrite them once bytes are located. */
export function buildManifest(objs: ManifestObject[]): Manifest {
  const { roots, derived } = partition(objs);
  const rootEntries: RootEntry[] = roots.map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    format: r.format ?? "",
    storeKind: r.storeKind,
    ref: r.ref ?? { kind: "absent" },
  }));
  const derivedEntries: DerivedEntry[] = derived.map((d) => ({
    id: d.id,
    kind: d.kind,
    label: d.label,
    storeKind: d.storeKind,
    provenance: d.provenance as Provenance,
  }));
  return { version: 1, roots: rootEntries, derived: topoOrderDerived(derivedEntries) };
}

/** Argument names v0.4.1 used where bindings now take another. */
export const RENAMED_ARGS: Record<string, string> = {
  xes: "log",
  locel: "ocel",
  align_res: "alignments",
  config: "options",
};

/**
 * A provenance op of v0.4.1 as the bindings now name it: ids lost their module path (e.g.,
 * `app_bindings::transforms::apply_event_log_transforms` is `app_bindings::apply_event_log_transforms`)
 * and some arguments were renamed. Ops of bindings that no longer exist stay as they are.
 */
export function migrateOp(op: ProvenanceOp): ProvenanceOp {
  let parsed: unknown = op;
  if (typeof op === "string") {
    try {
      parsed = JSON.parse(op);
    } catch {
      return op;
    }
  }
  if (!parsed || typeof parsed !== "object") return op;
  const { fn, args } = parsed as { fn?: unknown; args?: unknown };
  if (typeof fn !== "string" || !args || typeof args !== "object") return op;
  const known = (id: string) => id in BINDING_RETURN_TYPE;
  if (known(fn)) return op;
  const parts = fn.split("::");
  const renamed = `${parts[0]}::${parts[parts.length - 1]}`;
  if (!known(renamed)) return op;
  return {
    fn: renamed,
    args: Object.fromEntries(Object.entries(args).map(([k, v]) => [RENAMED_ARGS[k] ?? k, v])),
  };
}

/** Brings a manifest saved by an earlier release up to date:
 *  - Petri nets were propel artifacts of kind `PetriNet`; they are now registry `AcceptingPetriNet`
 *    datasets, and their saved PNML bytes load as such.
 *  - Provenance ops use the binding ids and argument names of this release ({@link migrateOp}). */
export function migrateManifest(m: Manifest): Manifest {
  const migrate = <T extends { kind: string; storeKind: StoreKind }>(e: T): T =>
    e.storeKind === "artifact" && e.kind === "PetriNet"
      ? { ...e, kind: "AcceptingPetriNet", storeKind: "dataset" }
      : e;
  return {
    ...m,
    roots: m.roots.map(migrate),
    derived: m.derived.map((d) => {
      const e = migrate(d);
      return e.provenance ? { ...e, provenance: { ...e.provenance, op: migrateOp(e.provenance.op) } } : e;
    }),
  };
}
