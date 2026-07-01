import type { EventLogHandle } from "@r4pm/client";
import { LogSummary } from "@r4pm/components";
import { PiInfo } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "logSummary",
  name: "Log Summary",
  description: "Trace, event, and activity counts for the selected event log.",
  category: "overview",
  icon: PiInfo,
  supports: ["EventLog"],
  keywords: ["summary", "stats", "metrics", "overview"],
  order: 0,
  source: {
    binding: "app_bindings::event_log::get_log_info",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  component: LogSummary,
});
