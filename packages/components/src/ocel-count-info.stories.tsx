import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { OCELCountInfo } from "@r4pm/components";
import type { OCELTypeStats } from "@r4pm/components";

const sample: OCELTypeStats = {
  event_type_counts: {
    "place order": 120,
    "confirm order": 118,
    "pick item": 340,
    "pack item": 330,
    ship: 115,
  },
  object_type_counts: { order: 118, item: 512, package: 115 },
};

const meta = {
  title: "Viewers/OCEL Counts",
  component: OCELCountInfo,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof OCELCountInfo>;
export default meta;

export const Default: StoryObj = {
  name: "OCEL Counts",
  render: () => <OCELCountInfo data={sample} />,
};
