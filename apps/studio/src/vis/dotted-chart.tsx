import { lazy } from "react";
import type { EventLogHandle } from "@r4pm/client";
import type { DottedChartAxisConfig } from "@r4pm/components/charts";
import { PiChartScatter } from "react-icons/pi";
import { defineVis } from "./define-vis";

// Lazy so `@r4pm/components/charts` -> Plotly stays out of the initial load graph.
const DottedChart = lazy(() => import("@r4pm/components/charts").then((m) => ({ default: m.DottedChart })));

// Mirror of `DOTTED_CHART_TIMESTAMP_KEY` (to prevent pulling in the bundle just for that constant).
const TIMESTAMP_KEY = "time:timestamp";

export const vis = defineVis({
  type: "dottedChart",
  name: "Dotted Chart",
  description: "Every event over time, one row per case.",
  category: "time",
  icon: PiChartScatter,
  supports: ["EventLog"],
  keywords: ["scatter", "events", "timeline"],
  order: 3,
  controls: { initial: { x: "Time", y: "Case", color: "Activity" } satisfies DottedChartAxisConfig },
  source: {
    binding: "process_mining::analysis::case_centric::dotted_chart::get_dotted_chart",
    needs: "EventLog",
    args: (ctx, c) => ({
      xes: ctx.datasetId as EventLogHandle,
      options: { x_axis: c.x, y_axis: c.y, color_axis: c.color, timestamp_key: TIMESTAMP_KEY },
    }),
  },
  component: DottedChart,
});
