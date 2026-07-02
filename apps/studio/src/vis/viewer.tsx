import type { IDockviewPanelProps } from "dockview";
import { PiChartBar } from "react-icons/pi";
import { viewerRegistry } from "../panels/viewer-registry";
import { definePanel } from "./define-vis";
import { ViewerExportFrame } from "@r4pm/components";

/** Resolves a viewer by return-type title and renders provided data (pipeline output bridge). */
function ViewerPanel(props: IDockviewPanelProps) {
  const { returnTypeTitle, data } = (props.params ?? {}) as {
    returnTypeTitle?: string;
    data?: unknown;
  };
  const viewer = returnTypeTitle ? viewerRegistry.resolve({ returnType: returnTypeTitle }) : undefined;
  if (!viewer) return <pre style={{ padding: 16 }}>No viewer for "{String(returnTypeTitle)}"</pre>;
  const V = viewer.component;
  return (
    <ViewerExportFrame style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div data-testid="chart" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <V data={data} returnType={returnTypeTitle} />
      </div>
    </ViewerExportFrame>
  );
}

export const vis = definePanel({
  type: "viewer",
  name: "Output Viewer",
  description: "Renders a pipeline node's output.",
  category: "overview",
  icon: PiChartBar,
  hidden: true,
  genericExport: false,
  order: 22,
  component: ViewerPanel,
});
