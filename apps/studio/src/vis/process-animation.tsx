import type { AcceptingPetriNetHandle, EventLogHandle } from "@r4pm/client";
import {
  type Dfg,
  PetriNetAnimation,
  type PetriNetAnimationData,
  ProcessMapAnimation,
  type ProcessMapAnimationData,
  type RustPetriNet,
  type ViewerProps,
  Segmented,
} from "@r4pm/components";
import { Flex } from "@r4pm/components/ui";
import { PiFilmStrip } from "react-icons/pi";
import { getModelValue } from "../models";
import { AlignmentModelBar, type ModelSource, netId, useMissingModel } from "./_alignment";
import { defineResolvedVis } from "./define-vis";

const DISCOVER_DFG = "process_mining::discover_dfg" as const;
const CASE_JOURNEYS = "app_bindings::get_case_journeys" as const;
const NET_REPLAY = "app_bindings::get_net_replay" as const;

interface Controls {
  model: "dfg" | "petri";
  /** The saved Petri net replayed in the `petri` model. */
  net: ModelSource | null;
}

const controlsOf = (raw: unknown): Controls => {
  const c = (raw ?? {}) as Partial<Controls>;
  return { model: c.model === "petri" ? "petri" : "dfg", net: netId(c.net) ? (c.net as ModelSource) : null };
};

type Data =
  | { model: "dfg"; map: ProcessMapAnimationData }
  | { model: "petri"; replay: PetriNetAnimationData };

export const vis = defineResolvedVis({
  type: "processAnimation",
  name: "Process Animation",
  description:
    "Cases as tokens moving in real time over the DFG, or over a saved Petri net through their alignments.",
  category: "time",
  tags: ["activities", "models"],
  icon: PiFilmStrip,
  supports: ["EventLog"],
  keywords: [
    "animation",
    "replay",
    "movie",
    "tokens",
    "simulation",
    "queue",
    "playback",
    "petri",
    "alignment",
  ],
  order: 13,
  controls: {
    initial: { model: "dfg", net: null } as Controls,
    useMissing: (raw) => {
      const c = controlsOf(raw);
      const missing = useMissingModel(c.net);
      return c.model === "petri" ? missing : null;
    },
  },
  source: {
    needs: "EventLog",
    resolve: async (ctx, raw): Promise<Data> => {
      const c = controlsOf(raw);
      const event_log = ctx.datasetId as EventLogHandle;
      if (c.model === "dfg") {
        const [dfg, journeys] = await Promise.all([
          ctx.backend.callBinding(DISCOVER_DFG, { event_log }),
          ctx.backend.callBinding(CASE_JOURNEYS, { event_log }),
        ]);
        return { model: "dfg", map: { source: { kind: "dfg", data: dfg as Dfg }, journeys } };
      }
      const id = netId(c.net);
      if (!id) throw new Error("No Petri net selected.");
      const [net, replay] = await Promise.all([
        getModelValue(id),
        ctx.backend.callBinding(NET_REPLAY, { event_log, net: id as AcceptingPetriNetHandle }, ctx.job),
      ]);
      return { model: "petri", replay: { net: net as RustPetriNet, replay } };
    },
  },
  viewer: false,
  panelControlsBar: (raw, set, datasetId) => {
    const c = controlsOf(raw);
    return (
      <Flex align="center" gap="3" wrap="wrap">
        <Segmented<Controls["model"]>
          aria-label="Model"
          value={c.model}
          onChange={(model) => set({ ...c, model })}
          options={[
            { value: "dfg", label: "DFG", description: "Cases move over the directly-follows graph" },
            { value: "petri", label: "Petri net", description: "Cases are replayed on a saved Petri net" },
          ]}
        />
        {c.model === "petri" && (
          <AlignmentModelBar
            label="Net"
            value={c.net}
            onChange={(net) => set({ ...c, net })}
            datasetId={datasetId}
          />
        )}
      </Flex>
    );
  },
  component: ({ data, ...config }: ViewerProps<Data>) =>
    data.model === "dfg" ? (
      <ProcessMapAnimation {...config} data={data.map} />
    ) : (
      <PetriNetAnimation {...config} data={data.replay} />
    ),
});
