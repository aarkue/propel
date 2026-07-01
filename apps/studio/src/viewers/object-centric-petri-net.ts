import { defineViewer } from "./registry";
import type { ObjectCentricPetriNet } from "@r4pm/components";
import { OcpnPanel } from "../vis/components/OcpnPanel";

// `ObjectCentricPetriNet` is a propel-computed shape with no generated `@r4pm/client` type, so the
// viewer's own local interface is the contract; matched by return-type title. The panel wraps the
// view/simulate/edit workbench with the backend-bound "Save as OCEL" trace action.
export const ObjectCentricPetriNetViewer_Def = defineViewer<ObjectCentricPetriNet>({
  id: "oc-petri-net",
  title: "Object-Centric Petri Net",
  accepts: ({ returnType }) => returnType === "ObjectCentricPetriNet",
  component: OcpnPanel,
});
