import type { ObjectCentricPetriNetJson } from "@r4pm/client";
import { defineViewer } from "./registry";
import { OcpnPanel } from "../vis/components/OcpnPanel";

// rust4pm's flat object-centric Petri net, e.g., from the `discover_ocpn` binding. The panel wraps the
// view/simulate/edit workbench with the backend-bound "Save as OCEL" trace action.
export const ObjectCentricPetriNetViewer_Def = defineViewer<ObjectCentricPetriNetJson>({
  id: "oc-petri-net",
  title: "Object-Centric Petri Net",
  accepts: ({ returnType }) => returnType === "ObjectCentricPetriNetJson",
  component: OcpnPanel,
});
