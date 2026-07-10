import type { ComponentProps } from "react";
import { OCDeclareViewer } from "@r4pm/components";

/** OC-declare viewer wrapper. Layout engine + SVG export come from `ViewerConfig.layout` (set by
 *  `AppViewerConfig`); export draws the exact on-screen `StyledGraph` through the `export_graph_svg`
 *  binding. */
export function OCDeclarePanel(props: ComponentProps<typeof OCDeclareViewer>) {
  return <OCDeclareViewer {...props} />;
}
