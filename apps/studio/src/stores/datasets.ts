import { create } from "zustand";

export interface Dataset {
  id: string;
  /** The engine registry kind this was loaded as (e.g. "EventLog", "OCEL", "SlimLinkedOCEL", ...). */
  kind: string;
  label: string;
}

export interface DatasetsState {
  datasets: Dataset[];
  addDataset: (d: Dataset) => void;
  removeDataset: (id: string) => void;
  /**
   * Merge the engine's actually-loaded objects into the store (label defaults to the id), without
   * clobbering datasets already known with richer labels. Lets the UI reflect a backend that keeps
   * state across reloads (webserver / tauri).
   */
  hydrate: (objects: { id: string; kind: string }[]) => void;
  /**
   * Reconcile the store against the engine's full object set: add new objects (label = id), drop
   * ones the engine no longer has, and keep richer labels for ids still present. The single
   * `objects-changed` event drives this, so every surface stays in sync with the engine.
   */
  syncObjects: (objects: { id: string; kind: string }[]) => void;
}

/**
 * The studio's loaded-dataset registry, generic over engine registry kinds. A dataset's `kind`
 * is whatever importable kind it was loaded as; the active selection is tracked per kind so the
 * shell can switch the dataset each kind of panel reads from independently.
 */
export const useDatasets = create<DatasetsState>((set) => ({
  datasets: [],
  addDataset: (d) =>
    set((s) => ({
      datasets: s.datasets.some((x) => x.id === d.id)
        ? s.datasets.map((x) => (x.id === d.id ? d : x))
        : [...s.datasets, d],
    })),
  hydrate: (objects) =>
    set((s) => {
      const known = new Set(s.datasets.map((d) => d.id));
      const added = objects
        .filter((o) => !known.has(o.id))
        .map((o) => ({ id: o.id, kind: o.kind, label: o.id }));
      if (added.length === 0) return s;
      return { datasets: [...s.datasets, ...added] };
    }),
  syncObjects: (objects) =>
    set((s) => {
      const byId = new Map(s.datasets.map((d) => [d.id, d]));
      const datasets = objects.map((o) => byId.get(o.id) ?? { id: o.id, kind: o.kind, label: o.id });
      return { datasets };
    }),
  removeDataset: (id) => set((s) => ({ datasets: s.datasets.filter((x) => x.id !== id) })),
}));
