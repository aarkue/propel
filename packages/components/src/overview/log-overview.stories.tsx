import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type HealthFinding,
  type LogOverview,
  LogOverviewBoard,
  type LogOverviewTarget,
  type LogThroughput,
} from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";
import { useState } from "react";

const meta = {
  title: "Viewers/Log Overview",
  component: LogOverviewBoard,
  parameters: { frame: { mode: "canvas", height: 900 } },
} satisfies Meta<typeof LogOverviewBoard>;
export default meta;

const DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cases started and finished per bin: most fines are paid within weeks, unpaid ones go to credit
 *  collection about a year and a half later, and cases started near the end are still open. */
function throughput(start: number, end: number, bins: number, cases: number): LogThroughput {
  const rand = mulberry32(7);
  const width = Math.ceil((end - start) / bins);
  const weight = Array.from(
    { length: bins },
    (_, i) => (0.6 + 0.5 * Math.sin((i / bins) * Math.PI)) * (0.85 + 0.3 * rand()),
  );
  const scale = cases / weight.reduce((a, b) => a + b, 0);
  const started = weight.map((w) => Math.round(w * scale));
  const finished = started.map((_, i) => {
    const at = (k: number) => started[i - k] ?? 0;
    return Math.round(0.42 * at(0) + 0.14 * at(1) + 0.08 * at(2) + 0.3 * at(4) + 0.06 * at(5));
  });
  const median_duration_ms = started.map((_, i) => {
    const open = Math.max(0, i - (bins - 6));
    return (160 - open * 24 + 20 * (rand() - 0.5)) * DAY;
  });
  return {
    bin_starts_ms: started.map((_, i) => start + i * width),
    bin_width_ms: width,
    started,
    finished,
    median_duration_ms,
  };
}

const finding = (
  check: string,
  title: string,
  category: string,
  severity: HealthFinding["severity"],
  count: number,
  examples: string[],
): HealthFinding => ({ check, title, category, description: "", severity, count, examples, fixes: [] });

const START = Date.UTC(2000, 0, 1);
const END = Date.UTC(2013, 5, 18);

const roadFines: LogOverview = {
  num_cases: 150_370,
  num_events: 561_470,
  num_activities: 11,
  num_variants: 231,
  start_ms: START,
  end_ms: END,
  median_case_duration_ms: 158 * DAY,
  p90_case_duration_ms: 715 * DAY,
  top_variants: [
    {
      activities: [
        "Create Fine",
        "Send Fine",
        "Insert Fine Notification",
        "Add penalty",
        "Send for Credit Collection",
      ],
      cases: 56_482,
    },
    { activities: ["Create Fine", "Payment"], cases: 46_371 },
    { activities: ["Create Fine", "Send Fine"], cases: 20_385 },
    {
      activities: ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Payment"],
      cases: 9_520,
    },
    {
      activities: [
        "Create Fine",
        "Send Fine",
        "Insert Fine Notification",
        "Add penalty",
        "Payment",
        "Payment",
      ],
      cases: 3_736,
    },
    { activities: ["Create Fine", "Send Fine", "Payment"], cases: 3_301 },
    {
      activities: [
        "Create Fine",
        "Send Fine",
        "Insert Fine Notification",
        "Insert Date Appeal to Prefecture",
        "Add penalty",
        "Send Appeal to Prefecture",
      ],
      cases: 2_497,
    },
    {
      activities: [
        "Create Fine",
        "Send Fine",
        "Insert Fine Notification",
        "Add penalty",
        "Payment",
        "Send for Credit Collection",
      ],
      cases: 1_515,
    },
  ],
  activities: [
    ["Create Fine", 150_370],
    ["Send Fine", 103_987],
    ["Insert Fine Notification", 79_860],
    ["Add penalty", 79_860],
    ["Payment", 77_601],
    ["Send for Credit Collection", 59_013],
    ["Insert Date Appeal to Prefecture", 4_188],
    ["Send Appeal to Prefecture", 4_141],
    ["Receive Result Appeal from Prefecture", 999],
    ["Notify Result Appeal to Offender", 896],
    ["Appeal to Judge", 555],
  ],
  throughput: throughput(START, END, 40, 150_370),
  health: {
    num_cases: 150_370,
    num_events: 561_470,
    findings: [
      finding("duplicate_events", "Duplicate events", "Incorrect event", "warning", 512, ["A10023", "A1254"]),
      finding("tied_events", "Events at the same time", "Imprecise time", "info", 79_860, ["A1", "A100"]),
      finding("extreme_durations", "Very long cases", "Incorrect time", "info", 14, ["A21877", "C40125"]),
      finding("date_only", "Timestamps without a time of day", "Imprecise time", "info", 561_470, ["A1"]),
      finding(
        "events_without_activity",
        "Events without an activity",
        "Missing event type",
        "warning",
        0,
        [],
      ),
      finding("epoch_timestamps", "Events at 1970-01-01", "Incorrect time", "warning", 0, []),
      finding("unordered_events", "Events out of time order", "Incorrect time", "warning", 0, []),
    ],
  },
};

/** Opens the detail views through `onOpen`; here the story only shows which one was asked for. */
function WithLinks({ data }: { data: LogOverview }) {
  const [opened, setOpened] = useState<LogOverviewTarget | null>(null);
  return (
    <Flex direction="column" style={{ height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <LogOverviewBoard data={data} onOpen={setOpened} />
      </div>
      <Text size="1" color="gray" style={{ padding: "8px 16px", borderTop: "1px solid var(--gray-a4)" }}>
        {opened ? `Host asked to open: ${opened}` : "Click a link to open a detail view"}
      </Text>
    </Flex>
  );
}

/** The road traffic fine log at a glance, with links to the detail views. */
export const RoadTrafficFines: StoryObj = {
  render: () => <WithLinks data={roadFines} />,
};

/** Without `onOpen` the board is self-contained and shows no links. */
export const WithoutLinks: StoryObj = {
  render: () => <LogOverviewBoard data={roadFines} />,
};

/** A small log without timestamps: no time span, durations or throughput, and long activity names. */
export const Untimed: StoryObj = {
  render: () => (
    <LogOverviewBoard
      data={{
        num_cases: 42,
        num_events: 171,
        num_activities: 6,
        num_variants: 3,
        start_ms: null,
        end_ms: null,
        median_case_duration_ms: null,
        p90_case_duration_ms: null,
        top_variants: [
          {
            activities: [
              "Create Fine",
              "Send Fine",
              "Insert Fine Notification",
              "Receive Result Appeal from Prefecture",
              "Notify Result Appeal to Offender",
            ],
            cases: 30,
          },
          { activities: ["Create Fine", "Payment"], cases: 9 },
          { activities: ["Create Fine"], cases: 3 },
        ],
        activities: [
          ["Create Fine", 42],
          ["Send Fine", 30],
          ["Insert Fine Notification", 30],
          ["Receive Result Appeal from Prefecture", 30],
          ["Notify Result Appeal to Offender", 30],
          ["Payment", 9],
        ],
        throughput: { bin_starts_ms: [], bin_width_ms: 1, started: [], finished: [], median_duration_ms: [] },
        health: {
          num_cases: 42,
          num_events: 171,
          findings: [
            finding("events_without_time", "Events without a timestamp", "Missing time", "warning", 171, [
              "A1",
              "A2",
            ]),
          ],
        },
      }}
    />
  ),
};
