import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import {
  DFGViewer,
  OCDFGViewer,
  type DirectlyFollowsGraph,
  type OCDirectlyFollowsGraph,
} from "@r4pm/components";
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
  start_activities: ["register request"],
  end_activities: ["pay"],
};

const ocSample: OCDirectlyFollowsGraph = {
  object_type_to_dfg: {
    order: {
      activities: { "place order": 3, "confirm order": 3, ship: 2 },
      directly_follows_relations: [
        [["place order", "confirm order"], 3],
        [["confirm order", "ship"], 2],
      ],
      start_activities: ["place order"],
      end_activities: ["ship"],
    },
    item: {
      activities: { "pick item": 5, "pack item": 4, ship: 4 },
      directly_follows_relations: [
        [["pick item", "pack item"], 4],
        [["pack item", "ship"], 4],
      ],
      start_activities: ["pick item"],
      end_activities: ["ship"],
    },
  },
};

const meta = {
  title: "Viewers/Directly-Follows Graph",
  component: DFGViewer,
  parameters: { frame: { mode: "canvas", height: 540 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof DFGViewer>;
export default meta;

export const DFG: StoryObj = {
  name: "DFG (case-centric)",
  render: () => <DFGViewer data={sample} />,
};

export const OCDFG: StoryObj = {
  name: "OC-DFG (object-centric)",
  render: () => <OCDFGViewer data={ocSample} />,
};
