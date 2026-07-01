import type { EventLogHandle } from "@r4pm/client";
import { PiTreeStructure } from "react-icons/pi";
import { defineVis } from "./define-vis";
import { PetriNetPanel } from "./components/PetriNetPanel";

export const vis = defineVis({
  type: "petriNet",
  name: "Petri Net",
  description: "Discover a Petri net (Alpha+++) from the log.",
  category: "models",
  icon: PiTreeStructure,
  supports: ["EventLog"],
  keywords: ["petri", "net", "model", "discovery", "alpha", "simulate", "edit"],
  order: 7,
  source: {
    binding: "app_bindings::discover_petri_net",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  component: PetriNetPanel,
});
