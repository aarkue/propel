import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ActivitySequence } from "@r4pm/components";

const meta = {
  title: "Inputs & Primitives/Activity Sequence",
  component: ActivitySequence,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ActivitySequence>;
export default meta;

export const Default: StoryObj = {
  name: "Activity Sequence",
  render: () => <ActivitySequence activities={["register request", "examine", "decide", "pay"]} />,
};
