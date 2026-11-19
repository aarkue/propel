import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { type OcelHealth, OcelHealthView, type ViewerProps } from "@r4pm/components";
import { PiFirstAid } from "react-icons/pi";
import { repairDataset } from "./components/repair";
import { defineVis } from "./define-vis";

/** What each check counts; checks of types and attribute values show no share. */
const COUNTS: Record<string, "events" | "objects"> = {
  epoch_timestamps: "events",
  events_without_objects: "events",
  objects_without_events: "objects",
  same_time_events: "objects",
  self_relations: "objects",
};

export const vis = defineVis({
  type: "ocelHealth",
  name: "OCEL Health Check",
  description:
    "Checks for unlinked events and objects, placeholder timestamps and mistyped values, with fixes.",
  category: "ocel",
  tags: ["overview"],
  icon: PiFirstAid,
  supports: ["SlimLinkedOCEL"],
  keywords: ["quality", "validation", "errors", "lint", "check", "problems"],
  order: 12,
  source: {
    binding: "app_bindings::get_ocel_health",
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ ocel: ctx.datasetId as SlimLinkedOCELHandle }),
  },
  component: ({ data, handle }: ViewerProps<OcelHealth>) => (
    <OcelHealthView
      data={data}
      totalOf={(f) =>
        f.check in COUNTS
          ? {
              total: COUNTS[f.check] === "events" ? data.num_events : data.num_objects,
              noun: COUNTS[f.check],
            }
          : { total: 0, noun: "" }
      }
      onRepair={handle ? (repairs) => repairDataset("SlimLinkedOCEL", handle, repairs) : undefined}
    />
  ),
});
