import { lazy } from "react";
import type { EventLogHandle } from "@r4pm/client";
import { PiClockCountdown } from "react-icons/pi";
import { defineVis } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const CaseDurationChart = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.CaseDurationChart })),
);

export const vis = defineVis({
  type: "caseDuration",
  name: "Case Durations",
  description: "Distribution of case durations.",
  category: "time",
  icon: PiClockCountdown,
  supports: ["EventLog"],
  keywords: ["lead time", "cycle time", "duration", "histogram"],
  order: 10,
  source: {
    binding: "app_bindings::event_log::get_case_durations",
    needs: "EventLog",
    args: (ctx) => ({ event_log: ctx.datasetId as EventLogHandle }),
  },
  component: CaseDurationChart,
});
