import {
  ObjectCentricPetriNetWorkbench,
  type ObjectCentricPetriNet,
  type ViewerProps,
} from "@r4pm/components";
import { saveOcTraceAsOcel } from "./save-oc-trace";

/** Studio component for any shown object-centric Petri net: the pure workbench plus the
 *  backend-bound "Save as OCEL" trace action. */
export function OcpnPanel({ data }: ViewerProps<ObjectCentricPetriNet>) {
  return <ObjectCentricPetriNetWorkbench data={data} onSaveTraceAsLog={saveOcTraceAsOcel} />;
}
