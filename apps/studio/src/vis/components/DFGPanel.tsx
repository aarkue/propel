import { DFGViewer, type DFGViewerProps } from "@r4pm/components";

/** Case-centric DFG viewer. rust4pm lays it out and draws its export through the backend passed as
 *  `ViewerConfig.viz` (set by `AppViewerConfig`). */
export function DFGPanel(props: DFGViewerProps) {
  return <DFGViewer {...props} />;
}
