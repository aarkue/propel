import { PiPuzzlePiece } from "react-icons/pi";
import { PipelineEditor } from "../pipeline";
import { backend } from "../backends";
import { attachPipeline, openOutputAsPanel } from "../panels/pipeline-bridge";
import { viewerRegistry } from "../panels/viewer-registry";
import { definePanel } from "./define-vis";

function PipelinePanel() {
  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <PipelineEditor
        ref={attachPipeline}
        backend={backend}
        viewerRegistry={viewerRegistry}
        onOpenOutputAsPanel={openOutputAsPanel}
      />
    </div>
  );
}

export const vis = definePanel({
  type: "pipeline",
  name: "Pipeline",
  description: "Wire registry functions into a node flow.",
  category: "transforms",
  icon: PiPuzzlePiece,
  keywords: ["pipeline", "nodes", "compose", "flow"],
  genericExport: false,
  order: 20,
  component: PipelinePanel,
});
