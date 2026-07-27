import { create } from "zustand";
import type { DerivedEntry, StoreKind } from "../persistence/manifest";

/** A root that could not be re-sourced on restore (file moved/missing, or its bytes were never cached
 *  -- e.g. a large wasm dataset over the cache cap). The relink dialog re-imports it under this id. */
export interface MissingRoot {
  id: string;
  kind: string;
  label: string;
  format: string;
  storeKind: StoreKind;
}

interface RelinkState {
  missing: MissingRoot[];
  /** Derived objects (transforms/discovery) whose replay is deferred until the missing roots they may
   *  depend on are relinked -- then they are replayed in one topo pass (see `finalizeRelink`). */
  pendingDerived: DerivedEntry[];
  addMissing: (rs: MissingRoot[]) => void;
  setPendingDerived: (d: DerivedEntry[]) => void;
  resolve: (id: string) => void;
  clearMissing: () => void;
  clearPending: () => void;
  clear: () => void;
}

/** Roots awaiting relink after a restore. The relink dialog opens while `missing` is non-empty. */
export const useRelink = create<RelinkState>((set) => ({
  missing: [],
  pendingDerived: [],
  addMissing: (rs) =>
    set((s) => {
      const have = new Set(s.missing.map((m) => m.id));
      const add = rs.filter((r) => !have.has(r.id));
      return add.length ? { missing: [...s.missing, ...add] } : s;
    }),
  setPendingDerived: (pendingDerived) => set({ pendingDerived }),
  resolve: (id) => set((s) => ({ missing: s.missing.filter((m) => m.id !== id) })),
  clearMissing: () => set({ missing: [] }),
  clearPending: () => set({ pendingDerived: [] }),
  clear: () => set({ missing: [], pendingDerived: [] }),
}));
