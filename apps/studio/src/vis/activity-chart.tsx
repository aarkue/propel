import { lazy } from "react";
import type { EventLogHandle, Map_of_uint } from "@r4pm/client";
import type { ViewerProps } from "@r4pm/components";
import { PiChartBar } from "react-icons/pi";
import { backend } from "../backends";
import { defineVis } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const ActivityChart = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.ActivityChart })),
);

const GET_LOG_INFO = "app_bindings::event_log::get_log_info" as const;

// ActivityChart takes `counts` + `numEvents` (not a single `data`); map the binding result (counts)
// to `counts` and pull `numEvents` from the panel-side `extraProps`.
function ActivityChartVis({ data, numEvents }: ViewerProps<Map_of_uint> & { numEvents?: number }) {
  return <ActivityChart counts={data} numEvents={numEvents ?? 0} />;
}

export const vis = defineVis({
  type: "activityChart",
  name: "Activity Counts",
  description: "Frequency of each activity (bar / pie, per-activity colors).",
  category: "activities",
  icon: PiChartBar,
  supports: ["EventLog"],
  keywords: ["activities", "counts", "histogram"],
  order: 5,
  viewer: false,
  source: {
    binding: "app_bindings::event_log::get_activity_counts",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  extraProps: async (ctx) => {
    const info = await backend.callBinding(GET_LOG_INFO, { event_log: ctx.datasetId as EventLogHandle });
    return { numEvents: info.num_events };
  },
  component: ActivityChartVis,
});
