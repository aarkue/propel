import type { Meta, StoryObj } from "@storybook/react-vite";
import { OCDFGViewer, type OCDirectlyFollowsGraph } from "@r4pm/components";
import type { OcelDfPerformance } from "./util/performance-types";
import "@r4pm/components/styles.css";

const ocSample: OCDirectlyFollowsGraph = {
  object_counts: { order: 3, item: 5 },
  object_type_to_dfg: {
    order: {
      activities: { "place order": 3, "confirm order": 3, ship: 2 },
      directly_follows_relations: [
        [["place order", "confirm order"], 3],
        [["confirm order", "ship"], 2],
      ],
      start_activities: { "place order": 3 },
      end_activities: { ship: 2 },
    },
    item: {
      activities: { "pick item": 5, "pack item": 4, ship: 4 },
      directly_follows_relations: [
        [["pick item", "pack item"], 4],
        [["pack item", "ship"], 4],
      ],
      start_activities: { "pick item": 5 },
      end_activities: { ship: 4 },
    },
  },
};

const ocPerformance: OcelDfPerformance = {
  arcs_per_object_type: {
    order: [
      {
        source: "place order",
        target: "confirm order",
        count: 3,
        min_ms: 3.6e6,
        max_ms: 1.08e7,
        mean_ms: 7.2e6,
        median_ms: 7.2e6,
        p90_ms: 1.0e7,
      },
      {
        source: "confirm order",
        target: "ship",
        count: 2,
        min_ms: 8.64e7,
        max_ms: 1.728e8,
        mean_ms: 1.296e8,
        median_ms: 1.296e8,
        p90_ms: 1.6e8,
      },
    ],
    item: [
      {
        source: "pick item",
        target: "pack item",
        count: 4,
        min_ms: 6e5,
        max_ms: 2.4e6,
        mean_ms: 1.5e6,
        median_ms: 1.4e6,
        p90_ms: 2.2e6,
      },
      {
        source: "pack item",
        target: "ship",
        count: 4,
        min_ms: 4.32e7,
        max_ms: 1.296e8,
        mean_ms: 8.64e7,
        median_ms: 8.6e7,
        p90_ms: 1.2e8,
      },
    ],
  },
};

const meta = {
  title: "Viewers/Object-Centric DFG",
  component: OCDFGViewer,
  parameters: { frame: { mode: "canvas", height: 540 }, docs: { story: { iframeHeight: 580 } } },
} satisfies Meta<typeof OCDFGViewer>;
export default meta;

export const OCDFG: StoryObj = {
  name: "Frequency",
  render: () => <OCDFGViewer data={ocSample} />,
};

export const OCDFGPerformance: StoryObj = {
  name: "With performance",
  render: () => <OCDFGViewer data={ocSample} performance={ocPerformance} />,
};
