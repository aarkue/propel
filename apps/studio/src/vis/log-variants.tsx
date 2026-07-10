import type { IDockviewPanelProps } from "dockview";
import type { BackendContext, EventLogHandle, NumberOfTracesAndEvents, TraceVariants } from "@r4pm/client";
import { ErrorState, LoadingState, LogVariants } from "@r4pm/components";
import { useQuery } from "@tanstack/react-query";
import { PiListBullets } from "react-icons/pi";
import { withSelector, datasetEmptyBox } from "./_shared";
import { useDatasetSelection } from "../panels/active-datasets";
import { backend } from "../backends";
import { useDatasets, uniqueDatasetLabel } from "../stores";
import { definePanel } from "./define-vis";

const GET_LOG_TRACE_VARIANTS = "app_bindings::event_log::get_log_trace_variants" as const;
const GET_LOG_INFO = "app_bindings::event_log::get_log_info" as const;

const APPLY_EVENT_LOG_TRANSFORMS = "app_bindings::transforms::apply_event_log_transforms" as const;

export interface LogVariantsPanelProps {
  backend: BackendContext;
  eventLog: EventLogHandle;
  onSelect?: (activity: string) => void;
  /** Called after a keep/exclude filter produced a new derived log handle. */
  onFilterApplied?: (handle: EventLogHandle, label: string) => void;
  onSelectionChange?: (sel: { variantIndices: number[]; traceCount: number; eventCount: number }) => void;
}

export function LogVariantsPanel({
  backend,
  eventLog,
  onSelect,
  onFilterApplied,
  onSelectionChange,
}: LogVariantsPanelProps) {
  const variants = useQuery({
    queryKey: [eventLog, "log-variants"],
    queryFn: () =>
      backend.callBinding(GET_LOG_TRACE_VARIANTS, { event_log: eventLog }) as Promise<TraceVariants>,
  });

  // The viewer reports selected variant indices; map them back to activity-label
  // sequences (what the `FilterVariants` transform consumes) and apply it to
  // produce a new derived event log.
  const applyFilter = onFilterApplied
    ? async ({ variantIndices, mode }: { variantIndices: number[]; mode: "keep" | "exclude" }) => {
        const data = variants.data;
        if (!data || variantIndices.length === 0) return;
        const sequences = variantIndices.map((i) =>
          (data.traces[i]?.[0] ?? []).map((j) => data.activities[j] ?? "UNKNOWN"),
        );
        const handle = (await backend.callBinding(APPLY_EVENT_LOG_TRANSFORMS, {
          event_log: eventLog,
          transforms: [
            { type: "FilterVariants", variants: sequences, mode: mode === "keep" ? "Keep" : "Remove" },
          ],
        })) as EventLogHandle;
        onFilterApplied(handle, mode === "keep" ? "Kept variants" : "Excluded variants");
      }
    : undefined;
  const info = useQuery({
    queryKey: [eventLog, "log-info"],
    queryFn: () =>
      backend.callBinding(GET_LOG_INFO, { event_log: eventLog }) as Promise<NumberOfTracesAndEvents>,
  });
  if (variants.error || info.error) {
    const failed = variants.error ? variants : info;
    return <ErrorState error={failed.error} onRetry={() => failed.refetch()} />;
  }
  if (!variants.data || !info.data) return <LoadingState label="discovering variants" slowAfterMs={8000} />;
  return (
    <LogVariants
      variants={variants.data}
      numTraces={info.data.num_traces}
      numEvents={info.data.num_events}
      onSelect={onSelect}
      onFilterVariants={applyFilter}
      onSelectionChange={onSelectionChange}
    />
  );
}

/** Interactive trace-variant explorer for the active event log. */
export function LogVariantsDockPanel(_props: IDockviewPanelProps) {
  const { id: log, selector } = useDatasetSelection("EventLog");
  const addDataset = useDatasets((s) => s.addDataset);
  if (!log) return withSelector(selector, datasetEmptyBox("EventLog"), "log-variants");
  return withSelector(
    selector,
    <LogVariantsPanel
      key={log}
      backend={backend}
      eventLog={log as EventLogHandle}
      onFilterApplied={(handle, label) =>
        addDataset({ id: handle, kind: "EventLog", label: uniqueDatasetLabel(label) })
      }
    />,
    "log-variants",
  );
}

export const vis = definePanel({
  type: "logVariants",
  name: "Trace Variants",
  description: "Distinct activity sequences ranked by frequency.",
  category: "variants",
  icon: PiListBullets,
  supports: ["EventLog"],
  keywords: ["traces", "paths", "sequences", "variants"],
  order: 1,
  component: LogVariantsDockPanel,
});
