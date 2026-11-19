import { Flex } from "@r4pm/components/ui";
import { PiTreeStructure } from "react-icons/pi";
import {
  DEFAULT_MINER,
  discoverPetriNet,
  type MinerChoice,
  minerChoice,
  PETRI_NET_VARIANTS,
} from "./_discovery";
import { defineResolvedVis } from "./define-vis";
import { MinerPicker } from "./components/MinerPicker";
import { PetriNetPanel } from "./components/PetriNetPanel";

const VARIANTS = PETRI_NET_VARIANTS;

export const vis = defineResolvedVis({
  type: "petriNet",
  name: "Petri Net",
  description: "Discover a Petri net (Inductive Miner or Alpha+++) from the log.",
  category: "models",
  icon: PiTreeStructure,
  supports: ["EventLog"],
  keywords: [
    "petri",
    "net",
    "model",
    "discovery",
    "inductive",
    "miner",
    "imf",
    "imd",
    "alpha",
    "simulate",
    "edit",
  ],
  order: 7,
  controls: { initial: DEFAULT_MINER as MinerChoice },
  source: {
    needs: "EventLog",
    resolve: (ctx, c) => discoverPetriNet(ctx.backend, ctx.datasetId, minerChoice(c, VARIANTS), ctx.job),
  },
  viewer: { AcceptingPetriNet: (net) => net },
  panelControlsBar: (c, set) => (
    <Flex align="center" gap="3" wrap="wrap">
      <MinerPicker value={minerChoice(c, VARIANTS)} onChange={set} variants={VARIANTS} />
    </Flex>
  ),
  component: PetriNetPanel,
});
