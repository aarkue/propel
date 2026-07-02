import { AlignmentListViewer } from "@r4pm/components";
import { PiListBullets } from "react-icons/pi";
import { AlignmentModelBar, alignmentResolve, toFrontendAlignments, type ModelSource } from "./_alignment";
import { defineResolvedVis } from "./define-vis";

export const vis = defineResolvedVis({
  type: "alignmentList",
  name: "Alignments (list)",
  description: "Per-variant alignment moves + cost vs a chosen model.",
  category: "conformance",
  icon: PiListBullets,
  supports: ["EventLog"],
  keywords: ["alignment", "moves", "cost", "conformance"],
  order: 5,
  deferred: true,
  controls: { initial: null as ModelSource | null },
  source: { needs: "EventLog", resolve: alignmentResolve },
  viewer: { LogAlignments: toFrontendAlignments },
  panelControlsBar: (controls, set) => <AlignmentModelBar value={controls} onChange={set} />,
  component: AlignmentListViewer,
});
