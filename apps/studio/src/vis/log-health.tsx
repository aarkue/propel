import type { EventLogHandle } from "@r4pm/client";
import { type LogHealth, OcelHealthView, type ViewerProps } from "@r4pm/components";
import { PiFirstAid } from "react-icons/pi";
import { repairDataset } from "./components/repair";
import { defineVis } from "./define-vis";

/** Checks that count cases or attributes; the rest count events. */
const NOT_EVENTS: Record<string, string> = {
  empty_cases: "cases",
  tied_events: "cases",
  extreme_durations: "cases",
  mixed_type_attributes: "",
};

export const vis = defineVis({
  type: "logHealth",
  name: "Log Health Check",
  description:
    "Checks for missing or misordered timestamps, duplicates and mixed attribute types, with fixes.",
  category: "overview",
  icon: PiFirstAid,
  supports: ["EventLog"],
  keywords: ["quality", "validation", "errors", "lint", "check", "problems", "timestamps"],
  order: 1,
  source: {
    binding: "app_bindings::get_log_health",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  component: ({ data, handle }: ViewerProps<LogHealth>) => (
    <OcelHealthView
      data={{ num_events: data.num_events, num_objects: data.num_cases, findings: data.findings }}
      subject="event log"
      unit="cases"
      onRepair={handle ? (repairs) => repairDataset("EventLog", handle, repairs) : undefined}
      totalOf={(f) =>
        f.check in NOT_EVENTS
          ? { total: NOT_EVENTS[f.check] ? data.num_cases : 0, noun: NOT_EVENTS[f.check] }
          : { total: data.num_events, noun: "events" }
      }
    />
  ),
});
