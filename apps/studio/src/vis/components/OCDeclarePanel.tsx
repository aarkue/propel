import type { ComponentProps } from "react";
import { OCDeclareViewer } from "@r4pm/components";

/** OC-DECLARE viewer wrapper. rust4pm lays the constraints out and draws the SVG export through the
 *  backend passed as `ViewerConfig.viz` (set by `AppViewerConfig`). */
export function OCDeclarePanel(props: ComponentProps<typeof OCDeclareViewer>) {
  return <OCDeclareViewer {...props} />;
}
