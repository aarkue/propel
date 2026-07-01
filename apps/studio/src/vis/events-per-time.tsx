import { lazy } from "react";
import type { EventLogHandle } from "@r4pm/client";
import { PiWaveSine } from "react-icons/pi";
import { defineVis } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const EventsPerTimeChart = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.EventsPerTimeChart })),
);

export const vis = defineVis({
  type: "eventsPerTime",
  name: "Events per Time",
  description: "Event volume over time as a histogram.",
  category: "time",
  icon: PiWaveSine,
  supports: ["EventLog"],
  keywords: ["timeline", "throughput", "histogram", "arrival"],
  order: 10,
  source: {
    binding: "process_mining::analysis::case_centric::event_timestamp_histogram::get_event_timestamps",
    needs: "EventLog",
    args: (ctx) => ({
      log: ctx.datasetId as EventLogHandle,
      options: { activity_key: "concept:name", num_bins: 50, timestamp_key: "time:timestamp" },
    }),
  },
  component: EventsPerTimeChart,
});
