import { create } from "zustand";

export interface Artifact {
  id: string;
  /** Propel artifact kind (e.g. "PetriNet"). Not a registry kind. */
  kind: string;
  label: string;
}

export interface ArtifactsState {
  artifacts: Artifact[];
  addArtifact: (a: Artifact) => void;
  removeArtifact: (id: string) => void;
  /** Reconcile against the engine's artifact list (label = id for new ones; keep richer labels). */
  syncArtifacts: (list: { id: string; kind: string }[]) => void;
}

export const useArtifacts = create<ArtifactsState>((set) => ({
  artifacts: [],
  addArtifact: (a) =>
    set((s) => ({
      artifacts: s.artifacts.some((x) => x.id === a.id)
        ? s.artifacts.map((x) => (x.id === a.id ? a : x))
        : [...s.artifacts, a],
    })),
  removeArtifact: (id) => set((s) => ({ artifacts: s.artifacts.filter((x) => x.id !== id) })),
  syncArtifacts: (list) =>
    set((s) => {
      const byId = new Map(s.artifacts.map((a) => [a.id, a]));
      return { artifacts: list.map((o) => byId.get(o.id) ?? { id: o.id, kind: o.kind, label: o.id }) };
    }),
}));
