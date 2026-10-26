import { ObjectCentricPetriNetWorkbench, type Ocpn, type ViewerProps } from "@r4pm/components";
import { saveOcTraceAsOcel } from "./save-oc-trace";

/** Studio component for any shown object-centric Petri net: the pure workbench plus the backend-bound
 *  "Save as OCEL" trace action. Layout and export come from `ViewerConfig.viz` (set by
 *  `AppViewerConfig`). */
export function OcpnPanel({ data }: ViewerProps<Ocpn>) {
  return <ObjectCentricPetriNetWorkbench data={data} onSaveTraceAsLog={saveOcTraceAsOcel} />;
}
