import type { AcceptingPetriNetHandle, EventLogHandle } from "@r4pm/client";
import { PetriNetAnimation, type PetriNetAnimationData, type RustPetriNet } from "@r4pm/components";
import { PiFilmStrip } from "react-icons/pi";
import { getModelValue } from "../models";
import { AlignmentModelBar, type ModelSource, netId, useMissingModel } from "./_alignment";
import { defineResolvedVis } from "./define-vis";

const NET_REPLAY = "app_bindings::get_net_replay" as const;

export const vis = defineResolvedVis({
  type: "netAnimation",
  name: "Petri Net Animation",
  description: "Cases replayed on a saved Petri net through their alignments, as moving tokens.",
  category: "conformance",
  tags: ["time", "models"],
  icon: PiFilmStrip,
  supports: ["EventLog"],
  keywords: ["animation", "replay", "token", "petri", "alignment", "movie", "playback"],
  order: 9,
  deferred: true,
  controls: { initial: null as ModelSource | null, useMissing: useMissingModel },
  source: {
    needs: "EventLog",
    resolve: async (ctx, model): Promise<PetriNetAnimationData> => {
      const id = netId(model);
      if (!id) throw new Error("No Petri net selected.");
      const [net, replay] = await Promise.all([
        getModelValue(id),
        ctx.backend.callBinding(
          NET_REPLAY,
          { event_log: ctx.datasetId as EventLogHandle, net: id as AcceptingPetriNetHandle },
          ctx.job,
        ),
      ]);
      return { net: net as RustPetriNet, replay };
    },
  },
  viewer: false,
  panelControlsBar: (controls, set, datasetId) => (
    <AlignmentModelBar value={controls} onChange={set} datasetId={datasetId} />
  ),
  component: PetriNetAnimation,
});
