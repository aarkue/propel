import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type Option,
  RECORDED_TIME,
  type Workload,
  WorkloadCalendar,
  type WorkloadControls,
  type WorkloadGroup,
} from "@r4pm/components";
import { useMemo, useState } from "react";

const meta = {
  title: "Viewers/Workload Calendar",
  component: WorkloadCalendar,
  parameters: { frame: { mode: "canvas", height: 720 } },
} satisfies Meta<typeof WorkloadCalendar>;
export default meta;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ShopEvent {
  type: string;
  employee: string;
  ms: number;
}

/** Events per weekday (Monday first), the hours they fall in, and who does them. */
const PROFILES: { type: string; perDay: number[]; hours: number[]; staff: string[] }[] = [
  {
    type: "place order",
    perDay: [14, 13, 13, 14, 16, 20, 18],
    hours: [7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 19, 20, 20, 20, 21, 21, 22, 23],
    staff: [""],
  },
  {
    type: "pay order",
    perDay: [13, 12, 12, 13, 15, 17, 16],
    hours: [0, 8, 9, 12, 13, 18, 19, 20, 20, 21, 21, 22, 23],
    staff: [""],
  },
  {
    type: "confirm order",
    perDay: [26, 16, 15, 16, 17, 0, 0],
    hours: [8, 8, 9, 9, 10, 10, 11, 13, 14, 15, 16],
    staff: ["Sofia Romano", "Felix Wagner"],
  },
  {
    type: "pick item",
    perDay: [52, 48, 47, 48, 50, 12, 0],
    hours: [7, 8, 8, 9, 9, 10, 10, 11, 11, 13, 14, 14, 15, 15, 16],
    staff: ["Lena Brandt", "Tobias Keller", "Amira Haddad", "Jonas Weber"],
  },
  {
    type: "create package",
    perDay: [10, 10, 9, 10, 11, 3, 0],
    hours: [9, 10, 11, 11, 13, 14, 15, 15, 16, 16],
    staff: ["Lena Brandt", "Tobias Keller", "Amira Haddad", "Jonas Weber"],
  },
  {
    type: "send package",
    perDay: [10, 10, 9, 10, 12, 0, 0],
    hours: [15, 16, 16, 17, 17],
    staff: ["Can Yilmaz", "Marta Nowak"],
  },
  {
    type: "package delivered",
    perDay: [5, 10, 10, 10, 10, 9, 0],
    hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    staff: ["Can Yilmaz", "Marta Nowak"],
  },
  { type: "payment reminder", perDay: [4, 3, 3, 3, 3, 0, 0], hours: [6], staff: ["billing job"] },
  {
    type: "item out of stock",
    perDay: [2, 1, 1, 1, 1, 0, 0],
    hours: [7, 8, 8, 9],
    staff: ["Lena Brandt", "Amira Haddad"],
  },
  {
    type: "reorder item",
    perDay: [1, 2, 1, 1, 1, 0, 0],
    hours: [9, 10, 11],
    staff: ["Jonas Weber"],
  },
];

/** Six weeks of an online shop from Monday, 9 January 2023, recorded in local time (UTC+01:00). */
function simulateShop(): ShopEvent[] {
  const rand = mulberry32(11);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const events: ShopEvent[] = [];
  for (let day = 0; day < 42; day++) {
    for (const p of PROFILES) {
      const n = Math.round(p.perDay[day % 7] * (0.75 + 0.5 * rand()));
      for (let k = 0; k < n; k++) {
        const hour = pick(p.hours);
        const minute = p.hours.length === 1 ? Math.floor(rand() * 3) : Math.floor(rand() * 60);
        events.push({
          type: p.type,
          employee: pick(p.staff),
          ms: Date.UTC(2023, 0, 9 + day, hour - 1, minute),
        });
      }
    }
  }
  return events;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Weekday-hour slot of a time in `zone`; recorded times carry the shop's UTC+01:00 offset. */
function slot(ms: number, zone: string): number {
  const timeZone = zone === RECORDED_TIME ? "Etc/GMT-1" : zone;
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  const parts = f.formatToParts(ms);
  const day = WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Mon");
  return day * 24 + Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

/** Counts events by weekday and hour per group, like the engine's workload binding. */
function workload(events: ShopEvent[], groupBy: "type" | "employee", zone: string): Workload {
  const groups = new Map<string, WorkloadGroup>();
  for (const e of events) {
    const key = e[groupBy];
    let g = groups.get(key);
    if (!g) {
      g = { key, total: 0, counts: new Array(168).fill(0) };
      groups.set(key, g);
    }
    g.total++;
    g.counts[slot(e.ms, zone)]++;
  }
  const times = events.map((e) => e.ms);
  return {
    groups: [...groups.values()].sort((a, b) => b.total - a.total),
    events_without_time: 0,
    date_only: false,
    span_ms: [Math.min(...times), Math.max(...times)],
  };
}

const shopEvents = simulateShop();

/** The time zone picker recounts the events, as a host would by calling the binding again. */
function ShopWorkload() {
  const [controls, setControls] = useState<WorkloadControls>({ timeZone: RECORDED_TIME });
  const data = useMemo(
    () => workload(shopEvents, "type", controls.timeZone ?? RECORDED_TIME),
    [controls.timeZone],
  );
  return (
    <WorkloadCalendar
      data={data}
      groupLabel="Event type"
      controls={controls}
      onControlsChange={setControls}
    />
  );
}

const GROUP_BY: Option<string>[] = [
  { value: "type", label: "Event type", description: "One group per event type" },
  { value: "employee", label: "Employee", description: "The employee related to each event" },
];

function GroupedWorkload() {
  const [controls, setControls] = useState<WorkloadControls>({
    groupBy: "employee",
    timeZone: RECORDED_TIME,
  });
  const groupBy = controls.groupBy === "type" ? "type" : "employee";
  const data = useMemo(
    () => ({
      ...workload(shopEvents, groupBy, controls.timeZone ?? RECORDED_TIME),
      events_without_time: 12,
    }),
    [groupBy, controls.timeZone],
  );
  return (
    <WorkloadCalendar
      data={data}
      groupLabel={GROUP_BY.find((g) => g.value === groupBy)?.label}
      groupByOptions={GROUP_BY}
      controls={controls}
      onControlsChange={setControls}
    />
  );
}

/** Road traffic fines record dates only: every event sits at midnight, so only weekdays count. */
function fineGroups(): WorkloadGroup[] {
  const activities: [string, number, number[]][] = [
    ["Create Fine", 150_370, [16, 17, 17, 16, 17, 10, 7]],
    ["Send Fine", 103_987, [18, 22, 21, 20, 19, 0, 0]],
    ["Insert Fine Notification", 79_860, [17, 18, 18, 17, 17, 13, 0]],
    ["Add penalty", 79_860, [15, 15, 14, 14, 15, 14, 13]],
    ["Payment", 77_601, [19, 18, 17, 17, 16, 9, 4]],
    ["Send for Credit Collection", 59_013, [0, 0, 0, 0, 100, 0, 0]],
    ["Insert Date Appeal to Prefecture", 4_188, [19, 20, 20, 19, 18, 4, 0]],
    ["Send Appeal to Prefecture", 4_141, [21, 20, 20, 20, 19, 0, 0]],
    ["Receive Result Appeal from Prefecture", 999, [22, 20, 19, 20, 19, 0, 0]],
    ["Notify Result Appeal to Offender", 896, [20, 21, 20, 20, 19, 0, 0]],
    ["Appeal to Judge", 555, [24, 20, 18, 20, 18, 0, 0]],
  ];
  return activities.map(([key, total, weights]) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    const counts = new Array(168).fill(0);
    let left = total;
    weights.forEach((w, day) => {
      const n = day === 6 ? left : Math.round((total * w) / sum);
      counts[day * 24] = n;
      left -= n;
    });
    return { key, total, counts };
  });
}

function DateOnlyWorkload() {
  const [controls, setControls] = useState<WorkloadControls>({ timeZone: RECORDED_TIME });
  return (
    <WorkloadCalendar
      data={{
        groups: fineGroups(),
        events_without_time: 0,
        date_only: true,
        span_ms: [Date.UTC(2000, 0, 1), Date.UTC(2013, 5, 18)],
      }}
      controls={controls}
      onControlsChange={setControls}
    />
  );
}

/** Six weeks of an order-management OCEL by event type. Pick a time zone to read the hours in. */
export const OrderManagement: StoryObj = {
  render: () => <ShopWorkload />,
};

/** With `groupByOptions` the host offers other groupings, here the employees. Untimed events are left out. */
export const GroupedByEmployee: StoryObj = {
  render: () => <GroupedWorkload />,
};

/** A log with dates only: the counts sit at midnight, so the view shows weekdays and turns off the time zone. */
export const DateOnly: StoryObj = {
  render: () => <DateOnlyWorkload />,
};

/** Without `onControlsChange` the calendar shows no time zone picker. */
export const Static: StoryObj = {
  render: () => (
    <WorkloadCalendar data={workload(shopEvents, "type", RECORDED_TIME)} groupLabel="Event type" />
  ),
};

/** No event has a readable time. */
export const Empty: StoryObj = {
  render: () => (
    <WorkloadCalendar data={{ groups: [], events_without_time: 340, date_only: false, span_ms: null }} />
  ),
};
