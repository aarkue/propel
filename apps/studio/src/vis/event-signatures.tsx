import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { EventSignaturesView } from "@r4pm/components";
import { PiStackSimple } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "eventSignatures",
  name: "Event Signatures",
  description: "The combinations of object types that the events of each type involve.",
  category: "ocel",
  icon: PiStackSimple,
  supports: ["SlimLinkedOCEL"],
  keywords: ["e2o", "object types", "batching", "convergence", "divergence", "cardinality"],
  order: 14,
  source: {
    binding: "app_bindings::get_event_signatures",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  component: EventSignaturesView,
});
