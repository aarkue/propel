import {
  ObjectCentricPetriNetWorkbench,
  type ObjectCentricPetriNet,
  type ViewerProps,
} from "@r4pm/components";
import { renderGraphSvg } from "./render-graph-svg";
import { saveOcTraceAsOcel } from "./save-oc-trace";

/** Studio component for any shown object-centric Petri net: the pure workbench plus the backend-bound
 *  "Save as OCEL" trace action. Layout comes from `ViewerConfig.layout.petri` (set by
 *  `AppViewerConfig`); export draws the exact on-screen `StyledGraph` through the `export_graph_svg`
 *  binding. */
export function OcpnPanel({ data }: ViewerProps<ObjectCentricPetriNet>) {
  return (
    <ObjectCentricPetriNetWorkbench
      data={data}
      onSaveTraceAsLog={saveOcTraceAsOcel}
      renderSvg={renderGraphSvg}
    />
  );
}
