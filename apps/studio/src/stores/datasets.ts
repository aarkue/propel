import { create } from "zustand";
import { getBackend } from "../shell/backend-singleton";

export interface Dataset {
  id: string;
  /** The engine registry kind this was loaded as (e.g. "EventLog", "OCEL", "SlimLinkedOCEL", ...). */
  kind: string;
  label: string;
}

/** An engine object as reported by `listObjects`: the engine now carries the display label too. */
interface EngineObject {
  id: string;
  kind: string;
  label?: string | null;
}

export interface DatasetsState {
  datasets: Dataset[];
  addDataset: (d: Dataset) => void;
  removeDataset: (id: string) => void;
  /** Rename a dataset; persists engine-side so the label survives a reload. Empty clears it back to the id. */
  renameDataset: (id: string, label: string) => void;
  /**
   * Merge the engine's actually-loaded objects into the store (label from the engine, else the id),
   * without clobbering datasets already known with richer labels. Lets the UI reflect a backend that
   * keeps state across reloads (webserver / tauri).
   */
  hydrate: (objects: EngineObject[]) => void;
  /**
   * Reconcile the store against the engine's full object set: add new objects, drop ones the engine
   * no longer has, and take the engine's label (falling back to any richer label still in the store,
   * else the id). The single `objects-changed` event drives this, so every surface stays in sync.
   */
  syncObjects: (objects: EngineObject[]) => void;
}

/**
 * Push a label to the engine so it outlives a frontend reload. Fire-and-forget: a failure (or a
 * backend that isn't wired yet, e.g. in tests) just leaves the label frontend-only.
 */
export function persistLabel(id: string, label: string): void {
  try {
    void getBackend()
      .setLabel(id, label)
      .catch(() => {});
  } catch {
    // Backend not set (tests / early startup): keep the in-memory label only.
  }
}

/**
 * The studio's loaded-dataset registry, generic over engine registry kinds. A dataset's `kind`
 * is whatever importable kind it was loaded as; the active selection is tracked per kind so the
 * shell can switch the dataset each kind of panel reads from independently.
 */
export const useDatasets = create<DatasetsState>((set) => ({
  datasets: [],
  addDataset: (d) => {
    set((s) => ({
      datasets: s.datasets.some((x) => x.id === d.id)
        ? s.datasets.map((x) => (x.id === d.id ? d : x))
        : [...s.datasets, d],
    }));
    // Persist any non-default label so it survives a reload (import names, simulation/editor
    // outputs, etc.). A label equal to the id carries no information, so skip it.
    if (d.label && d.label !== d.id) persistLabel(d.id, d.label);
  },
  renameDataset: (id, label) => {
    const trimmed = label.trim();
    set((s) => ({
      datasets: s.datasets.map((d) => (d.id === id ? { ...d, label: trimmed || id } : d)),
    }));
    persistLabel(id, trimmed);
  },
  hydrate: (objects) =>
    set((s) => {
      const known = new Set(s.datasets.map((d) => d.id));
      const added = objects
        .filter((o) => !known.has(o.id))
        .map((o) => ({ id: o.id, kind: o.kind, label: o.label ?? o.id }));
      if (added.length === 0) return s;
      return { datasets: [...s.datasets, ...added] };
    }),
  syncObjects: (objects) =>
    set((s) => {
      // The engine returns objects in a stable insertion order (newest last), so just mirror it.
      const byId = new Map(s.datasets.map((d) => [d.id, d]));
      return {
        datasets: objects.map((o) => ({
          id: o.id,
          kind: o.kind,
          label: o.label ?? byId.get(o.id)?.label ?? o.id,
        })),
      };
    }),
  removeDataset: (id) => set((s) => ({ datasets: s.datasets.filter((x) => x.id !== id) })),
}));

/**
 * A short name based on `base` that does not collide with `taken`: returns `base` if free, else
 * `base 2`, `base 3`, ... The single place auto-generated dataset/artifact names are kept short yet
 * unique, so the strip never shows three identical "Simulated log" / "Petri net" entries.
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = taken instanceof Set ? taken : new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!set.has(candidate)) return candidate;
  }
}

/** A label unique among currently loaded datasets. See {@link uniqueName}. */
export function uniqueDatasetLabel(base: string): string {
  return uniqueName(
    base,
    useDatasets.getState().datasets.map((d) => d.label),
  );
}
