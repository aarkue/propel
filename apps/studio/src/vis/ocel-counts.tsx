import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { OCELCountInfo } from "@r4pm/components";
import { PiTable } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "ocelCounts",
  name: "OCEL Type Counts",
  description: "Per-type object + event counts of the OCEL.",
  category: "ocel",
  icon: PiTable,
  supports: ["SlimLinkedOCEL"],
  keywords: ["summary", "counts", "objects", "types"],
  order: 13,
  source: {
    binding: "process_mining::bindings::ocel_type_stats",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  component: OCELCountInfo,
});
