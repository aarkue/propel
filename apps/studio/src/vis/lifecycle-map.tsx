import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { LifecycleMapView } from "@r4pm/components";
import { PiPath } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "lifecycleMap",
  name: "Lifecycle Map",
  description: "Per object type, when its activities happen in an object's life.",
  category: "ocel",
  tags: ["time"],
  icon: PiPath,
  supports: ["SlimLinkedOCEL"],
  keywords: ["lifecycle", "object types", "timing", "rhythm", "lifetime", "overview"],
  order: 13,
  source: {
    binding: "app_bindings::get_lifecycle_map",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  component: LifecycleMapView,
});
