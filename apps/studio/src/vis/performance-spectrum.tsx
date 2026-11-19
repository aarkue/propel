import { lazy } from "react";
import type { EventLogHandle } from "@r4pm/client";
import type { PerformanceSpectrumControls } from "@r4pm/components/charts";
import { PiChartLine } from "react-icons/pi";
import { defineVis } from "./define-vis";

const PerformanceSpectrumView = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.PerformanceSpectrumView })),
);

export const vis = defineVis({
  type: "performanceSpectrum",
  name: "Performance Spectrum",
  description:
    "Each passage through the steps of a path as a line over time, showing queues, batches and overtaking.",
  category: "time",
  icon: PiChartLine,
  supports: ["EventLog"],
  keywords: ["performance", "spectrum", "batching", "queue", "fifo", "waiting time", "bottleneck"],
  order: 12,
  controls: { initial: { path: null } as PerformanceSpectrumControls },
  source: {
    binding: "app_bindings::get_performance_spectrum",
    needs: "EventLog",
    args: (ctx, c) => ({ event_log: ctx.datasetId as EventLogHandle, path: c.path ?? null }),
  },
  component: PerformanceSpectrumView,
});
