import type { EventLogHandle } from "@r4pm/client";
import { type LogOverview, LogOverviewBoard, type ViewerProps } from "@r4pm/components";
import { PiSquaresFour } from "react-icons/pi";
import { addPanelToDockview } from "../panels/registry";
import { defineResolvedVis } from "./define-vis";

export const vis = defineResolvedVis({
  type: "logOverview",
  name: "Log Overview",
  description: "Cases over time, top variants and activities of an event log.",
  category: "overview",
  icon: PiSquaresFour,
  supports: ["EventLog"],
  keywords: ["overview", "summary", "dashboard", "start", "kpi", "health", "throughput"],
  order: -1,
  source: {
    needs: "EventLog",
    resolve: (ctx): Promise<LogOverview> =>
      ctx.backend.callBinding("app_bindings::get_log_overview", {
        event_log: ctx.datasetId as EventLogHandle,
      }),
  },
  viewer: false,
  component: ({ data, handle, ...config }: ViewerProps<LogOverview>) => (
    <LogOverviewBoard
      data={data}
      onOpen={(target) => addPanelToDockview(target, undefined, handle ? { datasetId: handle } : undefined)}
      {...config}
    />
  ),
});
