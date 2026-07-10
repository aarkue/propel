import { create } from "zustand";
import { persistLabel, uniqueName } from "./datasets";

export interface Artifact {
  id: string;
  /** Propel artifact kind (e.g. "PetriNet"). Not a registry kind. */
  kind: string;
  label: string;
}

/** An engine artifact as reported by `listArtifacts`: the engine now carries the display label too. */
interface EngineArtifact {
  id: string;
  kind: string;
  label?: string | null;
}

export interface ArtifactsState {
  artifacts: Artifact[];
  addArtifact: (a: Artifact) => void;
  removeArtifact: (id: string) => void;
  /** Rename an artifact; persists engine-side so the label survives a reload. Empty clears it to the id. */
  renameArtifact: (id: string, label: string) => void;
  /** Reconcile against the engine's artifact list: engine label wins, else keep a richer local one, else id. */
  syncArtifacts: (list: EngineArtifact[]) => void;
}

export const useArtifacts = create<ArtifactsState>((set) => ({
  artifacts: [],
  addArtifact: (a) => {
    set((s) => ({
      artifacts: s.artifacts.some((x) => x.id === a.id)
        ? s.artifacts.map((x) => (x.id === a.id ? a : x))
        : [...s.artifacts, a],
    }));
    if (a.label && a.label !== a.id) persistLabel(a.id, a.label);
  },
  removeArtifact: (id) => set((s) => ({ artifacts: s.artifacts.filter((x) => x.id !== id) })),
  renameArtifact: (id, label) => {
    const trimmed = label.trim();
    set((s) => ({
      artifacts: s.artifacts.map((a) => (a.id === id ? { ...a, label: trimmed || id } : a)),
    }));
    persistLabel(id, trimmed);
  },
  syncArtifacts: (list) =>
    set((s) => {
      // The engine returns artifacts in a stable insertion order (newest last), so just mirror it.
      const byId = new Map(s.artifacts.map((a) => [a.id, a]));
      return {
        artifacts: list.map((o) => ({
          id: o.id,
          kind: o.kind,
          label: o.label ?? byId.get(o.id)?.label ?? o.id,
        })),
      };
    }),
}));

/**
 * A short artifact name/id based on `base`, unique against every currently loaded artifact's id AND
 * label (an artifact's id doubles as its handle, so a collision would clobber the existing one).
 * See {@link uniqueName}.
 */
export function uniqueArtifactName(base: string): string {
  const artifacts = useArtifacts.getState().artifacts;
  return uniqueName(base, [...artifacts.map((a) => a.id), ...artifacts.map((a) => a.label)]);
}
