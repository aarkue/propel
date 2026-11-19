import { useArtifacts, useDatasets } from "../stores";
import type { JobProgress, JobUpdate } from "@r4pm/client";
import { describeProgress } from "@r4pm/components";
import { Flex, Link, Progress, Text } from "@r4pm/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { backend } from "../backends";
import { JOB_UNITS } from "./job-units";
import { quietImports } from "./quiet-imports";
import { armSessionSaves, scheduleSessionSave } from "../persistence/session";

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

/** The toast of a running import: its progress, and Cancel where the engine can stop it. */
function ImportToast({ id, progress }: { id: string; progress: JobProgress | null }) {
  const d = progress ? describeProgress(progress, JOB_UNITS) : null;
  return (
    <Flex direction="column" gap="1" style={{ minWidth: 220 }}>
      <Flex justify="between" align="baseline" gap="3">
        <Text size="2" truncate>
          Importing {id}
        </Text>
        {backend.cancelJob && (
          <Link
            size="1"
            href="#"
            color="gray"
            onClick={(e) => {
              e.preventDefault();
              void backend.cancelJob?.(id);
            }}
          >
            Cancel
          </Link>
        )}
      </Flex>
      {d && (
        <>
          <Progress
            size="1"
            value={d.fraction != null ? d.fraction * 100 : undefined}
            duration={d.fraction != null ? undefined : "2s"}
          />
          <Text size="1" color="gray" className="tabular-nums">
            {d.title}: {d.detail}
          </Text>
        </>
      )}
    </Flex>
  );
}

/**
 * The single place engine -> frontend events are turned into UI.
 * The engine emits general:
 * -`objects-changed` on any object-store mutation (import / unload / binding result),
 * - an `artifacts-changed` on any artifact-store mutation,
 * - per-import `import-started|finished|cancelled|failed` events, and its progress as a
 *   `job-update` named after its id.
 */
export function EngineEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const reg = backend.registerListener?.bind(backend);
    if (!reg) return;
    const importing = new Set<string>();
    const subs = [
      reg<unknown>("objects-changed", () => {
        void refreshDatasets();
        armSessionSaves();
        scheduleSessionSave();
        queryClient.invalidateQueries({ queryKey: ["loaded-objects"] });
      }),
      reg<unknown>("artifacts-changed", () => {
        void refreshArtifacts();
        armSessionSaves();
        scheduleSessionSave();
      }),
      reg<string>("import-started", (id) => {
        if (quietImports.has(id)) return;
        importing.add(id);
        toast.loading(<ImportToast id={id} progress={null} />, {
          id: `import-${id}`,
          duration: Number.POSITIVE_INFINITY,
        });
      }),
      // An import reports progress as the job named after its id.
      reg<JobUpdate>("job-update", (u) => {
        if (!u.progress || !importing.has(u.job)) return;
        toast.loading(<ImportToast id={u.job} progress={u.progress} />, { id: `import-${u.job}` });
      }),
      reg<string>("import-finished", (id) => {
        if (quietImports.delete(id)) return;
        importing.delete(id);
        toast.success(`Imported ${id}`, { id: `import-${id}`, duration: 3500 });
      }),
      reg<string>("import-cancelled", (id) => {
        if (quietImports.delete(id)) return;
        importing.delete(id);
        toast(`Import of ${id} cancelled`, { id: `import-${id}`, duration: 3500 });
      }),
      reg<{ id: string; error: string }>("import-failed", (d) => {
        if (quietImports.delete(d.id)) return;
        importing.delete(d.id);
        toast.error(`Import failed: ${d.error}`, { id: `import-${d.id}`, duration: 10000 });
      }),
    ];
    return () => {
      for (const s of subs) s.then((unsub) => unsub());
    };
  }, [queryClient]);

  return null;
}
