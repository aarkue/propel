import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { PiFlowArrow } from "react-icons/pi";
import { backend } from "../backends";
import { OCDFGPanel } from "./components/OCDFGPanel";
import { defineVis } from "./define-vis";

const OCEL_DF_PERFORMANCE = "app_bindings::ocel::get_ocel_df_performance" as const;

export const vis = defineVis({
  type: "ocdfg",
  name: "OC-DFG",
  description: "Object-centric directly-follows graph (+ performance).",
  category: "ocel",
  tags: ["activities"],
  icon: PiFlowArrow,
  supports: ["SlimLinkedOCEL"],
  keywords: ["dfg", "object centric", "graph", "flow"],
  order: 14,
  source: {
    binding: "app_bindings::ocel::get_ocel_df",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  extraProps: async (ctx) => {
    const ocel = ctx.datasetId as SlimLinkedOCELHandle;
    const performance = await backend.callBinding(OCEL_DF_PERFORMANCE, { ocel });
    return { performance };
  },
  component: OCDFGPanel,
});
