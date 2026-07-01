import { ObjectCentricPetriNetWorkbench, type ObjectCentricPetriNet } from "@r4pm/components";
import { saveOcTraceAsOcel } from "./save-oc-trace";

const EMPTY_OCPN: ObjectCentricPetriNet = {
  petri_net: { places: [], transitions: [], arcs: [], initial_marking: null, final_marking: null },
  place_object_type: {},
  place_in_out_mult: {},
};

/** Standalone "create new OCPN" panel: blank OC net, edit in place, simulate, and save the trace
 *  as an OCEL. Image export via the surrounding frame. PNML/save-artifact for OC nets is not
 *  implemented yet. */
export function OcpnEditorPanel() {
  return (
    <ObjectCentricPetriNetWorkbench
      data={EMPTY_OCPN}
      initialMode="edit"
      onSaveTraceAsLog={saveOcTraceAsOcel}
    />
  );
}
