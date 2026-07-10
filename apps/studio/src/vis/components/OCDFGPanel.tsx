import { OCDFGViewer, type OCDFGViewerProps } from "@r4pm/components";

/** OC-DFG viewer. Layout engine + SVG export come from `ViewerConfig.layout` (set by
 *  `AppViewerConfig`); export draws the exact on-screen `StyledGraph` (object-type colors/legend baked
 *  in) through the `export_graph_svg` binding, so it matches the screen. */
export function OCDFGPanel(props: OCDFGViewerProps) {
  return <OCDFGViewer {...props} />;
}
