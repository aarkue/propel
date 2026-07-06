import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import { DFGViewer, type DirectlyFollowsGraph } from "@r4pm/components";
import type { DfPerformance } from "./util/performance-types";
import "@r4pm/components/styles.css";

const sample: DirectlyFollowsGraph = {
  activities: { "register request": 6, examine: 4, decide: 6, pay: 5 },
  directly_follows_relations: [
    [["register request", "examine"], 4],
    [["register request", "decide"], 2],
    [["examine", "decide"], 4],
    [["decide", "pay"], 5],
    [["pay", "pay"], 1],
  ],
  start_activities: { "register request": 6 },
  end_activities: { pay: 5 },
};

const performance: DfPerformance = {
  arcs: [
    {
      source: "register request",
      target: "examine",
      count: 4,
      min_ms: 6e4,
      max_ms: 3.6e5,
      mean_ms: 1.8e5,
      median_ms: 1.6e5,
      p90_ms: 3.2e5,
    },
    {
      source: "examine",
      target: "decide",
      count: 4,
      min_ms: 8.64e7,
      max_ms: 2.592e8,
      mean_ms: 1.728e8,
      median_ms: 1.7e8,
      p90_ms: 2.4e8,
    },
    {
      source: "decide",
      target: "pay",
      count: 5,
      min_ms: 4.32e7,
      max_ms: 1.728e8,
      mean_ms: 8.64e7,
      median_ms: 8.6e7,
      p90_ms: 1.5e8,
    },
  ],
};

const meta = {
  title: "Viewers/Directly-Follows Graph",
  component: DFGViewer,
  parameters: { frame: { mode: "canvas", height: 540 }, docs: { story: { iframeHeight: 580 } } },
} satisfies Meta<typeof DFGViewer>;
export default meta;

export const DFG: StoryObj = {
  name: "Frequency",
  render: () => <DFGViewer data={sample} />,
};

export const DFGPerformance: StoryObj = {
  name: "With performance",
  render: () => <DFGViewer data={sample} performance={performance} />,
};
