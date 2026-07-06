import type { EventLogHandle } from "@r4pm/client";
import { DFGViewer } from "@r4pm/components";
import { PiFlowArrow } from "react-icons/pi";
import { backend } from "../backends";
import { defineVis } from "./define-vis";

const DF_PERFORMANCE = "app_bindings::event_log::get_df_performance" as const;

export const vis = defineVis({
  type: "dfg",
  name: "DFG",
  description: "Case-centric directly-follows graph.",
  category: "activities",
  icon: PiFlowArrow,
  supports: ["EventLog"],
  keywords: ["dfg", "directly follows", "graph", "flow"],
  order: 2,
  source: {
    binding: "app_bindings::event_log::get_df",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  // Panel-only performance overlay; the pipeline viewer renders the bare DFG.
  extraProps: async (ctx) => ({
    performance: await backend.callBinding(DF_PERFORMANCE, { event_log: ctx.datasetId as EventLogHandle }),
  }),
  component: DFGViewer,
});
