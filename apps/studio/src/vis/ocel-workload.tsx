import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  RECORDED_TIME,
  timeZoneArg,
  type Workload,
  WorkloadCalendar,
  type WorkloadControls,
} from "@r4pm/components";
import { PiCalendarDots } from "react-icons/pi";
import { defineVis } from "./define-vis";

export const vis = defineVis({
  type: "ocelWorkload",
  name: "OCEL Workload Calendar",
  description: "Events by weekday and hour of day, per event type.",
  category: "time",
  tags: ["ocel"],
  icon: PiCalendarDots,
  supports: ["SlimLinkedOCEL"],
  keywords: ["heatmap", "weekday", "hour", "working hours", "calendar"],
  order: 11,
  controls: { initial: { timeZone: RECORDED_TIME } as WorkloadControls },
  source: {
    binding: "app_bindings::get_ocel_workload",
    needs: "SlimLinkedOCEL",
    args: (ctx, c) => ({
      ocel: ctx.datasetId as SlimLinkedOCELHandle,
      time_zone: timeZoneArg(c.timeZone ?? RECORDED_TIME),
    }),
  },
  component: ({
    data,
    controls,
    onControlsChange,
  }: {
    data: Workload;
    controls: WorkloadControls;
    onControlsChange?: (c: WorkloadControls) => void;
  }) => (
    <WorkloadCalendar
      data={data}
      groupLabel="Event type"
      controls={controls}
      onControlsChange={onControlsChange}
    />
  ),
});
