import type { OCDeclareDiscoveryOptions, SlimLinkedOCELHandle } from "@r4pm/client";
import { PiListBullets } from "react-icons/pi";
import { OCDeclarePanel } from "./components/OCDeclarePanel";
import { defineVis } from "./define-vis";

// Default OC-DECLARE discovery options (required for non-empty arrow types).
const OC_DECLARE_OPTIONS: OCDeclareDiscoveryOptions = {
  noise_threshold: 0.2,
  o2o_mode: "None",
  acts_to_use: null,
  counts_for_generation: [1, 20],
  counts_for_filter: [1, 20],
  reduction: "Lossless",
  refinement: true,
  considered_arrow_types: ["AS", "EF", "EP"],
};

export const vis = defineVis({
  type: "ocDeclare",
  name: "OC-DECLARE",
  description: "Object-centric DECLARE behavioral constraints.",
  category: "ocel",
  icon: PiListBullets,
  supports: ["SlimLinkedOCEL"],
  keywords: ["declare", "constraints", "rules"],
  order: 15,
  deferred: true,
  source: {
    binding: "process_mining::discovery::object_centric::oc_declare::discover_behavior_constraints",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ locel: ctx.datasetId as SlimLinkedOCELHandle, options: OC_DECLARE_OPTIONS }),
  },
  component: OCDeclarePanel,
});
