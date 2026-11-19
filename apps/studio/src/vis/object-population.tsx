import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { ObjectPopulationView } from "@r4pm/components";
import { PiChartLine } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "objectPopulation",
  name: "Object Population",
  description: "Objects alive per type over time.",
  category: "ocel",
  tags: ["time"],
  icon: PiChartLine,
  supports: ["SlimLinkedOCEL"],
  keywords: ["work in progress", "wip", "inventory", "backlog", "lifetime", "objects over time"],
  order: 15,
  source: {
    binding: "app_bindings::get_object_population",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle, num_bins: 80 }),
  },
  component: ObjectPopulationView,
});
