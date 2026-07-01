import { AlignmentNetViewer } from "@r4pm/components";
import { PiGraph } from "react-icons/pi";
import { AlignmentModelBar, alignmentResolve, type ModelSource } from "./_alignment";
import { defineResolvedVis } from "./define-vis";

export const vis = defineResolvedVis({
  type: "alignmentNet",
  name: "Alignments (net)",
  description: "Alignment path overlaid on the chosen model net.",
  category: "conformance",
  icon: PiGraph,
  supports: ["EventLog"],
  keywords: ["alignment", "net", "path", "conformance"],
  order: 6,
  deferred: true,
  controls: { initial: null as ModelSource | null },
  source: { needs: "EventLog", returnType: "LogAlignments", resolve: alignmentResolve },
  panelControlsBar: (controls, set) => <AlignmentModelBar value={controls} onChange={set} />,
  component: AlignmentNetViewer,
});
