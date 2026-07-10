import type { OcSequenceStep } from "@r4pm/components";
import { backend } from "../../backends";
import { useDatasets, uniqueDatasetLabel } from "../../stores";

const OCEL_FROM_TRACE = "app_bindings::ocel::ocel_from_oc_sim_trace" as const;

/** Turn an object-centric simulation trace into a slim linked OCEL via the backend, then register
 *  the resulting handle as a dataset. Silent (unlabeled) steps are dropped. */
export async function saveOcTraceAsOcel(trace: OcSequenceStep[]): Promise<void> {
  const steps = trace
    .filter((s) => s.label?.trim())
    .map((s) => ({
      activity: s.label!.trim(),
      objects: s.objects.map((o) => ({ id: o.id, objectType: o.objectType })),
    }));
  if (steps.length === 0) return;
  const handle = (await backend.callBinding(OCEL_FROM_TRACE, { trace: steps })) as string;
  useDatasets.getState().addDataset({
    id: handle,
    kind: "SlimLinkedOCEL",
    label: uniqueDatasetLabel("Simulated OCEL"),
  });
}
