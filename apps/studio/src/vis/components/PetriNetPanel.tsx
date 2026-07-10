import type { PetriNet as ClientPetriNet } from "@r4pm/client";
import { PetriNetWorkbench, type PetriNet, type SimTrace, type ViewerProps } from "@r4pm/components";
import { renderGraphSvg } from "./render-graph-svg";
import { PetriNetActions } from "./PetriNetActions";
import { backend } from "../../backends";
import { useDatasets, uniqueDatasetLabel } from "../../stores";

const EVENT_LOG_FROM_ACTIVITIES = "app_bindings::event_log::event_log_from_activities" as const;

/** Studio component for any shown Petri net: the pure workbench plus backend-bound actions.
 *  The binding returns the component's array shape despite the generated record type, so the
 *  cast here is the single studio adaptation point. Export draws the exact on-screen `StyledGraph`
 *  through the generic `export_graph_svg` binding. */
export function PetriNetPanel({ data }: ViewerProps<ClientPetriNet>) {
  const net = data as unknown as PetriNet;

  const saveTraceAsLog = async (traces: SimTrace[]) => {
    // Drop silent/tau transitions (null/empty labels) per trace; the Rust binding builds the
    // event log (one case per trace, 1 min between events) from the visible activity names.
    const perTrace = traces
      .map((t) => t.steps.map((s) => s.label?.trim()).filter((l): l is string => !!l && l.length > 0))
      .filter((acts) => acts.length > 0);
    if (perTrace.length === 0) return;
    const handle = (await backend.callBinding(EVENT_LOG_FROM_ACTIVITIES, {
      traces: perTrace,
    })) as string;
    useDatasets.getState().addDataset({
      id: handle,
      kind: "EventLog",
      label: uniqueDatasetLabel("Simulated log"),
    });
  };

  return (
    <PetriNetWorkbench
      data={net}
      toolbar={(n) => <PetriNetActions net={n} />}
      onSaveTraceAsLog={saveTraceAsLog}
      renderSvg={renderGraphSvg}
    />
  );
}
