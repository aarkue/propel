import type { EventLogHandle } from "@r4pm/client";
import {
  type Option,
  RECORDED_TIME,
  timeZoneArg,
  type Workload,
  WorkloadCalendar,
  type WorkloadControls,
} from "@r4pm/components";
import { PiCalendarDots } from "react-icons/pi";
import { defineVis } from "./define-vis";

const GROUP_BY: Option<string>[] = [
  { value: "concept:name", label: "Activity", description: "One group per activity (concept:name)" },
  { value: "org:resource", label: "Resource", description: "The resource of each event (org:resource)" },
  { value: "org:role", label: "Role", description: "The role of each event's resource (org:role)" },
];

type Controls = WorkloadControls & { groupBy: string };

export const vis = defineVis({
  type: "workload",
  name: "Workload Calendar",
  description: "Events by weekday and hour of day, per activity or resource.",
  category: "time",
  icon: PiCalendarDots,
  supports: ["EventLog"],
  keywords: ["heatmap", "weekday", "hour", "working hours", "resource", "calendar"],
  order: 11,
  controls: { initial: { groupBy: "concept:name", timeZone: RECORDED_TIME } as Controls },
  source: {
    binding: "app_bindings::get_event_log_workload",
    needs: "EventLog",
    args: (ctx, c) => ({
      event_log: ctx.datasetId as EventLogHandle,
      group_by: c.groupBy,
      time_zone: timeZoneArg(c.timeZone ?? RECORDED_TIME),
    }),
  },
  component: ({
    data,
    controls,
    onControlsChange,
  }: {
    data: Workload;
    controls: Controls;
    onControlsChange?: (c: Controls) => void;
  }) => (
    <WorkloadCalendar
      data={data}
      groupLabel={GROUP_BY.find((g) => g.value === controls.groupBy)?.label ?? controls.groupBy}
      groupByOptions={GROUP_BY}
      controls={controls}
      onControlsChange={onControlsChange && ((c) => onControlsChange({ ...controls, ...c }))}
    />
  ),
});
