import { DFGViewer, type DFGViewerProps } from "@r4pm/components";

/** Case-centric DFG viewer. Layout engine + SVG export come from `ViewerConfig.layout` (set by
 *  `AppViewerConfig`); export draws the exact on-screen `StyledGraph` through the `export_graph_svg`
 *  binding, so it matches the screen. */
export function DFGPanel(props: DFGViewerProps) {
  return <DFGViewer {...props} />;
}
