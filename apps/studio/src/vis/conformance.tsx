import type { LogAlignments } from "@r4pm/client";
import { FitnessView, LoadingState, type ViewerProps } from "@r4pm/components";
import { PiCheckCircle } from "react-icons/pi";
import { AlignmentModelBar, alignmentResolve, type ModelSource } from "./_alignment";
import { defineResolvedVis } from "./define-vis";

// Renders the fitness aggregate from a full alignment result; loading until it is computed.
function ConformanceView({ data }: ViewerProps<LogAlignments>) {
  return data.fitness ? <FitnessView data={data.fitness} /> : <LoadingState label="aligning event log..." />;
}

export const vis = defineResolvedVis({
  type: "conformance",
  name: "Conformance",
  description: "Alignment fitness of the log vs. a discovered net.",
  category: "conformance",
  icon: PiCheckCircle,
  supports: ["EventLog"],
  keywords: ["conformance", "fitness", "alignment"],
  order: 8,
  viewer: false,
  deferred: true,
  controls: { initial: null as ModelSource | null },
  source: { needs: "EventLog", resolve: alignmentResolve },
  panelControlsBar: (controls, set) => <AlignmentModelBar value={controls} onChange={set} />,
  component: ConformanceView,
});
