import type { OCDeclareArc, OCDeclareDiscoveryOptions, SlimLinkedOCELHandle } from "@r4pm/client";
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
  // `onProjectActivities` re-projects constraints onto kept activities via the rust lossless
  // projection; without a backend, counts/projection fall back to name-sort / naive drop-touching.
  extraProps: async (ctx) => {
    const stats = await ctx.backend.callBinding("process_mining::bindings::ocel_type_stats", {
      ocel: ctx.datasetId as SlimLinkedOCELHandle,
    });
    const onProjectActivities = (arcs: OCDeclareArc[], activities: string[]) =>
      ctx.backend.callBinding(
        "process_mining::discovery::object_centric::oc_declare::project_oc_arcs_smart",
        { arcs, activities, lossless_reduction: true },
      );
    return { eventTypeCounts: stats.event_type_counts, onProjectActivities };
  },
  component: OCDeclarePanel,
});
