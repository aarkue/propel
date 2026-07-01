import { useArtifacts, useDatasets } from "../stores";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { backend } from "../backends";

/**
 * Sync the dataset store with the engine's actual object set.
 */
export async function refreshDatasets() {
  try {
    const objs = await backend.listObjects();
    useDatasets.getState().syncObjects(objs);
  } catch {
    // Best-effort. Empty/unreachable list just shows the welcome screen...
  }
}

/** Reconcile the artifact store with the engine's actual artifact set. */
export async function refreshArtifacts() {
  try {
    useArtifacts.getState().syncArtifacts(await backend.listArtifacts());
  } catch {
    // Best-effort. An unreachable list just leaves the strip empty...
  }
}

/**
 * The single place engine -> frontend events are turned into UI.
 * The engine emits general:
 * -`objects-changed` on any object-store mutation (import / unload / binding result),
 * - an `artifacts-changed` on any artifact-store mutation,
 * - and per-import `import-started|finished|failed` events.
 */
export function EngineEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const reg = backend.registerListener?.bind(backend);
    if (!reg) return;
    const subs = [
      reg<unknown>("objects-changed", () => {
        void refreshDatasets();
        queryClient.invalidateQueries({ queryKey: ["loaded-objects"] });
      }),
      reg<unknown>("artifacts-changed", () => {
        void refreshArtifacts();
      }),
      reg<string>("import-started", (id) => {
        toast.loading(`Importing ${id}…`, { id: `import-${id}`, duration: Number.POSITIVE_INFINITY });
      }),
      reg<string>("import-finished", (id) => {
        toast.success(`Imported ${id}`, { id: `import-${id}`, duration: 3500 });
      }),
      reg<{ id: string; error: string }>("import-failed", (d) => {
        toast.error(`Import failed: ${d.error}`, { id: `import-${d.id}`, duration: 10000 });
      }),
    ];
    return () => {
      for (const s of subs) s.then((unsub) => unsub());
    };
  }, [queryClient]);

  return null;
}
