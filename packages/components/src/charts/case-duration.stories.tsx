import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { CaseDurationChart } from "@r4pm/components/charts";
import type { CaseDurations } from "@r4pm/components/charts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Sample data shaped exactly like the binding's return type (compiler-checked).
const sample: CaseDurations = {
  hist_bin_edges_ms: [MIN, 10 * MIN, HOUR, 6 * HOUR, DAY, 3 * DAY, 7 * DAY],
  hist_counts: [4, 18, 42, 27, 12, 3],
  ecdf_x_ms: [MIN, 10 * MIN, HOUR, 6 * HOUR, DAY, 3 * DAY, 7 * DAY],
  ecdf_y: [0.04, 0.21, 0.6, 0.85, 0.96, 1.0, 1.0],
  min_ms: MIN,
  max_ms: 7 * DAY,
  mean_ms: 8 * HOUR,
  median_ms: 4 * HOUR,
  p90_ms: 2 * DAY,
  p95_ms: 4 * DAY,
  p99_ms: 6 * DAY,
  num_cases: 106,
  num_empty_cases: 2,
};

const meta = {
  title: "Viewers/Case Duration",
  component: CaseDurationChart,
  parameters: { frame: { mode: "canvas", height: 360 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof CaseDurationChart>;
export default meta;

export const Default: StoryObj = {
  name: "Case Durations",
  render: () => <CaseDurationChart data={sample} />,
};
