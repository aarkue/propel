import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { OCDFGViewer } from "@r4pm/components";
import { PiFlowArrow } from "react-icons/pi";
import { backend } from "../backends";
import { defineVis } from "./define-vis";

const OCEL_DF_PERFORMANCE = "app_bindings::ocel::get_ocel_df_performance" as const;
const OCEL_TYPE_STATS = "process_mining::bindings::ocel_type_stats" as const;

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
    binding:
      "process_mining::core::process_models::object_centric::ocdfg::object_centric_dfg_struct::discover_dfg_from_ocel",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  extraProps: async (ctx) => {
    const ocel = ctx.datasetId as SlimLinkedOCELHandle;
    const [performance, stats] = await Promise.all([
      backend.callBinding(OCEL_DF_PERFORMANCE, { ocel }),
      backend.callBinding(OCEL_TYPE_STATS, { ocel }),
    ]);
    return { performance, objectCounts: stats.object_type_counts };
  },
  component: OCDFGViewer,
});
