import { OCDFGViewer, type OCDFGViewerProps } from "@r4pm/components";

/** OC-DFG viewer. rust4pm lays it out and draws its export through the backend passed as
 *  `ViewerConfig.viz` (set by `AppViewerConfig`). */
export function OCDFGPanel(props: OCDFGViewerProps) {
  return <OCDFGViewer {...props} />;
}
