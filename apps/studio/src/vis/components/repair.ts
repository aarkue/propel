import type { EventLogHandle, Repair, SlimLinkedOCELHandle } from "@r4pm/client";
import toast from "react-hot-toast";
import { backend } from "../../backends";
import { uniqueDatasetLabel, useDatasets } from "../../stores";

/** Applies health-check repairs to dataset `handle` and adds the result as a new dataset. */
export function repairDataset(kind: "EventLog" | "SlimLinkedOCEL", handle: string, repairs: unknown[]) {
  const call: Promise<string> =
    kind === "EventLog"
      ? backend.callBinding("app_bindings::repair_event_log", {
          event_log: handle as EventLogHandle,
          repairs: repairs as Repair[],
        })
      : backend.callBinding("app_bindings::repair_ocel", {
          ocel: handle as SlimLinkedOCELHandle,
          repairs: repairs as Repair[],
        });
  const { datasets, addDataset } = useDatasets.getState();
  const source = datasets.find((d) => d.id === handle)?.label ?? handle;
  return toast
    .promise(call, {
      loading: "Repairing...",
      success: "Added the repaired copy",
      error: (e) => `Repair failed: ${e}`,
    })
    .then((id) => addDataset({ id: id as string, kind, label: uniqueDatasetLabel(`${source} (repaired)`) }))
    .catch(() => {});
}
