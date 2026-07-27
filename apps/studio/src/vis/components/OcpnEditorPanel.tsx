import type { IDockviewPanelProps } from "dockview";
import { useState } from "react";
import { ObjectCentricPetriNetWorkbench, type ObjectCentricPetriNet } from "@r4pm/components";
import { readPanelParam, usePanelDraft } from "../../panels/panel-state";
import { renderGraphSvg } from "./render-graph-svg";
import { saveOcTraceAsOcel } from "./save-oc-trace";

const EMPTY_OCPN: ObjectCentricPetriNet = {
  petri_net: { places: [], transitions: [], arcs: [], initial_marking: null, final_marking: null },
  place_object_type: {},
  place_in_out_mult: {},
};

/** The workbench re-seeds its editor on every `data` change, so seed once and write edits back via `onNetChange` only. */
export function OcpnEditorPanel(props: IDockviewPanelProps) {
  const [seed] = useState<ObjectCentricPetriNet>(() => readPanelParam(props.params, "net", EMPTY_OCPN));
  const [, persist] = usePanelDraft<ObjectCentricPetriNet>(props, "net", EMPTY_OCPN);
  return (
    <ObjectCentricPetriNetWorkbench
      data={seed}
      initialMode="edit"
      onNetChange={persist}
      onSaveTraceAsLog={saveOcTraceAsOcel}
      renderSvg={renderGraphSvg}
    />
  );
}
